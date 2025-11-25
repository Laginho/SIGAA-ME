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
    fetchCoursesWithSync(true); // Force refresh
  });

  // Automatically fetch/sync courses when dashboard loads
  fetchCoursesWithSync(false);
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

      // Now sync in background
      setTimeout(() => syncInBackground(coursesWithFiles, coursesListElement, syncStatus), 500);
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
      <p>Carregando disciplinas e materiais...</p>
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

async function syncInBackground(cachedCourses: any[], coursesListElement: HTMLElement, syncStatus: HTMLElement | null) {
  console.log('Starting background sync...');

  if (syncStatus) {
    syncStatus.textContent = '🔄 Sincronizando...';
    syncStatus.className = 'sync-status syncing';
  }

  try {
    // Fetch course list only (fast!)
    const result = await window.api.getCourses();

    if (!result.success || !result.courses) {
      if (syncStatus) {
        syncStatus.textContent = 'Erro no sync';
        syncStatus.className = 'sync-status error';
      }
      return;
    }

    // Compare with cached data
    const coursesToUpdate: any[] = [];
    const updatedCourses = [...cachedCourses];

    for (const serverCourse of result.courses) {
      const cachedCourse = cachedCourses.find(c => c.id === serverCourse.id);

      // Always update to check for new files/news
      // In a more advanced version, we could check file counts if the API returned them
      coursesToUpdate.push(serverCourse);
    }

    if (coursesToUpdate.length === 0) {
      console.log('No updates needed');
      if (syncStatus) {
        syncStatus.textContent = '✓ Atualizado';
        syncStatus.className = 'sync-status synced';
        setTimeout(() => {
          syncStatus.textContent = `Último sync: ${new Date().toLocaleTimeString()}`;
          syncStatus.className = 'sync-status';
        }, 3000);
      }
    } else {
      console.log(`Updating ${coursesToUpdate.length} courses...`);

      for (const course of coursesToUpdate) {
        const filesResult = await window.api.getCourseFiles(course.id, course.name);
        const newCourse = {
          ...course,
          files: filesResult.success ? filesResult.files : [],
          news: filesResult.success ? filesResult.news : [],
          fileCount: filesResult.success ? filesResult.files?.length || 0 : 0
        };

        const existingIndex = updatedCourses.findIndex(c => c.id === course.id);
        if (existingIndex >= 0) {
          updatedCourses[existingIndex] = newCourse;
        } else {
          updatedCourses.push(newCourse);
        }
      }

      // Update cache
      localStorage.setItem('coursesWithFiles', JSON.stringify(updatedCourses));
      localStorage.setItem('cacheTimestamp', Date.now().toString());

      // Refresh display
      displayCourses(updatedCourses, coursesListElement);

      if (syncStatus) {
        syncStatus.textContent = `✓ ${coursesToUpdate.length} atualizações`;
        syncStatus.className = 'sync-status synced';
        setTimeout(() => {
          syncStatus.textContent = `Último sync: ${new Date().toLocaleTimeString()}`;
          syncStatus.className = 'sync-status';
        }, 5000);
      }
    }
  } catch (error) {
    console.error('Background sync error:', error);
    if (syncStatus) {
      syncStatus.textContent = 'Erro no sync';
      syncStatus.className = 'sync-status error';
    }
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
