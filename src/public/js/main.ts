let cards: any[] = [];
let teams: any[] = [];
let selectCards: number[] = [];
let myCaptainStatus: boolean = false;
let myTeam = 0;
let currentTurnId = 0;
let defaultTimerValue = 0;
let timerRef;
let socket: WebSocket;
let roomId: string;

renderLogin();
createWebSocket();

function createWebSocket() {
    socket = new WebSocket("ws://localhost:8082");//new WebSocket("wss://"+location.host)

    socket.onmessage = function (event: MessageEvent<any>) {
        let rawData = JSON.parse(event.data);
        let type: string = rawData[0];
        let data = rawData[1];

        if (type === "renderRoom") {
            roomId = data;
            renderRoom(roomId);
        }

        if (type === "renderRoomAdmin") {
            roomId = data;
            renderRoom(roomId);
            renderSettings();
        }

        if (type === "closeCard") {
            let card: any = cards[data.id];
            card.color = data.color;
            card.status = 0;
        }

        if (type === "countCards") {
            teams[data.id].countCardsToOpen = data.countCard;
        }

        if (type === "updateTeams") {
            teams = data;
        }

        if (type === "updateTeam") {
            let team: any = teams[data.id];
            team.words = data.words;
            team.color = data.color;
            team.clients = data.clients;
            team.id = data.id;
        }

        if (type === "startTable") {
            cards = data.cards;
            myCaptainStatus = data.isCaptain;
            myTeam = data.teamId;
            defaultTimerValue = data.timer;
            renderSettings(true);
            renderSendWord();
            setTimer();
            getById("winContainer")!.innerHTML = "";
        }

        if (type === "changeTurn") {
            selectCards = [];
            currentTurnId = data;
            setTimer();
        }

        if (type === "stopGame") {
            renderSettings();
            renderSendWord(true);
            getById("winContainer")!.innerHTML = "<h3 style=\"color: " + teams[data].color + ";\">" + data + " team win</h3>";
        }

        if (type === "setElement") {
            getById(data.id)!.innerHTML = data.mes;
        }

        renderTeams(teams);
        renderCards();
    };
}

function renderTeams(teams) {
    let content = "";
    teams.forEach(function (team: any, key) {
        let divTeam = createElement("div");
        divTeam.className = "team";
        if (!!team.color) {
            divTeam.style.backgroundColor = team.color;
        }
        if (currentTurnId === key) {
            divTeam.style.border = "4px solid black";
        }

        let teamDivContent = "";

        let caps = "";
        let pls = "";
        team.clients.forEach(function (client) {
            if (client.isCaptain) {
                caps += "<div> " + client.nickName + "</div>";
            } else {
                pls += "<div> " + client.nickName + "</div>";
            }
        });

        if (caps === "") {
            caps = "Captain";
        }

        if (pls === "") {
            pls = "Payer";
        }

        //if(!('countCardsToOpen' in team))
        team.countCardsToOpen = 0;

        teamDivContent += "<div class=\"capCont\" onclick=\"setCaptain(" + key + ")\">" + caps + "</div>";
        teamDivContent += "<div class=\"plCont\" onclick=\"setPlayer(" + key + ")\">" + pls + "</div>";
        teamDivContent += "<div class=\"mt-2\">Cards: " + team.countCardsToOpen + "</div>";

        teamDivContent += "<div class=\"mt-3\">Words:</div>";
        team.words.forEach(function (word) {
            teamDivContent += "<div>" + word + "</div>";
        });

        divTeam.innerHTML = teamDivContent;
        content += divTeam.outerHTML;
    });

    let teamContainer = getById("teamContainer");
    teamContainer!.innerHTML = content;
}

function renderCards() {
    let table = getById("table")!;
    let content = "";
    cards.forEach(function (card: any, cardKey: number) {
        let div = createElement("div");
        if (card.status == 0) {
            div.className = "closeCard";
        }
        if (!!card.color) {
            div.style.backgroundColor = card.color;
        } else {
            card.color = "#F0EAD6"
        }
        if (card.color === "black") {
            div.style.color = "#F0EAD6";
        }
        if (selectCards.indexOf(cardKey) >= 0) {
            div.style.border = "3px solid black";
        } else {
            div.style.border = "3px solid " + card.color;
        }
        div.innerHTML = card.text;
        content += div.outerHTML;
    });
    table.innerHTML = content;

    if (!myCaptainStatus) {
        getAllCards(table).forEach(function (element, cardKey: number) {
            element.onclick = function () {
                sendData(socket, "clickCard", cardKey);
            };
        });
    } else {
        getAllCards(table).forEach(function (element, cardKey: number) {
            if (teams[myTeam].color === cards[cardKey].color) {
                element.onclick = function () {
                    let index = selectCards.indexOf(cardKey);
                    if (index >= 0) {
                        selectCards.splice(index, 1);
                    } else {
                        selectCards.push(cardKey);
                    }
                    renderCards();
                };
            }
        });
    }
}

function setTimer() {
    if (defaultTimerValue) {
        let seconds: number = defaultTimerValue;
        let timerDiv = getById("timer");
        timerDiv!.innerHTML = seconds.toString();

        clearInterval(timerRef);
        timerRef = setInterval(function () {
            seconds--;
            timerDiv!.innerHTML = seconds.toString();
            if (seconds <= 0) {
                clearInterval(timerRef);
            }
        }, 1000);
    }
}

function getAllCards(table) {
    return table.querySelectorAll("div");
}

function sendData(socket, type, data) {
    socket.send(JSON.stringify([type, data]));
}

function connectToServer() {
    let nickname = (getById("nickname") as HTMLInputElement).value;
    let roomId = (getById("roomId") as HTMLInputElement).value;
    sendData(socket, "connect", {name: nickname, id: roomId});
}

function createRoom() {
    let nickname = (getById("nickname") as HTMLInputElement).value;
    console.log(nickname);
    sendData(socket, "createRoom", nickname);
}

function reConnectToServer() {
    document.cookie = "";
    let roomId = (getById("roomId") as HTMLInputElement).value;
    sendData(socket, "reConnect", roomId);
}

function addTeam() {
    sendData(socket, "addTeam", "");
}

function deleteTeam() {
    sendData(socket, "deleteTeam", "");
}

function startGame() {
    let roundTimer = (document.querySelector("input[name=roundTimer]:checked") as HTMLInputElement).value;
    let countCards = (document.querySelector("input[name=countCards]:checked") as HTMLInputElement).value;

    let packId;
    if ((getById("selectPackType") as HTMLInputElement).checked) {
        packId = (getById("packIdInput") as HTMLInputElement).value;
    } else {
        packId = -1;
    }

    sendData(socket, "startGame", {
        roundTimer: roundTimer,
        countCards: countCards,
        packId: packId,
    });
}

function setCaptain(teamId) {
    sendData(socket, "setCaptain", teamId);
}

function setPlayer(teamId) {
    sendData(socket, "setPlayer", teamId);
}

function setWord() {
    let word = (getById("wordInput") as HTMLInputElement).value;
    sendData(socket, "setWord", {word: word, cardIds: selectCards});
}

function dd(val) {
    console.log(val);
}

