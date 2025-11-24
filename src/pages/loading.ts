import { loadingMessages } from '../data/loading-messages';
import '../styles/login.css';

export function renderLoadingPage(app: HTMLDivElement) {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card" style="text-align: center;">
        <h2 id="loadingText" class="login-title" style="font-size: 1.2rem; margin-top: 1rem; min-height: 3rem; display: flex; align-items: center; justify-content: center;">Iniciando...</h2>
        <div class="loading-bar-container">
            <div class="loading-bar"></div>
        </div>
      </div>
    </div>
  `;

  const textElement = document.getElementById('loadingText');
  if (!textElement) return;

  let lastIndex = Math.floor(Math.random() * loadingMessages.length);
  textElement.textContent = loadingMessages[lastIndex];

  const interval = setInterval(() => {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * loadingMessages.length);
    } while (newIndex === lastIndex && loadingMessages.length > 1);

    lastIndex = newIndex;
    const randomMsg = loadingMessages[newIndex];

    textElement.style.opacity = '0';
    setTimeout(() => {
      textElement.textContent = randomMsg;
      textElement.style.opacity = '1';
    }, 200);
  }, 3000);

  (window as any).currentLoadingInterval = interval;
}
