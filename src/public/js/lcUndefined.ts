const loginButton = document.getElementById("send") as HTMLButtonElement;
const loginForm = document.getElementById("loginForm") as HTMLFormElement;
const loginInput = document.getElementById("log") as HTMLInputElement;
const passwordInput = document.getElementById("pas") as HTMLInputElement;

loginForm.onsubmit = (ev: Event) => {
    ev.preventDefault();
}

loginInput.oninput = (ev: Event) => {
    ev.preventDefault();
    if (loginInput.classList.contains("is-invalid")) {
        loginInput.classList.remove("is-invalid");
    }
}

passwordInput.oninput = (ev: Event) => {
    ev.preventDefault();
    if (passwordInput.classList.contains("is-invalid")) {
        passwordInput.classList.remove("is-invalid");
    }
}

loginButton.onclick = () => {
    const login = loginInput.value;
    const password = passwordInput.value;

    if (!login) {
        loginInput.classList.add("is-invalid");
    }

    if (!password) {
        passwordInput.classList.add("is-invalid");
    }

    if (!login || !password) {
        return;
    }

    post("/lcLogin", {login: login, password: password}, (resp) => {
        let data = JSON.parse(resp.responseText);
        if (data.type === "redirect") {
            document.location = data.url;
        }
        if (data.type === "err") {
            document.getElementById("err")!.innerHTML = data.text;
        }
    });
};




