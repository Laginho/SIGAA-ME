import '../styles/sync-selection.css';


export function renderSyncSelectionPage(app: HTMLDivElement) {
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

    // Event Listeners
    document.getElementById('btnFastSync')?.addEventListener('click', () => startSync(app, 'fast'));
    document.getElementById('btnFullSync')?.addEventListener('click', () => startSync(app, 'full'));
}

async function startSync(app: HTMLDivElement, mode: 'fast' | 'full') {
    // 1. Show Progress Overlay
    const overlay = document.createElement('div');
    overlay.className = 'sync-progress-overlay';
    overlay.innerHTML = `
    <div class="spinner-sword"></div>
    <h2 style="color: #d4af37; margin-bottom: 0.5rem">Sincronizando...</h2>
    <p id="progressStatus" style="color: #aaa">Iniciando...</p>
    
    <div class="progress-list">
      <div class="progress-bar-container">
        <div class="progress-bar-fill" id="progressBar"></div>
      </div>
      <div class="progress-text" id="progressDetail">Preparando ambiente...</div>
    </div>
  `;
    app.appendChild(overlay);

    // Helper to update progress
    const updateProgress = (pct: number, status: string, detail: string) => {
        const bar = document.getElementById('progressBar');
        const statusEl = document.getElementById('progressStatus');
        const detailEl = document.getElementById('progressDetail');
        if (bar) bar.style.width = `${pct}%`;
        if (statusEl) statusEl.textContent = status;
        if (detailEl) detailEl.textContent = detail;
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
        updateProgress(20, 'Disciplinas Encontradas', `${courses.length} disciplinas identificadas.`);

        // 3. Loop through courses
        for (let i = 0; i < courses.length; i++) {
            const course = courses[i];
            const stepPct = 20 + ((i / courses.length) * (mode === 'fast' ? 70 : 40)); // Fast sync goes to 90%, Full sync structure goes to 60%

            updateProgress(stepPct, `Processando: ${course.name}`, 'Verificando arquivos e notícias...');

            // Fetch files & news headers (Fast)
            const filesResult = await window.api.getCourseFiles(course.id, course.name);

            let news = filesResult.success ? (filesResult.news || []) : [];

            // If Full Sync, fetch items content
            if (mode === 'full' && news.length > 0) {
                updateProgress(stepPct + 5, `Baixando Conteúdo: ${course.name}`, `Lendo ${news.length} notícias...`);

                // We can use the loadAllNews API which fetches content for all items
                const contentResult = await window.api.loadAllNews(course.id, course.name);
                if (contentResult.success && contentResult.news) {
                    news = contentResult.news;
                }
            }

            coursesWithContent.push({
                ...course,
                files: filesResult.success ? filesResult.files : [],
                news: news,
                fileCount: filesResult.success ? filesResult.files?.length || 0 : 0
            });
        }

        updateProgress(100, 'Finalizado', 'Salvando dados...');

        // 4. Save to Cache
        localStorage.setItem('coursesWithFiles', JSON.stringify(coursesWithContent));
        localStorage.setItem('cacheTimestamp', Date.now().toString());

        // 5. Redirect to Dashboard
        // We navigate to dashboard hash which naturally loads from cache
        setTimeout(() => {
            window.location.hash = '#/dashboard';
            // Force a re-render if we are already "technically" on dashboard route (though we are actually on sync screen)
            // But since we are creating a new route #/sync-selection, hash change will handle it.
        }, 500);

    } catch (error: any) {
        console.error('Sync failed:', error);
        const detailEl = document.getElementById('progressDetail');
        if (detailEl) {
            detailEl.textContent = `Erro: ${error.message}`;
            detailEl.style.color = '#ff5555';
        }
        // Allow user to click back or similar? For now just stuck on error or reload.
        setTimeout(() => {
            overlay.remove();
            alert(`Erro na sincronização: ${error.message}`);
        }, 2000);
    }
}
