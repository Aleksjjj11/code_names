function post(url, params, callback) {
    let xhr = new XMLHttpRequest();
    let json = JSON.stringify(params);
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.send(json);
    xhr.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            callback(this);
        }
    };
}

function setPost(butId, reqUrl, htmlId, getArgs) {
    let but = document.getElementById(butId) as HTMLButtonElement;

    but.onclick = () => {

        let arg = getArgs();
        post(reqUrl, arg, (resp) => {
            document.getElementById(htmlId)!.innerHTML = resp.responseText;
        });

    };
}




