import './styles/main.css'
import { renderLoginPage } from './pages/login'

const app = document.querySelector<HTMLDivElement>('#app')!

renderLoginPage(app)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
