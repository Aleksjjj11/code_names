function getById(val) {
    return document.getElementById(val);
}

function getBySelector(val) {
    return document.querySelectorAll(val);
}

function createElement(tag) {
    return document.createElement(tag);
}

function replaceApp(html) {
    getById("app")!.innerHTML = html;
}

function renderLoader() {
    replaceApp(`
        <div class="d-flex justify-content-center">
          <div class="spinner-border" role="status">
          </div>
          <strong>Loading...</strong>
        </div>
    `);
}

function renderLogin() {
    replaceApp(`

        <div class="row text-center">
            <div class="col-3 mx-auto mt-5">
                <input id="nickname" class="form-control" type="text" placeholder="Nickname">
            </div>
        </div>
        
        <div class="row text-center">
            <div class="col-3 mx-auto mt-1">
                <div class="btn btn-primary mt-2" onclick="createRoom();">Create Room</div>
            </div>
        </div>
        
        <div class="row text-center">
            <div class="col-3 mx-auto mt-4">
                <div class="mb-3">
                    <input id="roomId" class="form-control d-inline-block" type="text" placeholder="Room id">
                </div>
                <div class="btn btn-primary" onclick="connectToServer();">Connect</div>
                <div class="btn btn-primary" onclick="reConnectToServer();">Reconnect</div>
            </div>
        </div>
    `);
}

function renderRoom(roomId) {
    replaceApp(`
        <div class="text-center">
            <h1>Room id: ` + roomId + `</h1>
            <div id="teamContainer" class="d-flex justify-content-around py-3 w-75 mx-auto"></div>
            <div id="roomSettingsContainer"></div>
            <div id="sendWordContainer"></div>
            <div id="winContainer"></div>
            <div id="table"></div>
        </div>
    `);
}

function renderSettings(remove = false) {
    if (remove) {
        getById("roomSettingsContainer")!.innerHTML = "";
    } else {
        getById("roomSettingsContainer")!.innerHTML = `
            <div class="btn btn-primary px-4 m-1" onclick="addTeam()">+</div>
            <div class="btn btn-primary px-4 m-1" onclick="deleteTeam()">-</div>

            <div class="m-1">
                <span>Round timer:<span>
                <input class="btn-check" id="roundTimer60"  name="roundTimer" value="60" type="radio" checked> 
                <label class="btn btn-primary" for="roundTimer60">60</label>
                <input class="btn-check" id="roundTimer100" name="roundTimer" value="100" type="radio"> 
                <label class="btn btn-primary" for="roundTimer100">100</label>
                <input class="btn-check" id="roundTimer140" name="roundTimer" value="140" type="radio"> 
                <label class="btn btn-primary" for="roundTimer140">140</label>
            </div>
            
            <div class="m-1">
                <span>Count cards:<span>
                <input class="btn-check" id="countCards30" name="countCards" value="30" type="radio" checked>
                <label class="btn btn-primary" for="countCards30">30</label>
                <input class="btn-check" id="countCards40" name="countCards" value="40" type="radio">
                <label class="btn btn-primary" for="countCards40">40</label>
                <input class="btn-check" id="countCards50" name="countCards" value="50" type="radio">
                <label class="btn btn-primary" for="countCards50">50</label>
            </div>
            
            <div class="m-1">
                <input class="btn-check" id="selectPackType" value="custom" type="checkbox"> 
                <label class="btn btn-primary" for="selectPackType">Custom pack</label>
            </div> 
            
            <div class="m-1">
                <div class="col-3 mx-auto">
                    <input class="form-control" id="packIdInput" type="text" autocomplete="off" placeholder="Pack id" style="display: none;">
                    <div class="text-danger"><div id="packSelectErr"></div></div>
                </div>
            </div>
            
            <div class="m-1">
                <div class="btn btn-primary" onclick="startGame()">Start</div>
            </div>
        `;

        Autocomplete("packIdInput");


        let select = getById("selectPackType") as HTMLInputElement;
        select.onchange = () => {
            let block = getById("packIdInput");
            if (!select.checked) {
                block!.style.display = "none";
            } else {
                block!.style.display = "";
            }
        };

    }

}


function renderSendWord(remove = false) {
    if (remove) {
        getById("sendWordContainer")!.innerHTML = "";
    } else {
        getById("sendWordContainer")!.innerHTML = `
            <div id="timer">0</div>
            <div class="d-flex justify-content-center">
                <input id="wordInput" class="form-control w-25" type="text">
                <div class="btn btn-primary mt-2" onclick="setWord();">Send</div>
            </div>
        `;
    }
}

function Autocomplete(selector) {

    let input = document.getElementById(selector)! as HTMLInputElement;
    input.classList.add("autocomplete-input");
    let wrap = document.createElement("div");
    wrap.className = "autocomplete-wrap col-3 mx-auto";
    input.parentNode!.insertBefore(wrap, input);
    wrap.appendChild(input);

    let list = document.createElement("div");
    list.className = "autocomplete-list";
    wrap.appendChild(list);

    let listItems = new Array<HTMLElement>();
    let focusedItem = -1;

    function setActive(active = true) {
        if (active) {
            wrap.classList.add("active");
        } else {
            wrap.classList.remove("active");
        }
    }

    function focusItem(index) {
        if (!listItems.length) return false;
        if (index > listItems.length - 1) return focusItem(0);
        if (index < 0) return focusItem(listItems.length - 1);
        focusedItem = index;
        unfocusAllItems();
        listItems[focusedItem].classList.add("focused");
    }

    function unfocusAllItems() {
        listItems.forEach(item => {
            item.classList.remove("focused");
        });
    }

    function selectItem(index) {
        if (!listItems[index]) return false;
        input.value = listItems[index].id;
        setActive(false);
    }

    input.addEventListener("input", () => {
        let value = input.value;

        if (!value) {
            return setActive(false);
        } else {
            post("/autoComplete", {value: value}, (resp) => {

                if (resp.responseText != "/0") {
                    let data = JSON.parse(resp.responseText);
                    list.innerHTML = "";
                    listItems = [];

                    data.forEach((dataItem) => {


                        let item = document.createElement("div");
                        item.className = "autocomplete-item";
                        item.innerHTML = dataItem.name + " (Id:" + dataItem.id + ")";
                        list.appendChild(item);
                        item.id = dataItem.id;
                        listItems.push(item);

                        item.addEventListener("click", function () {
                            selectItem(listItems.indexOf(item));
                        });

                    });
                    setActive(true);
                } else {
                    setActive(false);
                }
            });
        }

    });

    document.body.addEventListener("click", function (e) {
        // @ts-ignore
        if (!wrap.contains(e.target)) setActive(false);
    });

}

function ciSearch(what = '', where = '') {
    return where.toUpperCase().search(what.toUpperCase());
}