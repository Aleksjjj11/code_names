import DatabaseService from "./services/databaseService";
import Constants from "./constants";
import WebSocket from "ws";

const wordsLib = require("./words");

const dbService = new DatabaseService(`./${Constants.DATABASE_NAME}`);

class Room {
    timerTurn;
    teams: Team[] = [];
    clients: Client[] = [];
    currentId = 0;
    cards: Card[] = [];
    isStart = false;
    turnTeamId = 0;
    capTurn = true;
    adminId = 0;
    countCards = 25;
    roundTimer = 120;
    ws: WebSocket;

    constructor(_ws: WebSocket) {
        for (let i = 0; i < 2; i++) {
            this.teams[i] = this.createTeam(i);
        }

        this.ws = _ws;
    }

    async processMessage(type, data, token, id, roomId, socket) {
        if (this.isStart) {
            if (type === "clickCard") {
                let cardId = data;

                if (cardId in this.cards) {
                    let card: Card = this.cards[cardId];
                    let client: Client = this.clients[id];

                    if (client.teamId === this.turnTeamId && !this.capTurn && card.status === 1 && !client.isCaptain) {
                        card.status = 0;
                        this.sendDataAll("closeCard", {id: cardId, color: card.color});
                        if (card.teamId === Constants.BLACK_CARD_TEAM) {
                            this.stopGame(client.teamId);
                        } else {
                            if (card.teamId === Constants.WHITE_CARD_TEAM) {
                                this.skipTurn(this.ws);
                            } else {
                                this.teams.forEach(function (team) {
                                    team.words.forEach(function (wordRecord) {
                                        let index = wordRecord.cardIds.indexOf(cardId);
                                        if (index >= 0) {
                                            wordRecord.cardIds.splice(index, 1);
                                        }
                                    });
                                });

                                if (client.teamId === card.teamId) {
                                    let allWordsFind = true;
                                    this.teams[client.teamId].words.forEach(function (wordRecord) {
                                        if (wordRecord.cardIds.length !== 0) {
                                            allWordsFind = false;
                                        }
                                    });
                                    if (allWordsFind) {
                                        this.skipTurn(this.ws);
                                    }
                                } else {
                                    this.skipTurn(this.ws);
                                }

                                this.updateTeam(this.ws, this.teams[client.teamId], client.teamId);

                                let countTeamCardsToOpen = --this.teams[card.teamId].countCardsToOpen;
                                this.sendDataAll("countCards", {id: card.teamId, countCard: countTeamCardsToOpen});
                            }
                        }

                        this.teams.forEach(function (team, tKey) {
                            let activeCards = 0;
                            this.cards.forEach(function (card) {
                                if (card.teamId === tKey && card.status === 1) {
                                    activeCards++;
                                }
                            });
                            if (activeCards === 0) {
                                this.stopGame(tKey);
                            }
                        }, this);
                    }
                }
            }

            if (type === "setWord") {
                data.word = data.word.trim();
                let client = this.clients[id];

                let isWrongColor = false;
                console.log(`client.teamId: ${client.teamId}`);
                data.cardIds.forEach(function (id) {
                    if (this.cards[id].teamId !== client.teamId) {
                        isWrongColor = true;
                    }
                }, this);

                if (data.cardIds.length !== 0
                    && data.word.length !== 0
                    && client.isCaptain
                    && this.capTurn
                    && this.turnTeamId === client.teamId
                    && !isWrongColor) {
                    let tid = client.teamId;
                    let team = this.teams[tid];
                    team.words.push(data);
                    this.updateTeam(this.ws, team, tid);
                    this.skipTurn(this.ws);
                }
            }
        } else {
            if (id === this.adminId) {
                if (type === "startGame") {
                    let packId = data.packId;

                    this.countCards = data.countCards;
                    this.roundTimer = data.roundTimer;

                    if (this.validateStartGame(this.countCards, this.roundTimer)) {
                        if (packId === -1 || packId === "") {
                            this.startRoom(wordsLib.getWords(), socket);
                        } else {
                            const pack = await dbService.getPacById(packId);
                            if (!pack) {
                                this.sendData(socket, "setElement", {
                                    id: "packSelectErr",
                                    mes: "Pack id not found",
                                });
                                return;
                            }

                            let words = JSON.parse(pack.words);
                            this.startRoom(words, socket);
                        }
                    }
                }

                if (type === "addTeam") {
                    if (this.teams.length < Constants.MAX_TEAMS) {
                        this.teams.push(this.createTeam(this.teams.length));
                        this.updateTeamsAll(this.ws);
                    }
                }

                if (type === "deleteTeam") {
                    let len = this.teams.length;
                    if (len > 2) {
                        this.teams.pop();
                        let lastKey = len - 1;

                        this.clients.forEach(function (client) {
                            if (client.teamId === lastKey) {
                                client.teamId = 0;
                            }
                        });
                    }

                    this.updateTeamsAll(this.ws);
                }
            }

            if (type === "setCaptain") {
                let client = this.clients[id];
                if (this.getCountCaptainsInTeam(data) < 1 && data in this.teams) {
                    client.teamId = data;
                    client.isCaptain = true;
                    this.updateTeamsAll(this.ws);
                }
            }

            if (type === "setPlayer") {
                if (data in this.teams) {
                    this.clients[id].teamId = data;
                    this.clients[id].isCaptain = false;
                    this.updateTeamsAll(this.ws);
                }
            }
        }

        return id;
    }

