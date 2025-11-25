import '../styles/course-detail.css'

export function renderCourseDetailPage(container: HTMLDivElement, courseId: string) {
  container.innerHTML = `
    <div class="course-detail-page">
      <div class="course-header">
        <button id="backButton" class="back-button">← Voltar</button>
        <h1 id="courseTitle">Carregando...</h1>
        <p id="courseCode" class="course-code-header"></p>
        <button id="downloadAllBtn" class="btn-download-all">⬇️ Baixar todos os arquivos</button>
      </div>
      
      <div class="course-content">
        <section class="news-section">
          <h2>Notícias da Disciplina</h2>
          <div id="newsList" class="news-list">
            <div class="loading">Carregando notícias...</div>
          </div>
        </section>

        <section class="files-section">
          <h2>Materiais da Disciplina</h2>
          <div id="filesList" class="files-list">
            <div class="loading">Carregando arquivos...</div>
          </div>
        </section>
      </div>
      
      <!-- News Modal -->
      <div id="newsModal" class="modal-overlay">
        <div class="modal-content">
          <button class="modal-close">&times;</button>
          <div id="modalBody">
            <!-- Content injected here -->
          </div>
        </div>
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
  const newsListElement = document.getElementById('newsList')
  const courseTitleElement = document.getElementById('courseTitle')
  const courseCodeElement = document.getElementById('courseCode')

  if (!filesListElement || !newsListElement || !courseTitleElement || !courseCodeElement) return

  try {
    // Read from localStorage (persistent cache)
    const cachedData = localStorage.getItem('coursesWithFiles')

    if (!cachedData) {
      filesListElement.innerHTML = `
        <div class="error-message">
          Dados não encontrados. Por favor, volte ao dashboard.
        </div>
      `
      newsListElement.innerHTML = ''
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
      newsListElement.innerHTML = ''
      return
    }

    // Update course info
    courseTitleElement.textContent = course.name
    courseCodeElement.textContent = course.code || `ID: ${courseId}`

    // Render News
    if (!course.news || course.news.length === 0) {
      newsListElement.innerHTML = `
        <div class="no-files">Nenhuma notícia recente</div>
      `
    } else {
      newsListElement.innerHTML = course.news.map((item: any) => `
        <div class="news-item" data-id="${item.id}">
          <div class="news-title">${item.title}</div>
          <div class="news-date">${item.date}</div>
          ${item.notification === 'Sim' ? '<div class="news-notification">🔔 Notificação</div>' : ''}
        </div>
      `).join('')

      // Add click listeners
      const newsItems = newsListElement.querySelectorAll('.news-item')
      newsItems.forEach(item => {
        item.addEventListener('click', () => {
          const newsId = item.getAttribute('data-id')
          if (newsId) {
            openNewsModal(courseId, newsId)
          }
        })
      })
    }

    if (!course.files || course.files.length === 0) {
      filesListElement.innerHTML = `
        <div class="no-files">Nenhum material disponível nesta disciplina</div>
      `
    } else {
      // Get downloaded status
      const downloadedFiles = JSON.parse(localStorage.getItem('downloadedFiles') || '{}');
      let courseDownloads = downloadedFiles[courseId] || {};

      // Verify existence
      const filePaths = Object.values(courseDownloads).map((f: any) => f.path).filter(p => p);
      if (filePaths.length > 0) {
        try {
          const existenceResults = await window.api.checkFilesExistence(filePaths);
          let changed = false;

          existenceResults.forEach((res: any) => {
            if (!res.exists) {
              // Find key by path
              const key = Object.keys(courseDownloads).find(k => courseDownloads[k].path === res.path);
              if (key) {
                delete courseDownloads[key];
                changed = true;
              }
            }
          });

          if (changed) {
            downloadedFiles[courseId] = courseDownloads;
            localStorage.setItem('downloadedFiles', JSON.stringify(downloadedFiles));
          }
        } catch (e) {
          console.error('Failed to verify files:', e);
        }
      }

      filesListElement.innerHTML = course.files.map((file: any) => {
        const isDownloaded = !!courseDownloads[file.name];

        return `
        <div class="file-item">
          <div class="file-icon">📄</div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">Arquivo da disciplina</div>
          </div>
          <div class="file-action">
            ${isDownloaded
            ? '<span class="status-done" title="Baixado">✅</span>'
            : `<button class="btn-download-file" title="Baixar arquivo" data-file-name="${file.name}" data-file-url="${file.url}">⬇️</button>`
          }
          </div>
        </div>
      `}).join('')

      // Add event listeners for individual buttons
      const downloadButtons = filesListElement.querySelectorAll('.btn-download-file');
      downloadButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const target = e.currentTarget as HTMLElement;
          const fileName = target.getAttribute('data-file-name');
          const fileUrl = target.getAttribute('data-file-url');

          if (fileName && fileUrl) {
            // Show spinner immediately
            target.innerHTML = '🔄';
            target.classList.add('spinning');

            await downloadSingleFile(course, fileName, fileUrl, target);
          }
        });
      });

      // Listen for progress events from "Download All"
      if ((window as any).cleanupProgress) (window as any).cleanupProgress();

      (window as any).cleanupProgress = window.api.onDownloadProgress((data: { fileName: string, status: string }) => {
        const buttons = Array.from(document.querySelectorAll('.btn-download-file'));
        const targetBtn = buttons.find(b => b.getAttribute('data-file-name') === data.fileName) as HTMLElement;

        if (targetBtn) {
          if (data.status === 'downloaded' || data.status === 'skipped') {
            const span = document.createElement('span');
            span.className = 'status-done';
            span.textContent = '✅';
            span.title = 'Baixado';
            targetBtn.replaceWith(span);
          } else if (data.status === 'failed') {
            targetBtn.innerHTML = '❌';
            targetBtn.classList.remove('spinning');
            setTimeout(() => { targetBtn.innerHTML = '⬇️'; }, 3000);
          }
        }
      });
    }
  } catch (error: any) {
    filesListElement.innerHTML = `
      <div class="error-message">
        Erro ao carregar arquivos: ${error.message || 'Erro desconhecido'}
      </div>
    `
  }
}

async function downloadSingleFile(course: any, fileName: string, fileUrl: string, btnElement: HTMLElement) {
  try {
    const folderResult = await window.api.selectDownloadFolder();
    if (!folderResult.success) {
      btnElement.innerHTML = '⬇️';
      btnElement.classList.remove('spinning');
      return;
    }

    const downloadedFiles = JSON.parse(localStorage.getItem('downloadedFiles') || '{}');

    const result = await window.api.downloadFile({
      courseId: course.id,
      courseName: course.name,
      fileName: fileName,
      fileUrl: fileUrl,
      basePath: folderResult.folderPath,
      downloadedFiles
    });

    if (result.success) {
      if (!downloadedFiles[course.id]) downloadedFiles[course.id] = {};
      downloadedFiles[course.id][fileName] = {
        downloadedAt: Date.now(),
        path: result.filePath
      };
      localStorage.setItem('downloadedFiles', JSON.stringify(downloadedFiles));

      const span = document.createElement('span');
      span.className = 'status-done';
      span.textContent = '✅';
      span.title = 'Baixado';
      btnElement.replaceWith(span);

      alert(`Download concluído: ${fileName}`);
    } else {
      alert(`Erro no download: ${result.error}`);
      btnElement.innerHTML = '❌';
      btnElement.classList.remove('spinning');
    }
  } catch (error: any) {
    console.error('Download error:', error);
    alert('Erro ao baixar arquivo: ' + error.message);
    btnElement.innerHTML = '❌';
    btnElement.classList.remove('spinning');
  }
}

async function testDownloadAll(courseId: string) {
  console.log('Testing download all for course:', courseId);

  try {
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

    const folderResult = await window.api.selectDownloadFolder();
    if (!folderResult.success) {
      return;
    }

    console.log('Download folder selected:', folderResult.folderPath);

    const buttons = document.querySelectorAll('.btn-download-file');
    buttons.forEach(b => {
      b.innerHTML = '🔄';
      b.classList.add('spinning');
    });

    const downloadedFiles = JSON.parse(localStorage.getItem('downloadedFiles') || '{}');

    const result = await window.api.downloadAllFiles({
      courseId: course.id,
      courseName: course.name,
      files: course.files,
      basePath: folderResult.folderPath,
      downloadedFiles
    });

    if (result.success || result.downloaded > 0 || result.skipped > 0) {
      let message = `Download finalizado!\n\n✅ ${result.downloaded} baixados\n⏩ ${result.skipped} pulados\n❌ ${result.failed} falharam`;

      if (result.failed > 0 && result.results) {
        const failedFiles = result.results
          .filter((r: any) => r.status === 'failed')
          .map((r: any) => r.fileName);
        if (failedFiles.length > 0) {
          message += `\n\nFalhas:\n- ${failedFiles.join('\n- ')}`;
        }
      }

      alert(message);

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

      fetchCourseFiles(courseId);

    } else {
      alert('Falha no download: ' + (result.message || 'Erro desconhecido'));
      fetchCourseFiles(courseId);
    }
  } catch (error: any) {
    console.error('Download error:', error);
    alert('Erro no processo de download: ' + error.message);
    fetchCourseFiles(courseId);
  }
}


async function openNewsModal(courseId: string, newsId: string) {
  const modal = document.getElementById('newsModal')
  const modalBody = document.getElementById('modalBody')
  const closeBtn = modal?.querySelector('.modal-close')

  if (!modal || !modalBody) return

  // Show loading state
  modalBody.innerHTML = '<div class="loading">Carregando detalhes da notícia...</div>'
  modal.classList.add('active')

  // Close handler
  const close = () => {
    modal.classList.remove('active')
  }

  closeBtn?.addEventListener('click', close, { once: true })
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close()
  })

  try {
    const result = await window.api.getNewsDetail(courseId, newsId)

    if (result.success && result.news) {
      modalBody.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">${result.news.title}</h3>
          <div class="modal-meta">
            <span>📅 ${result.news.date}</span>
            ${result.news.notification === 'Sim' ? '<span>🔔 Notificação enviada</span>' : ''}
          </div>
        </div>
        <div class="modal-body">
          ${result.news.content}
        </div>
      `
    } else {
      modalBody.innerHTML = `
        <div class="error-message">
          Erro ao carregar notícia: ${result.message || 'Erro desconhecido'}
        </div>
      `
    }
  } catch (error: any) {
    modalBody.innerHTML = `
      <div class="error-message">
        Erro ao carregar notícia: ${error.message}
      </div>
    `
  }
}
