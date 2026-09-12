import { loadingMessages } from '../data/loading-messages';
import '../styles/login.css';

// Handles em módulo, não em `window`: o `main.ts` chamava um global que
// ninguém definia e o intervalo nunca era limpo (CLEAN-004).
let messageInterval: ReturnType<typeof setInterval> | undefined;
let fadeTimeout: ReturnType<typeof setTimeout> | undefined;

/** Para a troca de mensagens e o fade pendente. Idempotente. */
export function stopLoadingInterval() {
  clearInterval(messageInterval);
  clearTimeout(fadeTimeout);
  messageInterval = undefined;
  fadeTimeout = undefined;
}

export function renderLoadingPage(app: HTMLDivElement) {
  stopLoadingInterval();
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

  messageInterval = setInterval(() => {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * loadingMessages.length);
    } while (newIndex === lastIndex && loadingMessages.length > 1);

    lastIndex = newIndex;
    const randomMsg = loadingMessages[newIndex];

    textElement.style.opacity = '0';
    fadeTimeout = setTimeout(() => {
      textElement.textContent = randomMsg;
      textElement.style.opacity = '1';
    }, 200);
  }, 3000);
}
