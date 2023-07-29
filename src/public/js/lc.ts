pacForm((pacName, words) => {
    post("/lcAddPac", {name: pacName, words: words}, (resp) => {
        let data = JSON.parse(resp.responseText);
        if (data.type === "redirect") {
            document.location = data.url;
        }
        if (data.type === "err") {
            document.getElementById("err")!.innerHTML = data.text;
        }
    });
});