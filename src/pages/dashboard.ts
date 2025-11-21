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

  // Logout handler
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.hash = '#/login';
  });

  // Automatically fetch courses when dashboard loads
  fetchCourses();
}

async function fetchCourses() {
  const coursesListElement = document.getElementById('coursesList');
  if (!coursesListElement) return;

  try {
    console.log('Fetching courses...');

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

      // Now prefetch files for ALL courses
      const coursesWithFiles: any[] = [];
      const progressFill = document.getElementById('progressFill') as HTMLElement;
      const progressText = document.getElementById('progressText') as HTMLElement;

      for (let i = 0; i < result.courses.length; i++) {
        const course = result.courses[i];
        console.log(`Fetching files for course ${i + 1}/${result.courses.length}: ${course.name}`);

        // Update progress
        const progress = Math.round(((i + 1) / result.courses.length) * 100);
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${progress}% - ${course.code}`;

        // Fetch files for this course
        const filesResult = await window.api.getCourseFiles(course.id);

        coursesWithFiles.push({
          ...course,
          files: filesResult.success ? filesResult.files : []
        });
      }

      // Cache everything in sessionStorage
      sessionStorage.setItem('coursesWithFiles', JSON.stringify(coursesWithFiles));

      console.log('All courses and files cached!');

      // Now display courses
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
            <p class="course-files-count">${course.files?.length || 0} arquivos</p>
          </div>
        `).join('');
      }
    } else {
      coursesListElement.innerHTML = `
        <div class="error-message">
          Erro ao carregar disciplinas: ${result.message || 'Erro desconhecido'}
        </div>
      `;
    }
  } catch (error: any) {
    console.error('Error fetching courses:', error);
    if (coursesListElement) {
      coursesListElement.innerHTML = `
        <div class="error-message">
          Erro ao carregar disciplinas: ${error.message || 'Erro desconhecido'}
        </div>
      `;
    }
  }
}
