import * as path from "path";

exports.init = function (mysqlConnect) {
    const helmet = require('helmet')
    const escape = require('escape-html')
    const compression = require('compression')
    const minify = require('express-minify')
    const cookieParser = require('cookie-parser')
    const express = require('express')
    const app = express()
    const limitter = require('express-rate-limit')
    const bodyParser = require('body-parser')
    const session = require('express-session')
    const MySQLStore = require('express-mysql-session')(session)
    const crypto = require('crypto')

    const MIN_WORDS_COUNT = 30
    const MAX_WORDS_COUNT = 2000
    const MAX_WORD_LENGTH = 60

    app.set('view engine', 'ejs')
    app.set('views', path.join('./src/views'));

    app.use(compression())

    //app.use(helmet.contentSecurityPolicy());
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

    const sessionStore = new MySQLStore({}, mysqlConnect)

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
        if (!('token' in req.cookies))
            res.cookie('token', crypto.randomBytes(64).toString('hex'), {maxAge: 86400})

        res.render('main', {login: req.session.login})
    })

    app.get('/register', (req, res) => {
        res.render('register', {login: req.session.login})
    })

    app.post('/register', urlencodedParser, function (request, response) {
        mysqlConnect.query("SELECT count (*) as count FROM users where login = ?", [
            request.body.login
        ], function (err, results, fields) {
            if (results[0].count >= 1) {
                response.send({text: 'Логин занят', type: 'err'})
            } else {
                const p = new Promise((resolve, reject) => {
                    mysqlConnect.query("INSERT INTO users VALUES(null, ?, ?, 0)", [
                        request.body.login,
                        request.body.password
                    ], function (err, results1, fields) {
                        request.session.login = request.body.login
                        request.session.uid = results1.insertId
                        let time = 103600000
                        request.session.cookie.expires = new Date(Date.now() + time)
                        request.session.cookie.maxAge = time
                        resolve(200);
                    })
                })
                p.then(() => {
                    response.send({type: 'redirect', url: '/'})
                })
            }
        })
    })

    app.post('/lcLogin', urlencodedParser, function (request, response) {
        mysqlConnect.query("SELECT * FROM users where login = ? and password = ? ", [
            request.body.login,
            request.body.password
        ], function (err, results, fields) {
            if (results.length > 0) {
                request.session.login = request.body.login
                request.session.uid = results[0].id
                let time = 103600000
                request.session.cookie.expires = new Date(Date.now() + time)
                request.session.cookie.maxAge = time
                response.send({type: 'redirect', url: '/lc'})

            } else {
                response.send({text: 'Пользователь не найден', type: 'err'})
            }
        })
    })

    app.post('/lcAddPac', urlencodedParser, function (request, response)
    {
        insertPac(MAX_WORD_LENGTH, MIN_WORDS_COUNT, MAX_WORDS_COUNT, escape, request, response, mysqlConnect, (request, words, mysqlConnect) => {
            mysqlConnect.query("INSERT INTO dicts VALUES(null, ?, ?, ?, 0)", [
                request.body.name,
                JSON.stringify(words),
                request.session.uid
            ], function (err, results1, fields) {
                response.send({type: 'redirect', url: '/lc/1'})
            })
        })


    })

    app.get('/lc', (req, res) => {
        renderLc(mysqlConnect, req.session.uid, 1, req.session.login, res, MAX_WORD_LENGTH)
    })

    app.get('/lc/:id', (req, res) => {
        renderLc(mysqlConnect, req.session.uid, req.params.id, req.session.login, res, null)
    })

    app.get('/pac/:id', (req, res) => {

        mysqlConnect.query("SELECT * FROM dicts where id = ?", [
            req.params.id
        ], function (err, results, fields) {
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
        insertPac(MAX_WORD_LENGTH, MIN_WORDS_COUNT, MAX_WORDS_COUNT, escape, request, response, mysqlConnect, (request, words, mysqlConnect) => {
            mysqlConnect.query("UPDATE dicts SET name = ?, words = ? where id = ?", [
                request.body.name,
                JSON.stringify(words),
                request.body.id
            ], function (err, results, fields) {
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
        mysqlConnect.query("SELECT id , name FROM dicts WHERE name LIKE ? ORDER BY name LIMIT 10", [
            partAuto
        ], function (err, results, fields) {
            if (results.length > 0) {
                names = JSON.stringify(results)
            } else {
                names = "/0"
            }
            response.send(names)
        })
    }) 
}


function renderLc(mysqlConnect, uid, curPage, login, res, wordLenght){
    if (uid) {
        mysqlConnect.query("SELECT count (*) as count FROM dicts where uid = ? ", [
            uid
        ], function (err, results, fields) {
            let min = 1
            let max = 1
            let countPacs = results[0].count
            let perPage = 2
            let maxPage = Math.round(countPacs / perPage)
            curPage = Number.parseInt(curPage)
            let delta = 5

            if (results[0].count >= 1) {
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

            mysqlConnect.query("SELECT * FROM dicts WHERE uid = ? ORDER BY id DESC LIMIT ?, ? ", [
                uid,
                offset,
                perPage
            ], function (err, respDicts, fields1) {
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

