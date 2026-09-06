import '../styles/course-detail.css'
import { toast } from '../components/toast'
import { sanitizeNewsHtml } from '../security/html-sanitizer'
import { h } from '../utils/dom'
import { isNewsCached, mergeCoursesIntoCache } from '../utils/ui-helpers'
import { isItemRead, markAsRead } from '../utils/notification-store'
import { readAccountItem, writeAccountItem } from '../data/account-storage'
import type { CourseSnapshot } from '../../shared/domain'

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
    const cachedData = readAccountItem('courses');
    const courses = cachedData ? JSON.parse(cachedData) : [];
    const course = courses.find((c: any) => c.id === courseId);

    const btn = loadAllNewsBtn as HTMLButtonElement;
    const originalText = btn.textContent;
    try {
      btn.textContent = '🔄 Carregando...';
      btn.disabled = true;

      const result = await window.api.loadAllNews(courseId, course?.name || 'Unknown Course');

      if (result.success) {
        // Find current cached course
        const cachedData = readAccountItem('courses');
        if (cachedData) {
          const courses = JSON.parse(cachedData);
          const course = courses.find((c: any) => c.id === courseId);
          if (course) {
            // Merge content
            course.news = result.data;
            // Único escritor de `coursesWithFiles`: sanitiza antes de
            // cachear (SEC-001). `replaceSet: false` substitui a turma
            // pelo `id` — a semântica que este ponto já tinha.
            mergeCoursesIntoCache([course], { keepTimestamp: true });
            // Refresh UI
            fetchCourseFiles(courseId);
          }
        }
        btn.textContent = '✅ Concluído';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 3000);
      } else {
        toast.error('Erro ao carregar notícias: ' + result.error.message);
        btn.textContent = '❌ Erro';
        btn.disabled = false;
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Erro: ' + (e.message || 'Erro desconhecido'));
      btn.textContent = '❌ Erro';
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

/** Marca o item como lido e some com a bolinha dourada. Idempotente. */
function clearUnread(item: Element, type: 'file' | 'news', courseId: string, itemId: string) {
  markAsRead(type, courseId, itemId);
  item.classList.remove(type === 'news' ? 'news-item--unread' : 'file-item--unread');
  const dot = item.querySelector('.item-unread-dot');
  if (dot) {
    dot.classList.add('item-unread-dot--fading');
    setTimeout(() => dot.remove(), 300);
  }
}

/**
 * Marca o item como lido assim que o mouse passa por cima — ver a bolinha
 * já conta como "vi que está ali"; não deve ser preciso baixar/abrir o item.
 */
function markSeenOnHover(item: Element, type: 'file' | 'news', courseId: string, itemId: string) {
  item.addEventListener('mouseenter', () => clearUnread(item, type, courseId, itemId), { once: true });
}

async function fetchCourseFiles(courseId: string) {
  const filesListElement = document.getElementById('filesList')
  const newsListElement = document.getElementById('newsList')
  const courseTitleElement = document.getElementById('courseTitle')
  const courseCodeElement = document.getElementById('courseCode')

  if (!filesListElement || !newsListElement || !courseTitleElement || !courseCodeElement) return

  try {
    // Lê o cache persistente desta conta
    const cachedData = readAccountItem('courses')

    if (!cachedData) {
      filesListElement.replaceChildren(
        h('div', { className: 'error-message' }, 'Dados não encontrados. Por favor, volte ao dashboard.'),
      )
      newsListElement.replaceChildren()
      return
    }

    const coursesWithFiles = JSON.parse(cachedData)
    const course = coursesWithFiles.find((c: any) => c.id === courseId)

    if (!course) {
      filesListElement.replaceChildren(
        h('div', { className: 'error-message' }, 'Disciplina não encontrada.'),
      )
      newsListElement.replaceChildren()
      return
    }

    // Update course info
    courseTitleElement.textContent = course.name
    courseCodeElement.textContent = course.code || `ID: ${courseId}`

    // Render News
    if (!course.news || course.news.length === 0) {
      newsListElement.replaceChildren(
        h('div', { className: 'no-news' }, 'Nenhuma notícia recente'),
      )
    } else {
      newsListElement.replaceChildren()
      for (const item of course.news) {
        const unread = !isItemRead('news', courseId, item.id);
        const row = h('div', {
          className: `news-item${unread ? ' news-item--unread' : ''}`,
          dataset: { id: String(item.id) },
        });
        if (unread) row.append(h('span', { className: 'item-unread-dot' }));
        row.append(h('div', { className: 'news-title' }, item.title ?? ''));
        row.append(h('div', { className: 'news-date' }, item.date ?? ''));
        if (item.notification === 'Sim') {
          row.append(h('div', {
            className: 'news-notification',
            title: 'O professor enviou um email sobre esta notícia',
          }, '📧 Email Enviado'));
        }
        newsListElement.append(row);
      }

      // Add click + hover listeners
      const newsItems = newsListElement.querySelectorAll('.news-item')
      newsItems.forEach(item => {
        const newsId = item.getAttribute('data-id')
        if (!newsId) return
        if (item.classList.contains('news-item--unread')) {
          markSeenOnHover(item, 'news', courseId, newsId)
        }
        item.addEventListener('click', () => {
          clearUnread(item, 'news', courseId, newsId)
          openNewsModal(courseId, course.name, newsId)
        })
      })
    }

    if (!course.files || course.files.length === 0) {
      filesListElement.replaceChildren(
        h('div', { className: 'no-files' }, 'Nenhum material disponível nesta disciplina'),
      )

    } else {
      // Get downloaded status
      const downloadedFiles = JSON.parse(readAccountItem('downloads') || '{}');
      const courseDownloads = downloadedFiles[courseId] || {};

      // Verify existence
      const filePaths = Object.values(courseDownloads).map((f: any) => f.path).filter(p => p);
      if (filePaths.length > 0) {
        try {
          const existenceResults = await window.api.checkFilesExistence(filePaths);
          // Poda do cache é best-effort: rejeição vai para o catch abaixo e a lista renderiza mesmo assim.
          if (!existenceResults.success) throw new Error(existenceResults.error.message);
          let changed = false;

          existenceResults.data.forEach((res) => {
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
            writeAccountItem('downloads', JSON.stringify(downloadedFiles));
          }
        } catch (e) {
          console.error('Failed to verify files:', e);
        }
      }

      filesListElement.replaceChildren()
      for (const file of course.files) {
        const isDownloaded = !!courseDownloads[file.name];
        const unread = !isItemRead('file', courseId, file.name);

        const row = h('div', {
          className: `file-item${unread ? ' file-item--unread' : ''}`,
          dataset: { fileId: String(file.name ?? '') },
        });
        if (unread) row.append(h('span', { className: 'item-unread-dot' }));
        row.append(h('div', { className: 'file-icon' }, '📄'));
        const info = h('div', { className: 'file-info' });
        info.append(h('div', { className: 'file-name' }, file.name ?? ''));
        info.append(h('div', { className: 'file-meta' }, 'Arquivo da disciplina'));
        row.append(info);
        const action = h('div', { className: 'file-action' });
        if (isDownloaded) {
          action.append(h('span', { className: 'status-done', title: 'Baixado' }, '✅'));
        } else if (file.type === 'link') {
          action.append(h('span', { className: 'status-done', title: 'Link externo' }, '🔗'));
        } else {
          action.append(h('button', {
            className: 'btn-download-file',
            title: 'Baixar arquivo',
            dataset: { fileName: String(file.name ?? ''), fileId: String(file.id ?? '') },
          }, '⬇️'));
        }
        row.append(action);
        filesListElement.append(row);
      }

      // Hover on an unread item clears its dot
      filesListElement.querySelectorAll('.file-item--unread').forEach(item => {
        const fileName = item.getAttribute('data-file-id');
        if (fileName) markSeenOnHover(item, 'file', courseId, fileName);
      });

      // Add event listeners for individual buttons
      const downloadButtons = filesListElement.querySelectorAll('.btn-download-file');
      downloadButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const target = e.currentTarget as HTMLElement;
          const fileName = target.getAttribute('data-file-name');
          const fileId = target.getAttribute('data-file-id');

          if (fileName && fileId) {
            const fileItem = target.closest('.file-item');
            if (fileItem) clearUnread(fileItem, 'file', courseId, fileName);

            // Show spinner immediately
            target.textContent = '🔄';
            target.classList.add('spinning');

            await downloadSingleFile(course, fileId, fileName, target);
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
            targetBtn.textContent = '❌';
            targetBtn.classList.remove('spinning');
            setTimeout(() => { targetBtn.textContent = '⬇️'; }, 3000);
          }
        }
      });
    }
  } catch (error: any) {
    filesListElement.replaceChildren(
      h('div', { className: 'error-message' }, 'Erro ao carregar arquivos: ' + (error.message || 'Erro desconhecido')),
    )
  }
}

