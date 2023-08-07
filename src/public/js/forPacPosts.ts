const sendButton = document.getElementById("send") as HTMLButtonElement;
const addPackForm = document.getElementById("addPackForm") as HTMLFormElement;
const packNameInput = document.getElementById("pacName") as HTMLInputElement;
const wordsInput = document.getElementById("words") as HTMLInputElement;
const countWordsElement = document.getElementById("count");

packNameInput.oninput = (ev: Event) => {
    ev.preventDefault();
    if (packNameInput.classList.contains("is-invalid")) {
        packNameInput.classList.remove("is-invalid");
    }
}

addPackForm.onsubmit = (ev: Event) => {
    ev.preventDefault();
}

function pacForm(callback: (pacName: string, words: string) => void) {
    sendButton.onclick = () => {
        const packName = packNameInput.value;
        const words = wordsInput.value;

        if (!packName) {
            packNameInput.classList.add("is-invalid");
        }

        if (!!packName && !!words) {
            callback(packName, words);
        }
    };
}

function setWordsCountOnInputField(){
    let delay = 0.8;
    let timer: any;

    wordsInput.oninput = () => {
        clearTimeout(timer);

        timer = setTimeout(function() {

            post("/checkWords", {words: wordsInput.value}, (resp) => {
                countWordsElement!.innerHTML = resp.responseText
            });

        }, delay * 1000);
    };

}