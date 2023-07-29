let butt = document.getElementById("send") as HTMLButtonElement;

butt.onclick = () => {
    let login = (document.querySelector("#log") as HTMLInputElement).value;
    let pass = (document.querySelector("#pas") as HTMLInputElement).value;
    post("/lcLogin", {login: login, password: pass}, (resp) => {
        let data = JSON.parse(resp.responseText);
        if (data.type === "redirect") {
            document.location = data.url;
        }
        if (data.type === "err") {
            document.getElementById("err")!.innerHTML = data.text;
        }
    });
};




