import '../styles/dashboard.css';

interface UserAccount {
  name: string;
  photoUrl?: string;
}

export function renderDashboardPage(app: HTMLDivElement, account: UserAccount) {
  let name: string = account.name.charAt(0).toUpperCase() + account.name.slice(1).toLowerCase();
  app.innerHTML = `
    <div class="dashboard-container">
      <header class="dashboard-header"> 
        <div class="user-info">
          ${account.photoUrl
      ? `<img src="${account.photoUrl}" alt="Foto de Perfil" class="user-photo">`
      : `<div class="user-photo-placeholder">${name.charAt(0)}</div>`
    }
          <div class="user-details">
            <h1 class="user-name">Olá, ${name}</h1>
            <p class="user-status">Bem-vindo ao SIGAA-ME</p>
          </div>
        </div>
        <div class="header-actions">
          <span id="syncStatus" class="sync-status"></span>
          <button id="refreshBtn" class="btn-refresh" title="Sincronizar">🔄</button>
          <button id="logoutBtn" class="btn-logout">Sair</button>
        </div>
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

  // Logout handler
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.hash = '#/login';
  });

  // Refresh button handler
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    // Redirect to Sync Selection screen for manual refresh
    window.location.hash = '#/sync-selection';
  });

  // Load courses from cache
  loadCoursesFromCache();
}



function loadCoursesFromCache() {
  const coursesListElement = document.getElementById('coursesList');
  const syncStatus = document.getElementById('syncStatus');
  if (!coursesListElement) return;

  try {
    const cachedData = localStorage.getItem('coursesWithFiles');
    const cacheTimestamp = localStorage.getItem('cacheTimestamp');

    if (cachedData) {
      console.log('Loading from cache...');
      const coursesWithFiles = JSON.parse(cachedData);
      displayCourses(coursesWithFiles, coursesListElement);

      if (cacheTimestamp && syncStatus) {
        const cacheDate = new Date(parseInt(cacheTimestamp));
        syncStatus.textContent = `Último sync: ${cacheDate.toLocaleTimeString()}`;
        syncStatus.className = 'sync-status';
      }
    } else {
      // Should normally be handled by main.ts redirect, but just in case:
      coursesListElement.innerHTML = '<div class="no-courses">Nenhum dado encontrado. <a href="#/sync-selection">Sincronizar agora</a></div>';
    }
  } catch (error: any) {
    console.error('Error loading courses:', error);
    coursesListElement.innerHTML = `
        <div class="error-message">
          Erro ao carregar cache: ${error.message}
        </div>
      `;
  }
}

function displayCourses(coursesWithFiles: any[], coursesListElement: HTMLElement) {
  if (coursesWithFiles.length === 0) {
    coursesListElement.innerHTML = `
      <div class="no-courses">Nenhuma disciplina ativa encontrada</div>
    `;
  } else {
    coursesListElement.innerHTML = coursesWithFiles.map((course: any) => `
      <div class="course-card" onclick="window.location.hash='#/course/${course.id}'">
        <h3>${course.name}</h3>
        <p class="course-code">${course.code || 'Sem código'}</p>
        <p class="course-period">${course.period || 'Período não especificado'}</p>
        <p class="course-files-count">${course.fileCount || course.files?.length || 0} arquivos</p>
      </div>
    `).join('');
  }
}
