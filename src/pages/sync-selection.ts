import '../styles/sync-selection.css';


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

      ${hasCache ? '<a href="#/dashboard" class="back-link">← Voltar ao Dashboard</a>' : ''}
    </div>
  `;

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

    const actions = document.createElement('div');
    actions.className = 'sync-error-actions';
    actions.innerHTML = `
      <button id="retryBtn" class="btn-section-action btn-section-action--primary">🔄 Tentar novamente</button>
      ${savedCount > 0
        ? `<button id="dashboardBtn" class="btn-section-action btn-section-action--success">
             📊 Dashboard (${savedCount} disciplina${savedCount !== 1 ? 's' : ''} salva${savedCount !== 1 ? 's' : ''})
           </button>`
        : ''}
    `;

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

    if (!result.success || !result.courses) {
      throw new Error(result.message || 'Falha ao buscar disciplinas');
    }

    const courses = result.courses;
    const coursesWithContent: any[] = [];

    // Persist photo URL if returned
    if (result.photoUrl) {
      const account = JSON.parse(sessionStorage.getItem('account') || '{}');
      account.photoUrl = result.photoUrl;
      sessionStorage.setItem('account', JSON.stringify(account));
      localStorage.setItem('userPhotoUrl', result.photoUrl);
    }

    updateProgress(20, 'Disciplinas Encontradas', `${courses.length} disciplinas identificadas.`);

    // 3. Loop — save progressively so a crash never loses already-completed data
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const stepPct = 20 + ((i / courses.length) * (mode === 'fast' ? 70 : 40));

      updateProgress(
        stepPct,
        `Processando: ${course.name}`,
        `(${i + 1}/${courses.length}) Verificando arquivos e notícias...`
      );

      const filesResult = await window.api.getCourseFiles(course.id, course.name);
      let news = filesResult.success ? (filesResult.news || []) : [];

      if (mode === 'full' && news.length > 0) {
        updateProgress(stepPct + 5, `Baixando Conteúdo: ${course.name}`, `Lendo ${news.length} notícias...`);
        const contentResult = await window.api.loadAllNews(course.id, course.name);
        if (contentResult.success && contentResult.news) {
          news = contentResult.news;
        }
      }

      coursesWithContent.push({
        ...course,
        files: filesResult.success ? filesResult.files : [],
        news,
        fileCount: filesResult.success ? filesResult.files?.length || 0 : 0
      });

      // ✅ Write after every course: partial data always survives a crash
      localStorage.setItem('coursesWithFiles', JSON.stringify(coursesWithContent));
      localStorage.setItem('cacheTimestamp', Date.now().toString());
    }

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