async function downloadSingleFile(course: CourseSnapshot, fileId: string, fileName: string, btnElement: HTMLElement) {
  try {
    const settings = await window.api.getSettings();

    if (!settings.lastDownloadPath) {
      const folderResult = await window.api.selectDownloadFolder();
      if (!folderResult.success) {
        btnElement.textContent = '⬇️';
        btnElement.classList.remove('spinning');
        return;
      }
    }

    const downloadedFiles = JSON.parse(readAccountItem('downloads') || '{}');

    const result = await window.api.downloadFile({
      courseId: course.id,
      courseName: course.name,
      fileId,
      fileName
    });

    if (result.success) {
      if (!downloadedFiles[course.id]) downloadedFiles[course.id] = {};
      downloadedFiles[course.id][fileName] = {
        downloadedAt: Date.now(),
        path: result.data.filePath
      };
      writeAccountItem('downloads', JSON.stringify(downloadedFiles));

      const span = document.createElement('span');
      span.className = 'status-done';
      span.textContent = '✅';
      span.title = 'Baixado';
      btnElement.replaceWith(span);

      toast.success(`Download concluído: ${fileName}`);
    } else {
      toast.error(`Erro no download: ${result.error.message}`);
      btnElement.textContent = '❌';
      btnElement.classList.remove('spinning');
    }
  } catch (error: any) {
    console.error('Download error:', error);
    toast.error('Erro ao baixar arquivo: ' + error.message);
    btnElement.textContent = '❌';
    btnElement.classList.remove('spinning');
  }
}

