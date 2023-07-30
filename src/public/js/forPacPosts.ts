function pacForm(callback: (pacName: string, words: string) => void) {
    let but = document.getElementById("send") as HTMLButtonElement;
    but.onclick = () => {
        let pacName = (document.querySelector("#pacName") as HTMLInputElement).value;
        let words = (document.querySelector("#words") as HTMLInputElement).value;
        callback(pacName, words);
    };

}

function SetWordsCountOnInputField(){
    let text = document.getElementById("count");
    let area = document.getElementById("words") as HTMLInputElement;
    let delay = 0.8
    let timer;

    area.oninput = () => {
        clearTimeout(timer);

        timer = setTimeout(function() {

            post("/checkWords", {words: area.value}, (resp) => {
                text!.innerHTML = resp.responseText
            });

        }, delay * 1000);
    };

}