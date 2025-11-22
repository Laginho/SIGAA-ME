import '../styles/course-detail.css'

export function renderCourseDetailPage(container: HTMLDivElement, courseId: string) {
  container.innerHTML = `
    <div class="course-detail-page">
      <div class="course-header">
        <button id="backButton" class="back-button">← Voltar</button>
        <h1 id="courseTitle">Carregando...</h1>
        <p id="courseCode" class="course-code-header"></p>
        <button id="downloadAllBtn" class="btn-download-all">⬇️ Download All (TEST)</button>
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

  // Download all button handler
  const downloadAllBtn = document.getElementById('downloadAllBtn')
  downloadAllBtn?.addEventListener('click', async () => {
    await testDownloadAll(courseId)
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
    // Read from localStorage (persistent cache)
    const cachedData = localStorage.getItem('coursesWithFiles')

    if (!cachedData) {
      filesListElement.innerHTML = `
        <div class="error-message">
          Dados não encontrados. Por favor, volte ao dashboard.
        </div>
      `
      return
    }

    const coursesWithFiles = JSON.parse(cachedData)
    const course = coursesWithFiles.find((c: any) => c.id === courseId)

    if (!course) {
      filesListElement.innerHTML = `
        <div class="error-message">
          Disciplina não encontrada.
        </div>
      `
      return
    }

    // Update course info
    courseTitleElement.textContent = course.name
    courseCodeElement.textContent = course.code || `ID: ${courseId}`

    if (!course.files || course.files.length === 0) {
      filesListElement.innerHTML = `
        <div class="no-files">Nenhum material disponível nesta disciplina</div>
      `
    } else {
      filesListElement.innerHTML = course.files.map((file: any) => `
        <div class="file-item">
          <div class="file-icon">📄</div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">Arquivo da disciplina</div>
          </div>
        </div>
      `).join('')
    }
  } catch (error: any) {
    filesListElement.innerHTML = `
      <div class="error-message">
        Erro ao carregar arquivos: ${error.message || 'Erro desconhecido'}
      </div>
    `
  }
}

async function testDownloadAll(courseId: string) {
  console.log('Testing download all for course:', courseId);

  try {
    // Get cached course data
    const cachedData = localStorage.getItem('coursesWithFiles');
    if (!cachedData) {
      alert('No cached data found');
      return;
    }

    const coursesWithFiles = JSON.parse(cachedData);
    const course = coursesWithFiles.find((c: any) => c.id === courseId);

    if (!course || !course.files || course.files.length === 0) {
      alert('No files to download');
      return;
    }

    // Select download folder
    const folderResult = await window.api.selectDownloadFolder();
    if (!folderResult.success) {
      alert('Folder selection cancelled');
      return;
    }

    console.log('Download folder selected:', folderResult.folderPath);

    // Get downloaded files tracker
    const downloadedFiles = JSON.parse(localStorage.getItem('downloadedFiles') || '{}');

    // Start download
    alert(`Starting download of ${course.files.length} files to ${folderResult.folderPath}`);

    const result = await window.api.downloadAllFiles({
      courseId: course.id,
      courseName: course.name,
      files: course.files,
      basePath: folderResult.folderPath,
      downloadedFiles
    });

    if (result.success) {
      alert(`Download complete!\n${result.downloaded} downloaded\n${result.skipped} skipped\n${result.failed} failed`);

      // Update downloaded files tracker
      if (result.results) {
        result.results.forEach((r: any) => {
          if (r.status === 'downloaded' && r.filePath) {
            if (!downloadedFiles[courseId]) downloadedFiles[courseId] = {};
            downloadedFiles[courseId][r.fileName] = {
              downloadedAt: Date.now(),
              path: r.filePath
            };
          }
        });
        localStorage.setItem('downloadedFiles', JSON.stringify(downloadedFiles));
      }
    } else {
      alert('Download failed: ' + result.message);
    }
  } catch (error: any) {
    console.error('Download error:', error);
    alert('Download error: ' + error.message);
  }
}

