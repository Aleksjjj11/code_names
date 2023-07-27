
let button = document.getElementById('send') as HTMLButtonElement

button.onclick = () => {
      let login = (document.querySelector('#log') as HTMLInputElement).value
      let pass = (document.querySelector('#pas') as HTMLInputElement).value
      post('/register', {login:login, password:pass}, (resp) => {
            let data = JSON.parse(resp.responseText)
            if(data.type === 'redirect')
                  document.location = data.url
            if(data.type === 'err')
                  document.getElementById('err')!.innerHTML = data.text
      })
}




