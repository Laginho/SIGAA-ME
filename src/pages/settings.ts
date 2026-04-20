import '../styles/settings.css';
import { toast } from '../components/toast';

export async function renderSettingsPage(container: HTMLDivElement) {
  const settings = await window.api.getSettings();

  container.innerHTML = `
    <div class="settings-page">
      <header class="settings-header">
        <a href="#/dashboard" class="back-link">← Voltar</a>
        <h1>Configurações</h1>
      </header>

      <div class="settings-content">
        <!-- Appearance -->
        <section class="settings-section">
          <h2>Aparência</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">Modo Escuro</span>
              <span class="setting-description">Alternar entre tema claro e escuro.</span>
            </div>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="themeToggle" ${settings.theme === 'dark' ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </section>

        <!-- Sync -->
        <section class="settings-section">
          <h2>Sincronização em Segundo Plano</h2>
          
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">Executar em Segundo Plano</span>
              <span class="setting-description">Manter o app aberto na bandeja do sistema para buscar novidades.</span>
            </div>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="runInBackgroundToggle" ${settings.runInBackground ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item ${!settings.runInBackground ? 'disabled-item' : ''}" id="syncIntervalContainer">
            <div class="setting-info">
              <span class="setting-label">Intervalo de Busca</span>
              <span class="setting-description">De quanto em quanto tempo verificar o SIGAA por novidades.</span>
            </div>
            <div class="setting-control">
              <select id="syncIntervalSelect" class="form-select" ${!settings.runInBackground ? 'disabled' : ''}>
                <option value="15" ${settings.syncInterval === 15 ? 'selected' : ''}>15 minutos</option>
                <option value="30" ${settings.syncInterval === 30 ? 'selected' : ''}>30 minutos</option>
                <option value="60" ${settings.syncInterval === 60 ? 'selected' : ''}>1 hora</option>
                <option value="120" ${settings.syncInterval === 120 ? 'selected' : ''}>2 horas</option>
              </select>
            </div>
          </div>

          <div class="setting-item ${!settings.runInBackground ? 'disabled-item' : ''}" id="autoDownloadContainer">
            <div class="setting-info">
              <span class="setting-label">Download Automático</span>
              <span class="setting-description">Baixar novos arquivos automaticamente se uma pasta padrão estiver definida.</span>
            </div>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="autoDownloadToggle" ${settings.autoDownloadUpdates ? 'checked' : ''} ${!settings.runInBackground ? 'disabled' : ''}>
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </section>

        <!-- General -->
        <section class="settings-section">
          <h2>Geral</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">Pasta de Download</span>
              <span class="setting-description">Caminho padrão: ${settings.lastDownloadPath || 'Sempre perguntar'}</span>
            </div>
            <div class="setting-control">
              ${settings.lastDownloadPath
      ? '<button id="clearDownloadsBtn" class="btn-danger-outline">Limpar Padrão</button>'
      : '<span class="about-info">Sempre pergunta</span>'}
            </div>
          </div>
        </section>

        <!-- About -->
        <section class="settings-section">
          <h2>Sobre</h2>
          <div class="about-info">
            <p><strong>SIGAA-ME</strong></p>
            <p>Para não depender de um app feito em Java.</p>
            <p>Versão: ${__APP_VERSION__}</p>
          </div>
        </section>
      </div>
    </div>
  `;

  // Theme Toggle Logic
  const themeToggle = document.getElementById('themeToggle') as HTMLInputElement;
  themeToggle?.addEventListener('change', async (e) => {
    const isDark = (e.target as HTMLInputElement).checked;
    const newTheme = isDark ? 'dark' : 'light';

    // Update main process
    await window.api.updateSetting('theme', newTheme);

    // Apply instantly
    document.documentElement.setAttribute('data-theme', newTheme);
    toast.info(`Tema ${newTheme === 'dark' ? 'escuro' : 'claro'} aplicado.`);
  });

    // Clear Downloads Logic
  const clearDownloadsBtn = document.getElementById('clearDownloadsBtn');
  clearDownloadsBtn?.addEventListener('click', async () => {
    await window.api.updateSetting('lastDownloadPath', null);
    toast.success('Preferência de download limpa. Perguntará novamente no próximo download.');
    renderSettingsPage(container); // Re-render to update UI
  });

  // Background Sync Logic
  const runInBackgroundToggle = document.getElementById('runInBackgroundToggle') as HTMLInputElement;
  const syncIntervalContainer = document.getElementById('syncIntervalContainer');
  const syncIntervalSelect = document.getElementById('syncIntervalSelect') as HTMLSelectElement;
  const autoDownloadContainer = document.getElementById('autoDownloadContainer');
  const autoDownloadToggle = document.getElementById('autoDownloadToggle') as HTMLInputElement;

  runInBackgroundToggle?.addEventListener('change', async (e) => {
    const isEnabled = (e.target as HTMLInputElement).checked;
    await window.api.updateSetting('runInBackground', isEnabled);
    
    // Toggle UI State
    if (isEnabled) {
      syncIntervalContainer?.classList.remove('disabled-item');
      autoDownloadContainer?.classList.remove('disabled-item');
      if (syncIntervalSelect) syncIntervalSelect.disabled = false;
      if (autoDownloadToggle) autoDownloadToggle.disabled = false;
      toast.success('Sincronização em segundo plano ativada.');
    } else {
      syncIntervalContainer?.classList.add('disabled-item');
      autoDownloadContainer?.classList.add('disabled-item');
      if (syncIntervalSelect) syncIntervalSelect.disabled = true;
      if (autoDownloadToggle) autoDownloadToggle.disabled = true;
      toast.info('Sincronização em segundo plano desativada.');
    }
  });

  syncIntervalSelect?.addEventListener('change', async (e) => {
    const value = parseInt((e.target as HTMLSelectElement).value, 10);
    await window.api.updateSetting('syncInterval', value);
    toast.success('Intervalo de busca atualizado.');
  });

  autoDownloadToggle?.addEventListener('change', async (e) => {
    const isEnabled = (e.target as HTMLInputElement).checked;
    await window.api.updateSetting('autoDownloadUpdates', isEnabled);
    if (isEnabled) {
      toast.success('Downloads automáticos ativados.');
    } else {
      toast.info('Downloads automáticos desativados.');
    }
  });
}
