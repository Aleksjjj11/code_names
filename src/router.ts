import * as path from "path";
import { Database } from 'sqlite3';
import expressSession, {Session} from 'express-session';
import connectSqlite from 'connect-sqlite3';
import DatabaseService from "./services/databaseService";
import User from "./models/database_models/User";

const SQLiteStore = connectSqlite(expressSession);

exports.init = function () {
    const dbPath = 'database.db'
    const helmet = require('helmet')
    const escape = require('escape-html')
    const compression = require('compression')
    const cookieParser = require('cookie-parser')
    const express = require('express')
    const app = express()
    const limitter = require('express-rate-limit')
    const bodyParser = require('body-parser')
    const session = require('express-session')
    const sessionStore = new SQLiteStore({ db: dbPath, dir: './', table: 'sessions' });
    const db = new Database(`./${dbPath}`);
    const crypto = require('crypto')
    const MIN_WORDS_COUNT = 30
    const MAX_WORDS_COUNT = 2000
    const MAX_WORD_LENGTH = 60
    const dbService: DatabaseService = new DatabaseService(`./${dbPath}`);

    app.set('view engine', 'ejs')
    app.set('views', path.join('./src/views'));

    app.use(compression())

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

    app.use(express.static(__dirname + '/public'))
    app.use(cookieParser())

    app.listen(8080)

    app.use(limitter({
        windowMs: 7000,
        max: 7,
        message: "Too many requests"
    }))

    app.use(session({
        secret: 'EHETENANDAYO',
        store: sessionStore,
        resave: false,
        saveUninitialized: false
    }));

    const urlencodedParser = bodyParser.json()

    app.get('/', (req, res) => {
        if (!('token' in req.cookies)) {
            res.cookie('token', crypto.randomBytes(64).toString('hex'), {maxAge: 86400})
        }

        res.render('main', {login: req.session.login})
    })

    app.get('/register', (req, res) => {
        res.render('register', {login: req.session.login})
    })

    app.post('/register', urlencodedParser, async function (request, response) {
        let isExistsUser: boolean = await dbService.isExistsUsername(request.body.login);
        if (isExistsUser) {
            response.send({
                text: 'Логин занят',
                type: 'err'
            });
            return;
        }

        let createdUserId = await dbService.addUser(request.body.login, request.body.password);
        if (!createdUserId) {
            response.send({
                text: 'Произошла ошибка при создании нового пользователя',
                type: 'err'
            });
            return;
        }

        fillUserSession(request.session, request.body.login, createdUserId);

        response.send({
            type: 'redirect',
            'url': '/'
        });
    })

    app.post('/lcLogin', urlencodedParser, async function (request, response) {
        let authorizeResult: User | undefined = await dbService.authorize(request.body.login, request.body.password);
        if (!authorizeResult) {
            response.send({
                text: 'Пользователь не найден',
                type: 'err'
            });
            return;
        }

        fillUserSession(request.session, request.body.login, authorizeResult.id);

        response.send({type: 'redirect', url: '/lc'});
    })

    app.post('/lcAddPac', urlencodedParser, function (request, response) {
        insertPac(MAX_WORD_LENGTH, MIN_WORDS_COUNT, MAX_WORDS_COUNT, escape, request, response, db, (request, words, mysqlConnect) => {
            db.run("INSERT INTO dicts VALUES(null, ?, ?, ?, 0)", request.body.name,
                JSON.stringify(words),
                request.session.uid, function(err, results1, fields) {
                response.send({type: 'redirect', url: '/lc/1'})
            })
        })


    })

    app.get('/lc', (req, res) => {
        renderLc(db, req.session.uid, 1, req.session.login, res, MAX_WORD_LENGTH)
    })

    app.get('/lc/:id', (req, res) => {
        renderLc(db, req.session.uid, req.params.id, req.session.login, res, null)
    })

    app.get('/pac/:id', (req, res) => {

        db.get("SELECT * FROM dicts where id = ?", req.params.id, (err, results, fields) => {

            if (results.length > 0) {
                let dict
                dict = results[0]
                let words = JSON.parse(dict.words)
                dict.words = ""
                words.forEach((word) => {
                    dict.words += word + ","
                })
                dict.words = dict.words.slice(0, -1)
                if (req.session.uid == dict.uid) {
                    res.render('pacSettings', {login: req.session.login, dict: dict, lenghtWord: MAX_WORD_LENGTH});
                } else {
                    res.render('pacViev', {login: req.session.login, dict: dict, lenghtWord: MAX_WORD_LENGTH});
                }
            }
        })

    })

    app.post('/refreshPac', urlencodedParser, function (request, response) {
        insertPac(MAX_WORD_LENGTH, MIN_WORDS_COUNT, MAX_WORDS_COUNT, escape, request, response, db, (request, words, mysqlConnect) => {
            db.run("UPDATE dicts SET name = ?, words = ? where id = ?", request.body.name,
                JSON.stringify(words),
                request.body.id, function(err, results, fields) {
                response.send({text: "Пак обновлён"})
            })
        })
    })

    app.get('/auth', (req, res) => {
        res.render('auth', {login: req.session.login})
    })

    app.post('/autoComplete', urlencodedParser, function (request, response) {
        let names
        let partAuto = "%" + request.body.value + "%"
        db.all("SELECT id , name FROM dicts WHERE name LIKE ? ORDER BY name LIMIT 10", partAuto, (err, results, fields) => {

            if (results.length > 0) {
                names = JSON.stringify(results)
            } else {
                names = "/0"
            }
            response.send(names)
        })
    }) 
}

