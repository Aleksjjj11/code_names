import * as path from "path";
import expressSession, {Session} from "express-session";
import connectSqlite from "connect-sqlite3";
import DatabaseService from "./services/databaseService";
import User from "./models/database_models/User";
import Constants from "./constants";
import Dictionary from "database_models/Dictionary";
import AutoCompleteData from "database_models/AutoCompleteData";

const SQLiteStore = connectSqlite(expressSession);

exports.init = function () {
    const helmet = require("helmet");
    const compression = require("compression");
    const cookieParser = require("cookie-parser");
    const express = require("express");
    const app = express();
    const limitter = require("express-rate-limit");
    const bodyParser = require("body-parser");
    const session = require("express-session");
    const sessionStore = new SQLiteStore({db: Constants.DATABASE_NAME, dir: "./", table: "sessions"});
    const crypto = require("crypto");

    app.set("view engine", "ejs");
    app.set("views", path.join("./src/views"));

    app.use(compression());

    app.use(helmet.dnsPrefetchControl());
    app.use(helmet.expectCt());
    app.use(helmet.frameguard());
    app.use(helmet.hidePoweredBy());
    app.use(helmet.hsts());
    app.use(helmet.ieNoOpen());
    app.use(helmet.noSniff());
    app.use(helmet.permittedCrossDomainPolicies());
    app.use(helmet.referrerPolicy());
    app.use(helmet.xssFilter());

    app.use(express.static(__dirname + "/public"));
    app.use(cookieParser());

    app.listen(8080);

    app.use(limitter({
        windowMs: 7000,
        max: 7,
        message: "Too many requests",
    }));

    app.use(session({
        secret: "EHETENANDAYO",
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
    }));

    const urlencodedParser = bodyParser.json();

    app.get("/", (req, res) => {
        if (!("token" in req.cookies)) {
            res.cookie("token", crypto.randomBytes(64).toString("hex"), {maxAge: 86400});
        }

        res.render("main", {login: req.session.login});
    });
    app.get("/logout", (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error("Ошибка при завершении сеанса:", err);
            }
            res.redirect("/");
        });
    });

    app.get("/register", (req, res) => {
        res.render("register", {login: req.session.login});
    });

    app.post("/register", urlencodedParser, async function (request, response) {
        let isExistsUser: boolean = await DatabaseService.isExistsUsername(request.body.login);
        if (isExistsUser) {
            response.send({
                text: "Логин занят",
                type: "err",
            });
            return;
        }

        let createdUserId = await DatabaseService.addUser(request.body.login, request.body.password);
        if (!createdUserId) {
            response.send({
                text: "Произошла ошибка при создании нового пользователя",
                type: "err",
            });
            return;
        }

        fillUserSession(request.session, request.body.login, createdUserId);

        response.send({
            type: "redirect",
            "url": "/",
        });
    });

    app.post("/lcLogin", urlencodedParser, async function (request, response) {
        let authorizeResult: User | undefined = await DatabaseService.authorize(request.body.login, request.body.password);
        if (!authorizeResult) {
            response.send({
                text: "Пользователь не найден",
                type: "err",
            });
            return;
        }

        fillUserSession(request.session, request.body.login, authorizeResult.id);

        response.send({type: "redirect", url: "/lc"});
    });

    app.post("/lcAddPac", urlencodedParser, async function (request, response) {
        await pacProcess(DatabaseService, request, response);
    });

    app.get("/lc", async (req, res) => {
        await renderLc(DatabaseService, req.session.uid, 1, req.session.login, res, Constants.MAX_WORD_LENGTH);
    });

    app.post("/checkWords", urlencodedParser, async function (request, response) {

        let count = getUniqueWordsFromString(request.body.words).length;
        let text = getTextForPacCheck(count);

        response.send(text);
    });

    app.get("/lc/:id", async (req, res) => {
        await renderLc(DatabaseService, req.session.uid, req.params.id, req.session.login, res, null);
    });

    app.get("/pac/:id", async (request, response) => {
        const results: Dictionary | undefined = await DatabaseService.getPacById(request.params.id);
        if (results) {
            let dict = results;
            let words = JSON.parse(results.words);
            dict.words = words.join(",");
            if (request.session.uid == dict.uid) {
                response.render("pacSettings", {
                    login: request.session.login,
                    dict: dict,
                    lenghtWord: Constants.MAX_WORD_LENGTH,
                });
            } else {
                response.render("pacViev", {
                    login: request.session.login,
                    dict: dict,
                    lenghtWord: Constants.MAX_WORD_LENGTH,
                });
            }
        } else {
            response.send("Не найдено");
        }
    });

    app.post("/refreshPac", urlencodedParser, async function (request, response) {
        await pacProcess(DatabaseService, request, response);
    });

    app.get("/auth", (req, res) => {
        res.render("auth", {login: req.session.login});
    });

    app.post("/autoComplete", urlencodedParser, async function (request, response) {
        let autoCompleteResults: AutoCompleteData[] | string = await DatabaseService.autoComplete(request.body.value);
        if (typeof autoCompleteResults === 'string' && autoCompleteResults === "/0") {
            response.send(autoCompleteResults);
            return;
        }
        response.send(JSON.stringify(autoCompleteResults));
    });
};

