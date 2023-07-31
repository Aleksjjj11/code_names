let span = document.getElementById("pacId");
pacForm((name, words) => {
    post("/refreshPac", {name: name, words: words, id: span!.innerHTML}, (resp) => {
        let data = JSON.parse(resp.responseText);
        document.getElementById("err")!.innerHTML = data.text;
    });
});

setWordsCountOnInputField()