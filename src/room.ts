import DatabaseService from "./services/databaseService";
import Constants from "./constants";
import WebSocket from "ws";
import Client from "models/Client";
import Team from "models/Team";
import Card from "models/Card";

const wordsLib = require("./words");

const dbService = new DatabaseService(`./${Constants.DATABASE_NAME}`);

class Room {
    private readonly ws: WebSocket;

    public timerTurn: NodeJS.Timer;
    public teams: Team[] = [];
    public clients: Client[] = [];
    public currentId: number = 0;
    public cards: Card[] = [];
    public isStart: boolean = false;
    public turnTeamId: number = 0;
    public capTurn: boolean = true;
    public adminId: number = 0;
    public countCards: number = 30;
    public roundTimer: number = 120;

    constructor(_ws: WebSocket) {
        for (let i = 0; i < 2; i++) {
            this.teams.push(this.createTeam(i));
        }

        this.ws = _ws;
    }

    public async processMessage(type: string, data: any, clientId: number, roomId: number, socket: WebSocket): Promise<number> {
        if (this.isStart) {
            if (type === "clickCard") {
                this.processClickCardMessage(data, clientId);
            }

            if (type === "setWord") {
                this.processSetWordMessage(clientId, data.word, data.cardIds);
            }

            return clientId;
        }

        if (clientId === this.adminId) {
            if (type === "startGame") {
                const isSuccessfullyProcessed = await this.processStartGameMessage(data.packId, data.countCards, data.roundTimer, socket);
                if (!isSuccessfullyProcessed) {
                    this.sendData(socket, "setElement", {
                        id: "packSelectErr",
                        mes: "Pack id not found",
                    });
                }
            }

            if (type === "addTeam") {
                this.processAddTeamMessage();
            }

            if (type === "deleteTeam") {
                this.processDeleteTeamMessage();
            }
        }

        if (type === "setCaptain") {
            this.processSetCaptainMessage(clientId, data);
        }

        if (type === "setPlayer") {
            this.processSetPlayerMessage(clientId, data);
        }

        return clientId;
    }

    public getCountActiveSocketClients(): number {
        return this.clients
            .filter(client => client.socket.readyState == 1)
            .length;
    }

    public deleteClient(clientId: number): void {
        const teamId = this.clients[clientId].teamId;
        this.clients.splice(clientId, 1);
        this.updateTeam(this.teams[teamId]);
    }

    public startRoom(words: string[], socket: WebSocket): void {
        if (words.length < this.countCards) {
            this.sendData(socket, "setElement", {
                id: "packSelectErr",
                mes: "Pack contain only " + words.length + " words",
            });
            return;
        }

        //TODO CHECK: Maybe this.ws can be used in the startGame method and passing websocket can be deleted.
        this.startGame(this.ws);
        this.shuffle(words);

        this.cards = [];

        const possibleCountCards = this.countCards - 1; //One card is reserved for black card that finishes a game
        const countParts = this.teams.length + 1; //One part is reserved for neutral cards (white), others for teams
        const cardsForTeam = Math.floor(possibleCountCards / countParts);
        const whiteCards = (possibleCountCards % countParts) + cardsForTeam;

        let num = 0;

        this.teams.forEach(team => {
            for (let i = 0; i < cardsForTeam; i++) {
                this.cards.push({
                    status: 1,
                    text: words[num],
                    color: team.color,
                    teamId: team.id,
                } as Card);
                num++;
            }
        }, this);

        for (let i = 0; i < whiteCards; i++) {
            this.cards.push({
                status: 1,
                text: words[num],
                color: "lightgrey",
                teamId: Constants.WHITE_CARD_TEAM,
            } as Card);
            num++;
        }

        this.cards.push({
            status: 1,
            text: words[num],
            color: "black",
            teamId: Constants.BLACK_CARD_TEAM,
        } as Card);
        this.shuffle(this.cards);

        const cardsNoColor: Card[] = this.getNoColorCards(this.cards);
        this.clients.forEach(client => {
            this.sendClientCards(this.cards, cardsNoColor, client);
        }, this);

        this.updateTeamsAll();

        this.teams.forEach(team => {
            team.countCardsToOpen = cardsForTeam;
            this.sendDataAll("countCards", {id: team.id, countCard: team.countCardsToOpen});
        }, this);
    }

