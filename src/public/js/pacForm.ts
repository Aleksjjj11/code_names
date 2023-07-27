function pacForm(callback) {
      let but = document.getElementById('send') as HTMLButtonElement
      but.onclick = () => {
            let pacName = (document.querySelector('#pacName') as HTMLInputElement).value
            let words = (document.querySelector('#words') as HTMLInputElement).value
            callback(pacName,words)
      }
      let text = document.getElementById('count')
      let area = document.getElementById('words') as HTMLInputElement
      area.oninput = () => {
            if (area.value.substr(area.value.length - 1) === ",") {
                  let rawWords = area.value.split(',')
                  let words = new Array<string>()
                  rawWords.forEach((rawWord) => {
                        rawWord = rawWord.trim()
                        if ((rawWord.length > 0) && (rawWord.length < 60)) {
                              let coincidence = false
                              words.forEach((word) => {
                                    if ((word === rawWord)) {
                                          coincidence = true
                                    }
                              })
                              if (!coincidence)
                                    words.push(rawWord)
                        }
                  })
                  text!.innerHTML = "Количество слов(без повторов) - " + words.length
            }
      }
}