function fillUserSession(session: Session, username: string, userId: number) {
    const time = 103600000;
    // @ts-ignore
    session.login = username;
    // @ts-ignore
    session.uid = userId;
    session.cookie.expires = new Date(Date.now() + time);
    session.cookie.maxAge = time;
}


async function renderLc( dbService, uid, curPage, login, res, wordLenght) {
    if (uid) {
        let countPacs = await  dbService.getCountByUid(uid);

        let min = 1;
        let max = 1;
        let perPage = 3;
        let maxPage = Math.ceil(countPacs / perPage);
        curPage = Number.parseInt(curPage);
        let delta = 5;

        if (countPacs >= 1) {
            min = curPage - delta;
            max = curPage + delta;

            if (min < 1) {
                min = 1;
                max = min + delta * 2;
            }

            if (max > maxPage) {
                max = maxPage;
                min = max - delta * 2;
                if (min < 1) {
                    min = 1;
                }
            }
        }

        let offset = (curPage - 1) * perPage;
        let dicts = await  dbService.getDictsByUidWithPagination(uid, offset, perPage);

        res.render("lc", {
            login: login,
            dicts: dicts,
            minPage: min,
            maxPage: max,
            curPage: curPage,
            lengthWord: wordLenght,
        });
    }
}
async function pacProcess(dbService: DatabaseService, request: any, response: any): Promise<void> {

    let words: string[] = getUniqueWordsFromString(request.body.words)

    if (words.length >= Constants.MIN_WORDS_FOR_MIN_PAC && words.length <= Constants.MAX_WORDS_COUNT) {
        if ("id" in request.body) {
            await DatabaseService.refreshPacInDb(request, words, response, request.body.id);
            response.send({text: "Ваш пак обновлён!"});
        } else {
            await DatabaseService.insertPacToDb(request, words, response);
            response.send({type: 'redirect', url: '/lc/1'});
        }
    } else {
        let text;
        if (words.length < Constants.MIN_WORDS_FOR_MIN_PAC) {
            text = "Добавьте больше слов";
        } else {
            text = "Слов слишком много";
        }
        response.send({text: text, type: "err"});
    }
}

function getUniqueWordsFromString(str: string) {
    let words: string[] = str.split(",").map(x => x.trim()).filter(x => x.length > 0);
    return [...new Set(words)];
}

function getTextForPacCheck(count: number) {

    if (count < Constants.MIN_WORDS_FOR_MIN_PAC){
        return `Не хватает cлов для пака минимального размера - ${Constants.MIN_WORDS_FOR_MIN_PAC - count}`;
    }
    else if (count < Constants.MIN_WORDS_FOR_MEDIUM_PAC){
        return `Не хватает cлов для пака среднего размера - ${Constants.MIN_WORDS_FOR_MEDIUM_PAC - count}`;
    }
    else if (count < Constants.MIN_WORDS_FOR_MAX_PAC){
        return `Не хватает cлов для пака большого размера - ${Constants.MIN_WORDS_FOR_MAX_PAC - count}`;
    }
    else if (count <= Constants.MAX_WORDS_COUNT){
        return `Слов достаточно`;
    }

    return`Слов слишком много, удалите ${count - Constants.MAX_WORDS_COUNT} слов`;
}