    getCountActiveSocketClients() {
        let count = 0;
        this.clients.forEach((client) => {
            if (client.socket.readyState === 1) {
                count++;
            }
        });
        return count;
    }

    deleteClient(id) {
        let tid = this.clients[id].teamId;
        this.clients.splice(id, 1);
        this.updateTeam(this.ws, this.teams[tid], tid);
    }

    startRoom(words, socket) {
        if (words.length >= this.countCards) {
            this.startGame(this.ws);
            this.shuffle(words);

            this.cards = [];
            let cardsForTeam = Math.floor((this.countCards - 1) / (this.teams.length + 1));
            let whiteCards = ((this.countCards - 1) % (this.teams.length + 1)) + cardsForTeam;
            let num = 0;
            this.teams.forEach(function (team, tKey) {
                for (let i = 0; i < cardsForTeam; i++) {
                    this.cards.push({
                        status: 1,
                        text: words[num],
                        color: team.color,
                        teamId: tKey,
                    });
                    num++;
                }
            }, this);
            for (let i = 0; i < whiteCards; i++) {
                this.cards.push({
                    status: 1,
                    text: words[num],
                    color: "lightgrey",
                    teamId: Constants.WHITE_CARD_TEAM,
                });
                num++;
            }
            this.cards.push({
                status: 1,
                text: words[num],
                color: "black",
                teamId: Constants.BLACK_CARD_TEAM,
            });
            this.shuffle(this.cards);


            let cardsNoColor = this.getNoColorCards(this.cards);
            this.clients.forEach(function (client, clientKey) {
                this.sendClientCards(this.cards, cardsNoColor, client);
            }, this);

            this.updateTeamsAll(this.ws);

            this.teams.forEach(function (team, tKey) {
                team.countCardsToOpen = cardsForTeam;
                this.sendDataAll("countCards", {id: tKey, countCard: team.countCardsToOpen});
            }, this);
        } else {
            this.sendData(socket, "setElement", {
                id: "packSelectErr",
                mes: "Pack contain only " + words.length + " words",
            });
        }
    }

    createClient(token, socket, nickname, roomId) {
        let id = this.currentId;
        this.clients[id] = {
            token: token,
            socket: socket,
            nickName: "",
            teamId: 0,
            isCaptain: false,
        } as Client;
        this.currentId++;

        this.clients[id].nickName = nickname;

        if (this.adminId === id) {
            this.sendData(socket, "renderRoomAdmin", roomId);
        } else {
            this.sendData(socket, "renderRoom", roomId);
        }

        this.updateTeamsAll(this.ws);

        return id;
    }

