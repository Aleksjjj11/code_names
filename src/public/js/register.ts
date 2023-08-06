const button = document.getElementById("send") as HTMLButtonElement;
const loginElement = document.getElementById("log") as HTMLInputElement;
const passwordElement = document.getElementById("pas") as HTMLInputElement;
const registerForm = document.getElementById("registerForm") as HTMLFormElement;

registerForm.onsubmit = (ev: Event) => {
    ev.preventDefault();
}

loginElement.oninput = (ev: Event) => {
    ev.preventDefault();
    if (loginElement.classList.contains("is-invalid")) {
        loginElement.classList.remove("is-invalid");
    }
};

passwordElement.oninput = (ev: Event) => {
    ev.preventDefault();
    if (passwordElement.classList.contains("is-invalid")) {
        passwordElement.classList.remove("is-invalid");
    }
};

button.onclick = () => {
    let login = loginElement.value;
    if (!login) {
        loginElement.classList.add("is-invalid");
    }

    let password = passwordElement.value;
    if (!password) {
        passwordElement.classList.add("is-invalid");
    }

    if (!login || !password) {
        return;
    }

    post("/register", {login: login, password: password}, (resp) => {
        let data = JSON.parse(resp.responseText);
        if (data.type === "redirect") {
            document.location = data.url;
        }
        if (data.type === "err") {
            document.getElementById("err")!.innerHTML = data.text;
        }
    });
};