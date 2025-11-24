import { loadingMessages } from '../data/loading-messages';
import '../styles/login.css';

export function renderLoadingPage(app: HTMLDivElement) {
    app.innerHTML = `
    <div class="login-container">
      <div class="login-card" style="text-align: center;">
        <img src="/ufc-logo.png" alt="UFC Logo" class="login-logo spinning-slow">
        <h2 id="loadingText" class="login-title" style="font-size: 1.2rem; margin-top: 1rem; min-height: 3rem; display: flex; align-items: center; justify-content: center;">Iniciando...</h2>
        <div class="loading-bar-container">
            <div class="loading-bar"></div>
        </div>
      </div>
    </div>
  `;

    const textElement = document.getElementById('loadingText');
    if (!textElement) return;

    // Pick a random message initially
    textElement.textContent = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

    // Cycle messages
    const interval = setInterval(() => {
        const randomMsg = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
        // Fade out
        textElement.style.opacity = '0';
        setTimeout(() => {
            textElement.textContent = randomMsg;
            textElement.style.opacity = '1';
        }, 200);
    }, 3000);

    // Store interval ID to clear it later if needed (though replacing innerHTML usually kills it, it's safer to clear)
    (window as any).currentLoadingInterval = interval;
}
