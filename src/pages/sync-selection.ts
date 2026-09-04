import '../styles/sync-selection.css';
import { h } from '../utils/dom';
import { mergeCoursesIntoCache } from '../utils/ui-helpers';
import type { CourseSnapshot, CourseSummary } from '../../shared/domain';

/**
 * Guarda de runtime por cima do tipo. O contrato diz `CourseSummary[]`, mas o
 * dado nasce do HTML do portal: se o SIGAA mudar e o parser passar a devolver
 * outra forma, isso aparece aqui como falha explícita (QA-003), em vez de
 * `undefined` vazando para dentro do localStorage.
 */
function isCourseLike(value: unknown): value is CourseSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.name === 'string';
}


export function renderSyncSelectionPage(app: HTMLDivElement) {
  // Check if user has cached data (meaning they can go back)
  const hasCache = localStorage.getItem('coursesWithFiles');

  app.innerHTML = `
    <div class="sync-selection-container">
      <header class="sync-header">
        <h1 class="sync-title">Selecione o Modo de Sincronização</h1>
        <p class="sync-subtitle">Como você deseja carregar seus dados hoje?</p>
      </header>

      <div class="sync-cards-container">
        <!-- Fast Sync (Novice) -->
        <div class="sync-card" id="btnFastSync">
          <div class="card-icon">⚡</div>
          <h2 class="card-title">Modo Rápido</h2>
          <p class="card-subtitle">Apenas o essencial</p>
          <p class="card-description">
            Verifica se há novas disciplinas, arquivos e títulos de notícias.
            Ideal para uma checagem rápida do dia-a-dia.
          </p>
          <div class="card-meta">Tempo estimado: ~10 seg</div>
        </div>

        <!-- Full Sync (Witcher) -->
        <div class="sync-card" id="btnFullSync">
          <div class="card-icon">📖</div>
          <h2 class="card-title">Modo Completo</h2>
          <p class="card-subtitle">Leitura Offline</p>
          <p class="card-description">
            Além da estrutura básica, baixa o <strong>conteúdo completo</strong> de todas as notícias
            para que você possa ler tudo offline.
          </p>
          <div class="card-meta">Tempo estimado: ~1-2 min</div>
        </div>

        <!-- Download All (Legend) -->
        <div class="sync-card disabled" title="Em breve">
          <div class="card-icon">💾</div>
          <h2 class="card-title">Modo Backup</h2>
          <p class="card-subtitle">Arquivista</p>
          <p class="card-description">
            Baixa absolutamente TODOS os arquivos do semestre para seu computador.
            Garanta que nada será perdido.
          </p>
          <div class="card-meta">Em breve</div>
        </div>
      </div>

    </div>
  `;

  if (hasCache) {
    const backLink = document.createElement('a');
    backLink.href = '#/dashboard';
    backLink.className = 'back-link';
    backLink.textContent = '← Voltar ao Dashboard';
    app.querySelector('.sync-selection-container')?.append(backLink);
  }

  // Event Listeners
  document.getElementById('btnFastSync')?.addEventListener('click', () => startSync(app, 'fast'));
  document.getElementById('btnFullSync')?.addEventListener('click', () => startSync(app, 'full'));
}

