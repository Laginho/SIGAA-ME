import '../styles/dashboard.css';

interface UserAccount {
    name: string;
    photoUrl?: string;
}

export function renderDashboardPage(app: HTMLDivElement, account: UserAccount) {
    app.innerHTML = `
    <div class="dashboard-container">
      <header class="dashboard-header">
        <div class="user-info">
          ${account.photoUrl
            ? `<img src="${account.photoUrl}" alt="Foto de Perfil" class="user-photo">`
            : `<div class="user-photo-placeholder">${account.name.charAt(0)}</div>`
        }
          <div class="user-details">
            <h1 class="user-name">Olá, ${account.name}</h1>
            <p class="user-status">Bem-vindo ao SIGAA-ME</p>
          </div>
        </div>
        <button id="logoutBtn" class="btn-logout">Sair</button>
      </header>

      <main class="dashboard-content">
        <section class="courses-section">
          <h2>Suas Disciplinas</h2>
          <div id="coursesList" class="courses-grid">
            <div class="loading-courses">Carregando disciplinas...</div>
          </div>
        </section>
      </main>
    </div>
  `;

    // Logout handler (for now just reloads, effectively clearing memory state)
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        window.location.reload();
    });
}