function fillUserSession(session: Session, username: string, userId: number) {
    const time = 103600000;
    // @ts-ignore
    session.login = username;
    // @ts-ignore
    session.uid = userId;
    session.cookie.expires = new Date(Date.now() + time);
    session.cookie.maxAge = time;
}


function renderLc(db, uid, curPage, login, res, wordLenght){
    if (uid) {
        db.get("SELECT count (*) as count FROM dicts where uid = ? ", uid, (err, results, fields) => {

            let min = 1
            let max = 1
            console.log(results)
            let countPacs = results.count
            let perPage = 2
            let maxPage = Math.round(countPacs / perPage)
            curPage = Number.parseInt(curPage)
            let delta = 5

            if (results.count >= 1) {
                min = curPage - delta
                max = curPage + delta

                if (min < 1) {
                    min = 1
                    max = min + delta * 2
                }

                if (max > maxPage) {
                    max = maxPage
                    min = max - delta * 2
                    if (min < 1)
                        min = 1
                }
            }

            let offset = (curPage - 1) * perPage

            db.all("SELECT * FROM dicts WHERE uid = ? ORDER BY id DESC LIMIT ?, ? ", uid, offset, perPage, (err, respDicts, fields1) => {

                res.render('lc', {
                    login: login,
                    dicts: respDicts,
                    minPage: min,
                    maxPage: max,
                    curPage: curPage,
                    lenghtWord: wordLenght
                })
            })
        })
    }

}

function insertPac(MAX_WORD_LENGTH, MIN_WORDS_COUNT, MAX_WORDS_COUNT, escape, request, response, mysqlConnect, msqlQuery) {
    {
        let rawWords = escape(request.body.words)
        rawWords = rawWords.split(',')
        let words: string[] = [];
        rawWords.forEach((rawWord) => {
            rawWord = rawWord.trim()
            if ((rawWord.length > 0) && (rawWord.length < MAX_WORD_LENGTH)) {
                let coincidence = false
                words.forEach((word) => {
                    if ((word === rawWord)) {
                        coincidence = true
                    }
                })
                if (!coincidence)
                    words.push(rawWord)
            }
        })
        if (words.length >= MIN_WORDS_COUNT && words.length <= MAX_WORDS_COUNT)
            msqlQuery(request, words, mysqlConnect)
        else {
            let text
            if (words.length < MIN_WORDS_COUNT) {
                text = 'Добавьте больше слов'
            } else {
                text = 'Слов слишком много'
            }
            response.send({text: text, type: 'err'})
        }
    }


}

