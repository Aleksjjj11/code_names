const mysql = require('mysql')

const websocketServer = require('ws')
const fs = require('fs')
const http = require('http')

const router = require('./router')
const roomModule = require('./room')


const mysqlConnect = mysql.createConnection({
    host: "127.0.0.1",
    user: "admin",
    database: "game",
    password: "utyi8965",
})

router.init(mysqlConnect);

const server = http.createServer({
    //cert: fs.readFileSync('/etc/ssl/cn-game/ssl-bundle.crt'),
    //key: fs.readFileSync('/etc/ssl/cn-game/cn-game.key')
});
let ws = new websocketServer.Server({server})
server.listen(8082)

let rooms = new Map()
let currentRoomId = 0

ws.on('connection', function(socket, req)
{
    let token = getCookie(req.headers.cookie, 'token')
    let roomId
    let currentRoom
    let id

    socket.on('message', function(rawData)
    {
        rawData = JSON.parse(rawData)
        let type = rawData[0]
        let data = rawData[1]

        if(type === 'createRoom') {
            roomId = currentRoomId
            currentRoomId++
            rooms.set(roomId, new roomModule.Room(ws, mysqlConnect))
            currentRoom = rooms.get(roomId)
            data = data.trim()
            if(data !== '')
                id = currentRoom.createClient(token, socket, data, roomId)
        }

        if (type === 'connect') {
            let rid = parseInt(data.id)
            if(rooms.has(rid)) {
                roomId = data.id
                currentRoom = rooms.get(rid)
                data.name = data.name.trim()
                if(data.name !== '')
                    id = currentRoom.createClient(token, socket, data.name, roomId)
            }
        }


        if (type === 'reConnect') {
            let rid = parseInt(data)
            if(rooms.has(rid))
            {
                let room = rooms.get(rid)
                if(room.isStart)
                    room.clients.forEach((client, cKey) => {
                        if (client.token === token) {
                            id = cKey
                            roomId = rid
                            currentRoom = rooms.get(roomId)
                            client.socket = socket
                            room.sendData(socket, 'renderRoom', roomId)
                            let teamsForSend = room.getTeamsDataForSend()
                            room.sendData(socket, 'updateTeams', teamsForSend)
                            let cardsNoColor = room.getNoColorCards(room.cards)
                            room.sendClientCards(room.cards, cardsNoColor, room.clients[cKey])
                        }
                    })
            }
        }

        if(currentRoom !== undefined)
            id = currentRoom.processMessage(type, data, token, id, roomId, socket, ws)
    })

    socket.on('close', function()
    {
        console.log('close: '+id);
        if(currentRoom !== undefined)
        {
            if(!currentRoom.isStart)
                currentRoom.deleteClient(id)

            if(currentRoom.getCountActiveSocketClients() === 0)
                rooms.delete(roomId)
        }
    })
})


function getCookie(cookiesHeader, cname) {
    if(cookiesHeader) {
        let name = cname + "="
        let ca = cookiesHeader.split(';')
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ')
                c = c.substring(1)
            if (c.indexOf(name) === 0)
                return c.substring(name.length, c.length)
        }
    }
    return false
}
