import '../styles/login.css';
import { showToast } from '../components/toast';

export function renderLoginPage(app: HTMLDivElement) {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <img src="./ufc-logo.png" alt="UFC Logo" class="login-logo" style="background: transparent;">
        <h1 class="login-title">SIGAA-ME</h1>
        <p class="login-subtitle">Para não depender de um app feito em Java.</p>
        
        <form class="login-form" id="loginForm">
          <div class="form-group">
            <label for="username" class="form-label">Usuário</label>
            <input type="text" id="username" class="form-input" placeholder="Digite seu usuário" required>
          </div>
          
          <div class="form-group">
            <label for="password" class="form-label">Senha</label>
            <input type="password" id="password" class="form-input" placeholder="Digite sua senha" required>
          </div>

          <div class="form-group checkbox-group">
            <input type="checkbox" id="rememberMe" class="form-checkbox">
            <label for="rememberMe" class="form-label-checkbox">Lembrai de mim</label>
          </div>

          <button type="submit" class="btn-primary">Entrar</button>
        </form>
      </div>
    </div>
  `;

  // Add event listener for the form
  const form = document.getElementById('loginForm') as HTMLFormElement;
  if (!form) return;

  const usernameInput = document.getElementById('username') as HTMLInputElement;
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  const rememberMeInput = document.getElementById('rememberMe') as HTMLInputElement;
  const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value;
    const password = passwordInput.value;
    const rememberMe = rememberMeInput.checked;

    if (!username || !password) return;

    // Disable button and show loading state
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Entrando...';
    }

    try {
      const result = await window.api.login({ username, password, rememberMe });

      if (result.success && result.account) {
        console.log('Login success!');
        // Store account data in sessionStorage
        sessionStorage.setItem('account', JSON.stringify(result.account));
        // Navigate to dashboard using hash
        window.location.hash = '#/dashboard';
      } else {
        showToast(`Erro ao entrar: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Erro inesperado ao tentar entrar.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Entrar';
      }
    }
  });
}