async function testDownloadAll(courseId: string) {
  console.log('Testing download all for course:', courseId);

  try {
    const cachedData = readAccountItem('courses');
    if (!cachedData) {
      toast.error('Dados não encontrados. Faça uma sincronização primeiro.');
      return;
    }

    const coursesWithFiles: CourseSnapshot[] = JSON.parse(cachedData);
    const course = coursesWithFiles.find((c) => c.id === courseId);

    if (!course || !course.files || course.files.length === 0) {
      toast.info('Nenhum arquivo para baixar nesta disciplina.');
      return;
    }

    const buttons = document.querySelectorAll('.btn-download-file');
    const settings = await window.api.getSettings();

    if (!settings.lastDownloadPath) {
      const folderResult = await window.api.selectDownloadFolder();
      if (!folderResult.success) {
        buttons.forEach(b => {
          b.textContent = '⬇️';
          b.classList.remove('spinning');
        });
        return;
      }
    }

    buttons.forEach(b => {
      b.textContent = '🔄';
      b.classList.add('spinning');
    });

    const downloadedFiles = JSON.parse(readAccountItem('downloads') || '{}');

    const result = await window.api.downloadAllFiles({
      courseId: course.id,
      courseName: course.name,
      // Só id e nome: o cache antigo pode carregar `script`, e script não atravessa o IPC.
      files: course.files.filter(f => f.type !== 'link').map(f => ({ id: f.id, name: f.name }))
    });

    if (result.success) {
      const { downloaded, skipped, failed, results } = result.data;
      if (failed === 0) {
        toast.success(`Download concluído! ${downloaded} baixados, ${skipped} já existiam.`);
      } else {
        toast.error(`${downloaded} baixados, ${failed} falharam. Tente novamente mais tarde.`);
      }

      results.forEach((r) => {
        if (r.status === 'downloaded') {
          if (!downloadedFiles[courseId]) downloadedFiles[courseId] = {};
          downloadedFiles[courseId][r.fileName] = {
            downloadedAt: Date.now(),
            path: r.filePath
          };
        }
      });
      writeAccountItem('downloads', JSON.stringify(downloadedFiles));
    } else {
      toast.error('Falha no download: ' + result.error.message);
    }
    fetchCourseFiles(courseId);
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
    const cachedData = readAccountItem('courses')
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
      renderNewsIntoModal(modalBody, cachedTitle, cachedDate, cachedNotification, cachedContent)
      return;
    }

    // If not cached, fetch it using Playwright
    console.log('Fetching news via Playwright for course:', courseName);
    const result = await window.api.getNewsDetail(courseId, courseName, newsId)

    if (result.success) {
      const news = result.data;
      // Guarda o conteúdo baixado no cache desta conta
      try {
        const cachedData = readAccountItem('courses');
        if (cachedData) {
          const courses = JSON.parse(cachedData);
          const course = courses.find((c: any) => c.id === courseId);
          if (course && course.news) {
            const newsItem = course.news.find((n: any) => n.id === newsId);
            if (newsItem) {
              newsItem.content = news.content;
              newsItem.title = news.title;
              newsItem.date = news.date;
              newsItem.notification = news.notification;
              // Único escritor de `coursesWithFiles`: sanitiza antes de
              // cachear (SEC-001).
              mergeCoursesIntoCache([course], { keepTimestamp: true });
              console.log('Cached news content for', newsId);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to cache news content:', e);
      }

      renderNewsIntoModal(modalBody, news.title, news.date, news.notification, news.content)
    } else {
      modalBody.replaceChildren(
        h('div', { className: 'error-message' }, 'Erro ao carregar notícia: ' + result.error.message),
      )
    }
  } catch (error: any) {
    modalBody.replaceChildren(
      h('div', { className: 'error-message' }, 'Erro ao carregar notícia: ' + error.message),
    )
  }
}

/**
 * Cabeçalho via `textContent`, corpo via sanitizador (SEC-001).
 *
 * O `body.innerHTML = sanitizeNewsHtml(...)` abaixo é o único `innerHTML`
 * com dado externo do app, e só é permitido porque o RHS é a chamada ao
 * sanitizador allowlist — todo outro dado desta tela vira nó/texto.
 */
function renderNewsIntoModal(modalBody: HTMLElement, title: string, date: string, notification: string, content: string) {
  const header = h('div', { className: 'modal-header' });
  header.append(h('h3', { className: 'modal-title' }, title ?? ''));
  const meta = h('div', { className: 'modal-meta' });
  meta.append(h('span', undefined, `📅 ${date ?? ''}`));
  if (notification === 'Sim') {
    meta.append(h('span', undefined, '🔔 Notificação enviada'));
  }
  header.append(meta);
  const body = h('div', { className: 'modal-body' });
  body.innerHTML = sanitizeNewsHtml(content);
  modalBody.replaceChildren(header, body);
}
