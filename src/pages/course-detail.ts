import '../styles/course-detail.css'
import { toast } from '../components/toast'
import { isNewsCached } from '../utils/ui-helpers'
import { isItemRead, markAsRead } from '../utils/notification-store'

export function renderCourseDetailPage(container: HTMLDivElement, courseId: string) {
  container.innerHTML = `
    <div class="course-detail-page">
      <div class="course-header">
        <button id="backButton" class="back-button">← Voltar</button>
        <h1 id="courseTitle">Carregando...</h1>
        <p id="courseCode" class="course-code-header"></p>
      </div>
      
      <!-- News Section -->
      <div class="course-content mb-4">
        <section class="news-section">
          <div class="section-header">
            <h2>Notícias da Disciplina</h2>
            <button id="loadAllNewsBtn" class="btn-section-action btn-section-action--warning">📰 Carregar todas</button>
          </div>
          <div id="newsList" class="news-list">
            <div class="loading">Carregando notícias...</div>
          </div>
        </section>
      </div>

      <!-- Files Section -->
      <div class="course-content">
        <section class="files-section">
          <div class="section-header">
            <h2>Materiais da Disciplina</h2>
            <button id="downloadAllBtn" class="btn-section-action btn-section-action--success">⬇️ Baixar todos</button>
          </div>
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
    // Não existe retomada de sync — ver a nota sobre `pauseSync` mais abaixo.
    window.location.hash = '#/dashboard'
  })

  // Download all button handler
  const downloadAllBtn = document.getElementById('downloadAllBtn')
  downloadAllBtn?.addEventListener('click', async () => {
    await testDownloadAll(courseId)
  })

  // Load All News handler
  const loadAllNewsBtn = document.getElementById('loadAllNewsBtn')
  loadAllNewsBtn?.addEventListener('click', async () => {
    // Get fresh course data for name
    const cachedData = localStorage.getItem('coursesWithFiles');
    const courses = cachedData ? JSON.parse(cachedData) : [];
    const course = courses.find((c: any) => c.id === courseId);

    const btn = loadAllNewsBtn as HTMLButtonElement;
    const originalText = btn.innerHTML;
    try {
      btn.innerHTML = '🔄 Carregando...';
      btn.disabled = true;

      const result = await window.api.loadAllNews(courseId, course?.name || 'Unknown Course');

      if (result.success && result.news) {
        // Find current cached course
        const cachedData = localStorage.getItem('coursesWithFiles');
        if (cachedData) {
          const courses = JSON.parse(cachedData);
          const course = courses.find((c: any) => c.id === courseId);
          if (course) {
            // Merge content
            course.news = result.news;
            localStorage.setItem('coursesWithFiles', JSON.stringify(courses));
            // Refresh UI
            fetchCourseFiles(courseId);
          }
        }
        btn.innerHTML = '✅ Concluído';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }, 3000);
      } else {
        toast.error('Erro ao carregar notícias: ' + (result.message || 'Erro desconhecido'));
        btn.innerHTML = '❌ Erro';
        btn.disabled = false;
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Erro: ' + (e.message || 'Erro desconhecido'));
      btn.innerHTML = '❌ Erro';
      btn.disabled = false;
    }
  })

  // Fetch course files
  fetchCourseFiles(courseId)

  // Não existe pausa de sync. Havia aqui uma chamada a `api.pauseSync()` com
  // cast `as any` e try/catch: nem o preload expõe isso, nem o main tem handler
  // `pause-sync`. O cast calava o typecheck e o catch calava o runtime, então o
  // código parecia proteger contra sync concorrente e não fazia nada.
  // Se a proteção for necessária, ela precisa ser implementada de verdade —
  // handler no main, ponte no preload, teste que falhe sem ela.
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
        <div class="no-news">Nenhuma notícia recente</div>
      `
    } else {
      newsListElement.innerHTML = course.news.map((item: any) => {
        const unread = !isItemRead('news', courseId, item.id);
        return `
        <div class="news-item ${unread ? 'news-item--unread' : ''}" data-id="${item.id}">
          ${unread ? '<span class="item-unread-dot"></span>' : ''}
          <div class="news-title">${item.title}</div>
          <div class="news-date">${item.date}</div>
          ${item.notification === 'Sim' ? '<div class="news-notification" title="O professor enviou um email sobre esta notícia">📧 Email Enviado</div>' : ''}
        </div>
      `}).join('')

      // Add click listeners
      const newsItems = newsListElement.querySelectorAll('.news-item')
      newsItems.forEach(item => {
        item.addEventListener('click', () => {
          const newsId = item.getAttribute('data-id')
          if (newsId) {
            // Mark as read and remove dot
            markAsRead('news', courseId, newsId);
            item.classList.remove('news-item--unread');
            const dot = item.querySelector('.item-unread-dot');
            if (dot) {
              dot.classList.add('item-unread-dot--fading');
              setTimeout(() => dot.remove(), 300);
            }
            openNewsModal(courseId, course.name, newsId)
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
      const courseDownloads = downloadedFiles[courseId] || {};

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
        const unread = !isItemRead('file', courseId, file.name);

        return `
        <div class="file-item ${unread ? 'file-item--unread' : ''}" data-file-id="${file.name}">
          ${unread ? '<span class="item-unread-dot"></span>' : ''}
          <div class="file-icon">📄</div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">Arquivo da disciplina</div>
          </div>
          <div class="file-action">
            ${isDownloaded
            ? '<span class="status-done" title="Baixado">✅</span>'
            : `<button class="btn-download-file" title="Baixar arquivo" data-file-name="${file.name}" data-file-url="${file.url}" data-file-script="${file.script || ''}">⬇️</button>`
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
          const script = target.getAttribute('data-file-script');

          if (fileName && (fileUrl || script)) {
            // Mark as read and remove dot
            markAsRead('file', courseId, fileName);
            const fileItem = target.closest('.file-item');
            if (fileItem) {
              fileItem.classList.remove('file-item--unread');
              const dot = fileItem.querySelector('.item-unread-dot');
              if (dot) {
                dot.classList.add('item-unread-dot--fading');
                setTimeout(() => dot.remove(), 300);
              }
            }

            // Show spinner immediately
            target.innerHTML = '🔄';
            target.classList.add('spinning');

            await downloadSingleFile(course, fileName, fileUrl || '', target, script || undefined);
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

async function downloadSingleFile(course: any, fileName: string, fileUrl: string, btnElement: HTMLElement, script?: string) {
  try {
    const settings = await window.api.getSettings();
    let folderPath = settings.lastDownloadPath;

    if (!folderPath) {
      const folderResult = await window.api.selectDownloadFolder();
      if (!folderResult.success) {
        btnElement.innerHTML = '⬇️';
        btnElement.classList.remove('spinning');
        return;
      }
      folderPath = folderResult.folderPath;
      // Save for next time
      await window.api.updateSetting('lastDownloadPath', folderPath);
    }

    const downloadedFiles = JSON.parse(localStorage.getItem('downloadedFiles') || '{}');

    const result = await window.api.downloadFile({
      courseId: course.id,
      courseName: course.name,
      fileName: fileName,
      fileUrl: fileUrl,
      basePath: folderPath,
      downloadedFiles,
      script
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

      toast.success(`Download concluído: ${fileName}`);
    } else {
      toast.error(`Erro no download: ${result.message || 'Erro desconhecido'}`);
      btnElement.innerHTML = '❌';
      btnElement.classList.remove('spinning');
    }
  } catch (error: any) {
    console.error('Download error:', error);
    toast.error('Erro ao baixar arquivo: ' + error.message);
    btnElement.innerHTML = '❌';
    btnElement.classList.remove('spinning');
  }
}

async function testDownloadAll(courseId: string) {
  console.log('Testing download all for course:', courseId);

  try {
    const cachedData = localStorage.getItem('coursesWithFiles');
    if (!cachedData) {
      toast.error('Dados não encontrados. Faça uma sincronização primeiro.');
      return;
    }

    const coursesWithFiles = JSON.parse(cachedData);
    const course = coursesWithFiles.find((c: any) => c.id === courseId);

    if (!course || !course.files || course.files.length === 0) {
      toast.info('Nenhum arquivo para baixar nesta disciplina.');
      return;
    }

    const buttons = document.querySelectorAll('.btn-download-file');
    const settings = await window.api.getSettings();
    let folderPath = settings.lastDownloadPath;

    if (!folderPath) {
      const folderResult = await window.api.selectDownloadFolder();
      if (!folderResult.success) {
        buttons.forEach(b => {
          b.innerHTML = '⬇️';
          b.classList.remove('spinning');
        });
        return;
      }
      folderPath = folderResult.folderPath;
      // Save for next time
      await window.api.updateSetting('lastDownloadPath', folderPath);
    }

    console.log('Download folder selected:', folderPath);

    buttons.forEach(b => {
      b.innerHTML = '🔄';
      b.classList.add('spinning');
    });

    const downloadedFiles = JSON.parse(localStorage.getItem('downloadedFiles') || '{}');

    const result = await window.api.downloadAllFiles({
      courseId: course.id,
      courseName: course.name,
      files: course.files,
      basePath: folderPath,
      downloadedFiles
    });

    // O main omite os contadores quando falha antes de entrar na disciplina,
    // então o contrato os declara opcionais. Normalizar aqui evita quatro
    // `?? 0` espalhados pelas interpolações.
    const downloaded = result.downloaded ?? 0;
    const skipped = result.skipped ?? 0;
    const failed = result.failed ?? 0;

    if (result.success || downloaded > 0 || skipped > 0) {
      if (failed === 0) {
        toast.success(`Download concluído! ${downloaded} baixados, ${skipped} já existiam.`);
      } else {
        toast.error(`${downloaded} baixados, ${failed} falharam. Tente novamente mais tarde.`);
      }

      if (result.results) {
        result.results.forEach((r) => {
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
      toast.error('Falha no download: ' + (result.message || 'Erro desconhecido'));
      fetchCourseFiles(courseId);
    }
  } catch (error: any) {
    console.error('Download error:', error);
    toast.error('Erro no processo de download: ' + error.message);
    fetchCourseFiles(courseId);
  }
}


async function openNewsModal(courseId: string, courseName: string, newsId: string) {
  const modal = document.getElementById('newsModal')
  const modalBody = document.getElementById('modalBody')
  const closeBtn = modal?.querySelector('.modal-close')

  if (!modal || !modalBody) return

  // Only show the loading spinner if content isn't already cached
  if (!isNewsCached(courseId, newsId)) {
    modalBody.innerHTML = '<div class="loading">Carregando detalhes da notícia...</div>';
  }
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
    // Check cache first
    const cachedData = localStorage.getItem('coursesWithFiles')
    let cachedContent = null;
    let cachedTitle = '';
    let cachedDate = '';
    let cachedNotification = '';

    if (cachedData) {
      const courses = JSON.parse(cachedData);
      const course = courses.find((c: any) => c.id === courseId);
      if (course && course.news) {
        const newsItem = course.news.find((n: any) => n.id === newsId);
        if (newsItem) {
          cachedTitle = newsItem.title;
          cachedDate = newsItem.date;
          cachedNotification = newsItem.notification;
          if (newsItem.content) {
            cachedContent = newsItem.content;
          }
        }
      }
    }

    if (cachedContent) {
      console.log('Using cached news content');
      modalBody.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">${cachedTitle}</h3>
          <div class="modal-meta">
            <span>📅 ${cachedDate}</span>
            ${cachedNotification === 'Sim' ? '<span>🔔 Notificação enviada</span>' : ''}
          </div>
        </div>
        <div class="modal-body">
          ${cachedContent}
        </div>
      `
      return;
    }

    // If not cached, fetch it using Playwright
    console.log('Fetching news via Playwright for course:', courseName);
    const result = await window.api.getNewsDetail(courseId, courseName, newsId)

    if (result.success && result.news) {
      // Cache the fetched content in localStorage
      try {
        const cachedData = localStorage.getItem('coursesWithFiles');
        if (cachedData) {
          const courses = JSON.parse(cachedData);
          const course = courses.find((c: any) => c.id === courseId);
          if (course && course.news) {
            const newsItem = course.news.find((n: any) => n.id === newsId);
            if (newsItem) {
              newsItem.content = result.news.content;
              newsItem.title = result.news.title;
              newsItem.date = result.news.date;
              newsItem.notification = result.news.notification;
              localStorage.setItem('coursesWithFiles', JSON.stringify(courses));
              console.log('Cached news content for', newsId);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to cache news content:', e);
      }

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
