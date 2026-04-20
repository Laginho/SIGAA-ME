import '../styles/dashboard.css';
import { toast } from '../components/toast';
import { formatSyncLabel } from '../utils/ui-helpers';

interface UserAccount {
  name: string;
  photoUrl?: string;
}

export function renderDashboardPage(app: HTMLDivElement, account: UserAccount) {
  // Title Case Helper
  const toTitleCase = (str: string) => {
    return str.toLowerCase().split(' ').map(word => {
      // Exceptions for Portuguese prepositions
      if (['de', 'da', 'do', 'dos', 'das', 'e'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  };

  // Fallback: Load photoUrl from localStorage if not in account
  if (!account.photoUrl) {
    const savedPhotoUrl = localStorage.getItem('userPhotoUrl');
    if (savedPhotoUrl) {
      account.photoUrl = savedPhotoUrl;
    }
  }

  let name: string = toTitleCase(account.name);
  app.innerHTML = `
    <div class="dashboard-container">
      <header class="dashboard-header"> 
        <div class="user-info">
          ${account.photoUrl
      ? `<img src="${account.photoUrl}" alt="Foto de Perfil" class="user-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="user-photo-placeholder" style="display:none">${name.charAt(0)}</div>`
      : `<div class="user-photo-placeholder">${name.charAt(0)}</div>`
    }
          <div class="user-details">
            <h1 class="user-name">Olá, ${name}</h1>
            <p class="user-status">Bem-vindo ao SIGAA-ME</p>
          </div>
        </div>
        <div class="header-actions">
          <div class="sync-status-container" style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; margin-right: 1rem; gap: 4px;">
            <span id="syncStatusManual" class="sync-status" style="margin: 0; line-height: 1.2;"></span>
            <span id="syncStatusAuto" class="sync-status" style="margin: 0; line-height: 1.2;"></span>
          </div>
          <button id="refreshBtn" class="btn-refresh" title="Sincronizar">🔄</button>
          <button id="settingsBtn" class="btn-settings" title="Configurações">⚙️</button>
          <button id="clearDataBtn" class="btn-clear-data" title="Limpar todos os dados locais">🗑️</button>
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

  // Settings handler
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    window.location.hash = '#/settings';
  });

  // Logout handler - clears credentials and session, but keeps cached data
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
      await window.api.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Only clear session, keep localStorage cache for faster next login
    sessionStorage.clear();
    window.location.hash = '#/login';
  });

  // Clear data handler
  document.getElementById('clearDataBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('clearDataBtn') as HTMLButtonElement;
    if (btn.dataset.confirming) {
      // Second click — execute
      delete btn.dataset.confirming;
      btn.innerHTML = '🗑️';
      btn.title = 'Limpar todos os dados locais';
      try {
        await window.api.clearAllData();
      } catch (e) {
        console.error('Clear data error:', e);
      }
      localStorage.clear();
      sessionStorage.clear();
      toast.success('Dados locais removidos.');
      setTimeout(() => { window.location.hash = '#/login'; }, 1200);
    } else {
      // First click — ask for confirmation via button state
      btn.dataset.confirming = '1';
      btn.innerHTML = '⚠️';
      btn.title = 'Clique novamente para confirmar a exclusão de todos os dados';
      toast.info('Clique novamente no botão ⚠️ para confirmar a limpeza de dados.');
      setTimeout(() => {
        // Reset if user doesn't confirm within 4s
        if (btn.dataset.confirming) {
          delete btn.dataset.confirming;
          btn.innerHTML = '🗑️';
          btn.title = 'Limpar todos os dados locais';
        }
      }, 4000);
    }
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
  const syncStatusManual = document.getElementById('syncStatusManual');
  const syncStatusAuto = document.getElementById('syncStatusAuto');
  if (!coursesListElement) return;

  try {
    const cachedData = localStorage.getItem('coursesWithFiles');
    const cacheTimestamp = localStorage.getItem('cacheTimestamp');

    if (cachedData) {
      console.log('Loading from cache...');
      const coursesWithFiles = JSON.parse(cachedData);
      displayCourses(coursesWithFiles, coursesListElement);

      if (cacheTimestamp && syncStatusManual) {
        syncStatusManual.textContent = `Sync manual: ${formatSyncLabel(parseInt(cacheTimestamp)).replace('hoje às ', '')}`;
      }

      // Load and display auto sync status
      window.api.getSettings().then(settings => {
        if (settings.lastBackgroundSync && syncStatusAuto) {
          syncStatusAuto.textContent = `Sync automático: ${formatSyncLabel(settings.lastBackgroundSync).replace('hoje às ', '')}`;
        }
      }).catch(console.error);

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