async function startSync(app: HTMLDivElement, mode: 'fast' | 'full') {
  // 1. Show Progress Overlay
  const overlay = document.createElement('div');
  overlay.className = 'sync-progress-overlay';
  overlay.innerHTML = `
    <div class="spinner-sword" id="syncSpinner"></div>
    <h2 class="overlay-title" id="overlayTitle">Sincronizando...</h2>
    <p id="progressStatus" class="overlay-status">Iniciando...</p>

    <div class="progress-list">
      <div class="progress-bar-container">
        <div class="progress-bar-fill" id="progressBar"></div>
      </div>
      <div class="progress-text" id="progressDetail">Preparando ambiente...</div>
    </div>
  `;
  app.appendChild(overlay);

  // Helper: update progress bar + labels
  const updateProgress = (pct: number, status: string, detail: string) => {
    const bar = document.getElementById('progressBar');
    const statusEl = document.getElementById('progressStatus');
    const detailEl = document.getElementById('progressDetail');
    if (bar) bar.style.width = `${pct}%`;
    if (statusEl) statusEl.textContent = status;
    if (detailEl) detailEl.textContent = detail;
  };

  // Helper: replace spinner with an inline error state — no alert()
  const showError = (message: string, savedCount: number) => {
    const spinner = document.getElementById('syncSpinner');
    const title = document.getElementById('overlayTitle');
    const detailEl = document.getElementById('progressDetail');
    const bar = document.getElementById('progressBar');

    if (spinner) spinner.style.display = 'none';
    if (title) { title.textContent = 'Sincronização interrompida'; title.style.color = '#ff5555'; }
    if (bar) bar.style.background = '#ff5555';
    if (detailEl) { detailEl.textContent = message; detailEl.style.color = '#ff5555'; }

    const actions = h('div', { className: 'sync-error-actions' });
    actions.append(h('button', {
      className: 'btn-section-action btn-section-action--primary',
      id: 'retryBtn',
    }, '🔄 Tentar novamente'));
    if (savedCount > 0) {
      const plural = savedCount !== 1 ? 's' : '';
      actions.append(h('button', {
        className: 'btn-section-action btn-section-action--success',
        id: 'dashboardBtn',
      }, `📊 Dashboard (${savedCount} disciplina${plural} salva${plural})`));
    }

    overlay.querySelector('.progress-list')?.after(actions);

    document.getElementById('retryBtn')?.addEventListener('click', () => {
      overlay.remove();
      startSync(app, mode);
    });
    document.getElementById('dashboardBtn')?.addEventListener('click', () => {
      window.location.hash = '#/dashboard';
    });
  };

  try {
    // 2. Fetch Courses
    updateProgress(10, 'Buscando Disciplinas', 'Verificando turmas ativas...');
    const result = await window.api.getCourses();

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const received = result.data.courses;
    const courses = received.filter(isCourseLike);
    const coursesWithContent: CourseSnapshot[] = [];

    // Zero disciplinas utilizáveis num retorno não vazio significa que o
    // formato mudou — deriva de seletor, não "aluno sem matrícula". Falhar
    // alto aqui é melhor que sincronizar dados vazios em cima do cache bom.
    if (courses.length === 0 && received.length > 0) {
      throw new Error(
        `O SIGAA devolveu ${received.length} disciplina(s) em formato desconhecido. ` +
        'O app provavelmente precisa ser atualizado.'
      );
    }

    if (courses.length < received.length) {
      console.warn(
        `${received.length - courses.length} de ${received.length} disciplinas ignoradas por não terem id/name utilizáveis.`
      );
    }

    // Persist photo URL if returned
    if (result.data.photoUrl) {
      const account = JSON.parse(sessionStorage.getItem('account') || '{}');
      account.photoUrl = result.data.photoUrl;
      sessionStorage.setItem('account', JSON.stringify(account));
      localStorage.setItem('userPhotoUrl', result.data.photoUrl);
    }

    updateProgress(20, 'Disciplinas Encontradas', `${courses.length} disciplinas identificadas.`);

    // 3. Loop — save progressively so a crash never loses already-completed data.
    // A failed course keeps its previous snapshot: it is recorded in
    // `failures` and skipped, never merged as an empty course over good cache.
    const failures: { name: string; message: string }[] = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const stepPct = 20 + ((i / courses.length) * (mode === 'fast' ? 70 : 40));

      updateProgress(
        stepPct,
        `Processando: ${course.name}`,
        `(${i + 1}/${courses.length}) Verificando arquivos e notícias...`
      );

      const filesResult = await window.api.getCourseFiles(course.id, course.name);
      if (filesResult.success === false) {
        failures.push({ name: course.name, message: filesResult.error.message });
        continue;
      }
      const files = filesResult.data.files;
      let news = filesResult.data.news;

      if (mode === 'full' && news.length > 0) {
        updateProgress(stepPct + 5, `Baixando Conteúdo: ${course.name}`, `Lendo ${news.length} notícias...`);
        const contentResult = await window.api.loadAllNews(course.id, course.name);
        if (contentResult.success) {
          news = contentResult.data;
        }
      }

      const synced: CourseSnapshot = { ...course, files, news, fileCount: files.length };
      coursesWithContent.push(synced);

      // Merge: preserves courses not yet processed this run and previously
      // downloaded news content (a fast sync must not wipe the offline corpus).
      mergeCoursesIntoCache([synced]);
    }

    // A failure blocks the replaceSet: a course that left the enrollment is
    // only dropped from the cache on a fully clean sync.
    if (failures.length > 0) {
      const savedSoFar = (() => {
        try { return JSON.parse(localStorage.getItem('coursesWithFiles') || '[]').length; } catch { return 0; }
      })();
      const detail = failures.map(f => `${f.name} — ${f.message}`).join('; ');
      showError(`${failures.length} disciplina(s) falharam: ${detail}`, savedSoFar);
      return;
    }

    // Full pass succeeded: the synced set IS the enrollment; drop stale courses.
    mergeCoursesIntoCache(coursesWithContent, { replaceSet: true });

    updateProgress(100, 'Finalizado!', `${courses.length} disciplinas sincronizadas.`);
    setTimeout(() => { window.location.hash = '#/dashboard'; }, 600);

  } catch (error: any) {
    console.error('Sync failed:', error);
    const savedSoFar = (() => {
      try { return JSON.parse(localStorage.getItem('coursesWithFiles') || '[]').length; } catch { return 0; }
    })();
    showError(`Erro: ${error.message}`, savedSoFar);
  }
}
