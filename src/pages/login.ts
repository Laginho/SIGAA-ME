import '../styles/login.css';

export function renderLoginPage(app: HTMLDivElement) {
    app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <img src="/ufc-logo.png" alt="UFC Logo" class="login-logo" style="background: transparent;">
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

          <button type="submit" class="btn-primary">Entrar</button>
        </form>
      </div>
    </div>
  `;

    // Add event listener for the form
    const form = document.getElementById('loginForm') as HTMLFormElement;
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!username || !password) return;

        // Disable button and show loading state
        submitButton.disabled = true;
        submitButton.textContent = 'Entrando...';

        try {
            const result = await window.api.login(username, password);

            if (result.success) {
                console.log('Login success!');
                // We will redirect to dashboard here soon
                if (result.account) {
                    alert(`Bem-vindo, ${result.account.name}!`);
                } else {
                    alert('Login realizado com sucesso!');
                }
            } else {
                alert(`Erro ao entrar: ${result.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('Erro inesperado ao tentar entrar.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Entrar';
        }
    });
}
