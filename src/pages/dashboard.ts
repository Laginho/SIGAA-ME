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

  // Automatically fetch courses when dashboard loads
  fetchCourses();
}

async function fetchCourses() {
  const coursesListElement = document.getElementById('coursesList');
  if (!coursesListElement) return;

  try {
    console.log('Fetching courses...');
    const result = await window.api.getCourses();

    if (result.success && result.courses) {
      console.log('Courses fetched:', result.courses);

      if (result.courses.length === 0) {
        coursesListElement.innerHTML = `
                    <div class="no-courses">Nenhuma disciplina ativa encontrada</div>
                `;
      } else {
        coursesListElement.innerHTML = result.courses.map((course: any) => `
                    <div class="course-card" onclick="window.location.hash='#/course/${course.id}'">
                        <h3>${course.name}</h3>
                        <p class="course-code">${course.code || 'Sem código'}</p>
                        <p class="course-period">${course.period || 'Período não especificado'}</p>
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
    coursesListElement.innerHTML = `
            <div class="error-message">
                Erro ao carregar disciplinas: ${error.message || 'Erro desconhecido'}
            </div>
        `;
  }
}