    skipTurn(ws) {
        if (!this.capTurn) {
            if (this.turnTeamId === this.teams.length - 1) {
                this.turnTeamId = 0;
            } else {
                this.turnTeamId++;
            }
        }
        this.capTurn = !this.capTurn;
        this.sendDataAll("changeTurn", this.turnTeamId);
        this.setTimer(ws);
    }

    setTimer(ws) {
        clearInterval(this.timerTurn);
        this.timerTurn = setInterval(function (classPointer) {
            classPointer.skipTurn(ws);
        }, this.roundTimer * 1000, this);
    }

    stopTimer() {
        clearInterval(this.timerTurn);
    }

    sendData(socket, type, data) {
        socket.send(JSON.stringify([type, data]));
    }

    sendDataAll(type, data) {
        this.clients.forEach(function (client) {
            this.sendData(client.socket, type, data);
        }, this);
    }

    getTeamDataForSend(team, tid) {
        let teamForSend = {
            id: tid,
            color: team.color,
            clients: new Array<Client>(),
            words: new Array<string>(),
        };

        team.words.forEach(function (wordRecord) {
            teamForSend.words.push(wordRecord.word + " " + wordRecord.cardIds.length);
        });

        this.clients.forEach(function (client) {
            if (client.teamId === tid) {
                teamForSend.clients.push({nickName: client.nickName, isCaptain: client.isCaptain} as Client);
            }
        });

        return teamForSend;
    }

    getTeamsDataForSend() {
        let teamsForSend = [];
        this.teams.forEach(function (team, teamId) {
            // @ts-ignore
            teamsForSend[teamId] = this.getTeamDataForSend(team, teamId);
        }, this);
        return teamsForSend;
    }

    updateTeamsAll(ws) {
        let teamsForSend = this.getTeamsDataForSend();
        this.sendDataAll("updateTeams", teamsForSend);
    }

    updateTeam(ws, team, tid) {
        let teamForSend = this.getTeamDataForSend(team, tid);
        this.sendDataAll("updateTeam", teamForSend);
    }

    sendClientCards(cards, cardsNoColor, client) {
        if (client.isCaptain) {
            this.sendData(client.socket, "startTable", {
                cards: cards,
                teamId: client.teamId,
                isCaptain: client.isCaptain,
                timer: this.roundTimer,
            });
        } else {
            this.sendData(client.socket, "startTable", {
                cards: cardsNoColor,
                teamId: client.teamId,
                isCaptain: client.isCaptain,
                timer: this.roundTimer,
            });
        }
    }

    getNoColorCards(cards) {
        let cardsNoColor = this.cloneObject(cards);
        cardsNoColor.forEach(function (card) {
            if (card.status !== 0) {
                delete card.color;
            }
        });
        return cardsNoColor;
    }

    shuffle(array) {
        array.sort(() => Math.random() - 0.5);
    }

    cloneObject(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    getCountCaptainsInTeam(teamId) {
        let count = 0;
        this.clients.forEach(function (client) {
            if ((client.teamId === teamId) && client.isCaptain) {
                count++;
            }
        });
        return count;
    }

    startGame(ws) {
        this.setTimer(ws);
        this.isStart = true;
        this.cards = [];
        this.turnTeamId = 0;
        this.capTurn = true;
        this.teams.forEach(function (team: Team) {
            team.words = new Array<Word>();
        });
    }

    stopGame(tidWin) {
        this.stopTimer();
        this.isStart = false;
        this.sendDataAll("stopGame", tidWin);
    }

    validateStartGame(countCards, roundTimer) {
        return countCards >= 25 && countCards <= 50 && roundTimer >= 60 && roundTimer <= 140;
    }

    createTeam(i): Team {
        let colors: string[] = ["FireBrick", "RoyalBlue", "ForestGreen", "Goldenrod", "MediumOrchid"];
        return {
            color: colors[i],
            words: new Array<Word>(),
        } as Team;
    }
}

exports.Room = Room;