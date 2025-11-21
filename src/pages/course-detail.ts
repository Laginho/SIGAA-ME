import '../styles/course-detail.css'

export function renderCourseDetailPage(container: HTMLDivElement, courseId: string) {
  container.innerHTML = `
    <div class="course-detail-page">
      <div class="course-header">
        <button id="backButton" class="back-button">← Voltar</button>
        <h1 id="courseTitle">Carregando...</h1>
        <p id="courseCode" class="course-code-header"></p>
      </div>
      
      <div class="course-content">
        <section class="files-section">
          <h2>Materiais da Disciplina</h2>
          <div id="filesList" class="files-list">
            <div class="loading">Carregando arquivos...</div>
          </div>
        </section>
      </div>
    </div>
  `

  // Back button handler
  const backButton = document.getElementById('backButton')
  backButton?.addEventListener('click', () => {
    window.location.hash = '#/dashboard'
  })

  // Fetch course files
  fetchCourseFiles(courseId)
}

async function fetchCourseFiles(courseId: string) {
  const filesListElement = document.getElementById('filesList')
  const courseTitleElement = document.getElementById('courseTitle')
  const courseCodeElement = document.getElementById('courseCode')

  if (!filesListElement || !courseTitleElement || !courseCodeElement) return

  try {
    const result = await window.api.getCourseFiles(courseId)

    if (result.success && result.files) {
      // Update course info (we'll need to pass course data somehow)
      // For now, just show the course ID
      courseTitleElement.textContent = 'Disciplina'
      courseCodeElement.textContent = `ID: ${courseId}`

      if (result.files.length === 0) {
        filesListElement.innerHTML = `
          <div class="no-files">Nenhum material disponível nesta disciplina</div>
        `
      } else {
        filesListElement.innerHTML = result.files.map(file => `
          <div class="file-item">
            <div class="file-icon">📄</div>
            <div class="file-info">
              <div class="file-name">${file.name}</div>
              <div class="file-meta">Arquivo da disciplina</div>
            </div>
          </div>
        `).join('')
      }
    } else {
      filesListElement.innerHTML = `
        <div class="error-message">
          Erro ao carregar arquivos: ${result.message || 'Erro desconhecido'}
        </div>
      `
    }
  } catch (error: any) {
    filesListElement.innerHTML = `
      <div class="error-message">
        Erro ao carregar arquivos: ${error.message || 'Erro desconhecido'}
      </div>
    `
  }
}