    public createClient(token: string, socket: WebSocket, nickname: string, roomId: number): number {
        const clientId = this.currentId;
        this.clients[clientId] = {
            token: token,
            socket: socket,
            nickName: "",
            teamId: 0,
            isCaptain: false,
        } as Client;
        this.currentId++;

        this.clients[clientId].nickName = nickname;

        if (this.adminId === clientId) {
            this.sendData(socket, "renderRoomAdmin", roomId);
        } else {
            this.sendData(socket, "renderRoom", roomId);
        }

        this.updateTeamsAll();

        return clientId;
    }

    public skipTurn(ws: WebSocket): void {
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

    public setTimer(ws: WebSocket): void {
        clearInterval(this.timerTurn);
        this.timerTurn = setInterval(classPointer => {
            classPointer.skipTurn(ws);
        }, this.roundTimer * 1000, this);
    }

    public stopTimer(): void {
        clearInterval(this.timerTurn);
    }

    public sendData(socket: WebSocket, type: string, data: any): void {
        socket.send(JSON.stringify([type, data]));
    }

    public sendDataAll(type: string, data: any): void {
        this.clients.forEach(client => {
            this.sendData(client.socket, type, data);
        }, this);
    }

    public getTeamDataForSend(team: Team): any {
        //TODO create model for this structure
        let teamForSend = {
            id: team.id,
            color: team.color,
            clients: new Array<Client>(),
            words: new Array<string>(),
        };

        team.words.forEach(wordRecord => {
            teamForSend.words.push(`${wordRecord.word} ${wordRecord.cardIds.length}`);
        });

        this.clients.forEach(client => {
            if (client.teamId === team.id) {
                teamForSend.clients.push({
                    nickName: client.nickName,
                    isCaptain: client.isCaptain
                } as Client);
            }
        });

        return teamForSend;
    }

    public getTeamsDataForSend(): any {
        let teamsForSend = [];
        this.teams.forEach(team => {
            // @ts-ignore
            teamsForSend[team.id] = this.getTeamDataForSend(team);
        }, this);
        return teamsForSend;
    }

    public updateTeamsAll(): void {
        let teamsForSend = this.getTeamsDataForSend();
        this.sendDataAll("updateTeams", teamsForSend);
    }

    public updateTeam(team: Team): void {
        let teamForSend = this.getTeamDataForSend(team);
        this.sendDataAll("updateTeam", teamForSend);
    }

    public sendClientCards(cards: Card[], cardsNoColor: Card[], client: Client): void {
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

    getNoColorCards(cards: Card[]): Card[] {
        let cardsNoColor: Card[] = this.cloneObject(cards);
        cardsNoColor.forEach(card => {
            if (card.status !== 0) {
                card.color = "";
            }
        });
        return cardsNoColor;
    }

    shuffle(array: any[]): void {
        array.sort(() => Math.random() - 0.5);
    }

    cloneObject(obj: any): any {
        return JSON.parse(JSON.stringify(obj));
    }

    getCountCaptainsInTeam(teamId: number): number {
        let count = 0;
        this.clients.forEach(function (client) {
            if ((client.teamId === teamId) && client.isCaptain) {
                count++;
            }
        });
        return count;
    }

    startGame(ws: WebSocket): void {
        this.setTimer(ws);
        this.isStart = true;
        this.cards = [];
        this.turnTeamId = 0;
        this.capTurn = true;
        this.teams.forEach(function (team: Team) {
            team.words = new Array<Word>();
        });
    }

    stopGame(tidWin: number): void {
        this.stopTimer();
        this.isStart = false;
        this.sendDataAll("stopGame", tidWin);
    }

    validateStartGame(countCards: number, roundTimer: number) {
        return countCards >= 25 && countCards <= 35 && roundTimer >= 60 && roundTimer <= 140;
    }

    createTeam(teamId: number): Team {
        let colors: string[] = ["FireBrick", "RoyalBlue", "ForestGreen", "Goldenrod", "MediumOrchid"];
        return {
            id: teamId,
            color: colors[teamId],
            words: new Array<Word>(),
        } as Team;
    }
    
    private processClickCardMessage(cardId: number, clientId: number): void {
        if (cardId in this.cards) {
            let card: Card = this.cards[cardId];
            let client: Client = this.clients[clientId];

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

                        this.updateTeam(this.teams[client.teamId]);

                        let countTeamCardsToOpen: number = --this.teams[card.teamId].countCardsToOpen;
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
    
    private processSetWordMessage(clientId: number, word: string, cardIds: number[]): void {
        let client = this.clients[clientId];
        let isWrongColor = false;

        cardIds.forEach(function (id: number) {
            if (this.cards[id].teamId !== client.teamId) {
                isWrongColor = true;
            }
        }, this);

        word = word?.trim();
        if (!word || !cardIds?.length) {
            console.log("Error occured in processSetWordMessage method: word or cardId invalid value");
            return;
        }

        if (client.isCaptain
            && this.capTurn
            && this.turnTeamId === client.teamId
            && !isWrongColor) {
            let teamId = client.teamId;
            let team = this.teams[teamId];
            team.words.push({
                word: word,
                cardIds: cardIds
            } as Word);
            this.updateTeam(team);
            this.skipTurn(this.ws);
        }
    }

    private async processStartGameMessage(packId: number, countCards: number, roundTimer: number, socket: WebSocket): Promise<boolean> {
        this.countCards = countCards;
        this.roundTimer = roundTimer;

        if (!this.validateStartGame(this.countCards, this.roundTimer)) {
            console.log(`validation of start game failed: countCards: ${this.countCards}, roundTimer: ${this.roundTimer}`);
            return false;
        }

        const words = await this.prepareWordListByPackId(packId);
        if (words.length == 0) {
            console.log(`Couldn't get words to start game: packId: ${packId}`);
            return false;
        }

        this.startRoom(words, socket);
        return true;
    }

    private processAddTeamMessage(): void {
        if (this.teams.length < Constants.MAX_TEAMS) {
            this.teams.push(this.createTeam(this.teams.length));
            this.updateTeamsAll();
        }
    }

    private processDeleteTeamMessage(): void {
        const countTeams = this.teams.length;
        if (countTeams > 2) {
            const deletedTeam = this.teams.pop();

            this.clients.filter(client => client.teamId == deletedTeam?.id)
                .forEach(function (client) {
                    client.teamId = 0;
                });
        }

        this.updateTeamsAll();
    }

    private processSetCaptainMessage(clientId: number, teamId: number): void {
        if (teamId in this.teams) {
            if (this.getCountCaptainsInTeam(teamId) < 1) {
                this.clients[clientId].teamId = teamId;
                this.clients[clientId].isCaptain = true;
                this.updateTeamsAll();
            }
        }
    }

    private processSetPlayerMessage(clientId: number, teamId: number): void {
        if (teamId in this.teams) {
            this.clients[clientId].teamId = teamId;
            this.clients[clientId].isCaptain = false;
            this.updateTeamsAll();
        }
    }

    private async prepareWordListByPackId(packId: number): Promise<string[]> {
        if (!packId || packId < 1) {
            return wordsLib.getWords();
        }

        const pack = await dbService.getPacById(packId);
        if (!pack) {
            return new Array<string>(0);
        }

        return JSON.parse(pack.words);
    }
}

exports.Room = Room;