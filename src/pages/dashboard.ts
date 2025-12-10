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
          <div class="live-sync-control" title="Smart LiveSync: Checks for updates in background">
            <label class="switch">
              <input type="checkbox" id="liveSyncToggle">
              <span class="slider round"></span>
            </label>
            <span class="switch-label">Live</span>
          </div>
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

  // Live Sync Toggle
  const liveSyncToggle = document.getElementById('liveSyncToggle') as HTMLInputElement;
  if (liveSyncToggle) {
    // Initial state
    window.api.getLiveSyncEnabled().then(enabled => {
      liveSyncToggle.checked = enabled;
      updateSyncStatusUI(enabled);
    });

    // Change handler
    liveSyncToggle.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      window.api.setLiveSyncEnabled(enabled);
      updateSyncStatusUI(enabled);

      if (enabled) {
        showToast('Smart LiveSync ativado');
      } else {
        showToast('Smart LiveSync pausado');
      }
    });
  }

  // Refresh button handler
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    fetchCoursesWithSync(true); // Force refresh
  });

  // Automatically fetch/sync courses when dashboard loads
  fetchCoursesWithSync(false);

  // Listen for Smart Sync updates
  window.api.onSyncUpdate((data) => {
    handleSmartSyncUpdate(data);
  });
}

async function fetchCoursesWithSync(forceRefresh: boolean = false) {
  const coursesListElement = document.getElementById('coursesList');
  const syncStatus = document.getElementById('syncStatus');
  if (!coursesListElement) return;

  try {
    // Try to load from cache first
    const cachedData = localStorage.getItem('coursesWithFiles');
    const cacheTimestamp = localStorage.getItem('cacheTimestamp');

    if (cachedData && !forceRefresh) {
      // Show cached data immediately!
      console.log('Loading from cache...');
      const coursesWithFiles = JSON.parse(cachedData);
      displayCourses(coursesWithFiles, coursesListElement);

      // Show when data was cached
      if (cacheTimestamp && syncStatus) {
        const cacheDate = new Date(parseInt(cacheTimestamp));
        syncStatus.textContent = `Último sync: ${cacheDate.toLocaleTimeString()}`;
        syncStatus.className = 'sync-status';
      }

      // Now sync in background if enabled
      window.api.getLiveSyncEnabled().then(enabled => {
        if (enabled) {
          console.log('Live Sync is enabled. Backend engine should be running.');
        } else {
          console.log('Live Sync is disabled.');
          if (syncStatus) {
            syncStatus.textContent = `Sync desativado`;
            syncStatus.className = 'sync-status';
          }
        }
      });
    } else {
      // No cache or force refresh - do full fetch with progress
      await fullFetchWithProgress(coursesListElement, syncStatus);
    }
  } catch (error: any) {
    console.error('Error loading courses:', error);
    if (coursesListElement) {
      coursesListElement.innerHTML = `
        <div class="error-message">
          Erro ao carregar disciplinas: ${error.message || 'Erro desconhecido'}
        </div>
      `;
    }
  }
}

async function fullFetchWithProgress(coursesListElement: HTMLElement, syncStatus: HTMLElement | null) {
  console.log('Doing full fetch with progress...');

  // Show loading with progress bar
  coursesListElement.innerHTML = `
    <div class="loading-courses">
      <div class="loading-spinner"></div>
      <p>Carregando disciplinas e materiais. Estimativa: 2 min</p>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <p class="progress-text" id="progressText">0%</p>
    </div>
  `;

  const result = await window.api.getCourses();

  if (result.success && result.courses) {
    console.log(`Fetched ${result.courses.length} courses`);

    const coursesWithFiles: any[] = [];
    const progressFill = document.getElementById('progressFill') as HTMLElement;
    const progressText = document.getElementById('progressText') as HTMLElement;

    for (let i = 0; i < result.courses.length; i++) {
      const course = result.courses[i];
      console.log(`Fetching files for course ${i + 1}/${result.courses.length}: ${course.name}`);

      const progress = Math.round(((i + 1) / result.courses.length) * 100);
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${progress}% - ${course.code}`;

      const filesResult = await window.api.getCourseFiles(course.id, course.name);

      coursesWithFiles.push({
        ...course,
        files: filesResult.success ? filesResult.files : [],
        news: filesResult.success ? filesResult.news : [],
        fileCount: filesResult.success ? filesResult.files?.length || 0 : 0
      });
    }

    // Save to localStorage
    localStorage.setItem('coursesWithFiles', JSON.stringify(coursesWithFiles));
    localStorage.setItem('cacheTimestamp', Date.now().toString());

    console.log('All courses cached to localStorage!');

    displayCourses(coursesWithFiles, coursesListElement);

    if (syncStatus) {
      syncStatus.textContent = `Sincronizado às ${new Date().toLocaleTimeString()}`;
      syncStatus.className = 'sync-status synced';
    }
  } else {
    coursesListElement.innerHTML = `
      <div class="error-message">
        Erro ao carregar disciplinas: ${result.message || 'Erro desconhecido'}
      </div>
    `;
  }
}

function updateSyncStatusUI(enabled: boolean) {
  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) {
    if (enabled) {
      syncStatus.textContent = '';
      syncStatus.className = 'sync-status';
      syncStatus.style.display = 'none';
    } else {
      syncStatus.textContent = 'Sync desativado';
      syncStatus.className = 'sync-status';
      syncStatus.style.display = 'inline-block';
    }
  }
}

function handleSmartSyncUpdate(data: { courseId: string; files: any[]; news: any[] }) {
  console.log('Received Smart Sync update for course:', data.courseId);
  const cachedData = localStorage.getItem('coursesWithFiles');
  if (cachedData) {
    const courses = JSON.parse(cachedData);
    const courseIndex = courses.findIndex((c: any) => c.id === data.courseId);
    if (courseIndex >= 0) {
      courses[courseIndex].files = data.files;
      courses[courseIndex].news = data.news;
      courses[courseIndex].fileCount = data.files.length;
      localStorage.setItem('coursesWithFiles', JSON.stringify(courses));

      showToast(`Novos conteúdos em ${courses[courseIndex].name}`);

      // Update UI if visible
      const coursesListElement = document.getElementById('coursesList');
      if (coursesListElement) {
        displayCourses(courses, coursesListElement);
      }
    }
  }
}

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerText = message;
  document.body.appendChild(toast);
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
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
