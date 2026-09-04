import '../styles/settings.css';
import { toast } from '../components/toast';
import { h } from '../utils/dom';

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
                <input type="checkbox" id="themeToggle">
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
                <input type="checkbox" id="runInBackgroundToggle">
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item" id="openAtLoginContainer">
            <div class="setting-info">
              <span class="setting-label">Iniciar com o Windows</span>
              <span class="setting-description">Executar o app silenciosamente na bandeja ao ligar o PC.</span>
            </div>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="openAtLoginToggle">
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item" id="syncIntervalContainer">
            <div class="setting-info">
              <span class="setting-label">Intervalo de Busca</span>
              <span class="setting-description">De quanto em quanto tempo verificar o SIGAA por novidades.</span>
            </div>
            <div class="setting-control">
              <select id="syncIntervalSelect" class="form-select">
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="120">2 horas</option>
              </select>
            </div>
          </div>

          <div class="setting-item" id="autoDownloadContainer">
            <div class="setting-info">
              <span class="setting-label">Download Automático</span>
              <span class="setting-description">Baixar novos arquivos automaticamente se uma pasta padrão estiver definida.</span>
            </div>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="autoDownloadToggle">
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
              <span class="setting-description" id="downloadPathDescription"></span>
            </div>
            <div class="setting-control" id="downloadPathControl">
            </div>
          </div>
        </section>

        <!-- About -->
        <section class="settings-section">
          <h2>Sobre</h2>
          <div class="about-info">
            <p><strong>SIGAA-ME</strong></p>
            <p>Para não depender de um app feito em Java.</p>
            <p id="appVersionLine"></p>
          </div>
        </section>
      </div>
    </div>
  `;

  // Estado vindo de config vira propriedade/texto, nunca interpolação (SEC-001).
  (document.getElementById('themeToggle') as HTMLInputElement).checked = settings.theme === 'dark';
  (document.getElementById('runInBackgroundToggle') as HTMLInputElement).checked = settings.runInBackground;
  (document.getElementById('openAtLoginToggle') as HTMLInputElement).checked = settings.openAtLogin;
  (document.getElementById('openAtLoginToggle') as HTMLInputElement).disabled = !settings.runInBackground;
  (document.getElementById('syncIntervalSelect') as HTMLSelectElement).value = String(settings.syncInterval);
  (document.getElementById('syncIntervalSelect') as HTMLSelectElement).disabled = !settings.runInBackground;
  (document.getElementById('autoDownloadToggle') as HTMLInputElement).checked = settings.autoDownloadUpdates;
  (document.getElementById('autoDownloadToggle') as HTMLInputElement).disabled = !settings.runInBackground;
  for (const id of ['openAtLoginContainer', 'syncIntervalContainer', 'autoDownloadContainer']) {
    document.getElementById(id)?.classList.toggle('disabled-item', !settings.runInBackground);
  }
  document.getElementById('downloadPathDescription')!.textContent =
    'Caminho padrão: ' + (settings.lastDownloadPath || 'Sempre perguntar');
  const downloadPathControl = document.getElementById('downloadPathControl')!;
  if (settings.lastDownloadPath) {
    const clearBtn = h('button', { className: 'btn-danger-outline', id: 'clearDownloadsBtn' }, 'Limpar Padrão');
    downloadPathControl.replaceChildren(clearBtn);
  } else {
    downloadPathControl.replaceChildren(h('span', { className: 'about-info' }, 'Sempre perguntar'));
  }
  document.getElementById('appVersionLine')!.textContent = 'Versão: ' + __APP_VERSION__;

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
  const openAtLoginContainer = document.getElementById('openAtLoginContainer');
  const openAtLoginToggle = document.getElementById('openAtLoginToggle') as HTMLInputElement;
  const syncIntervalContainer = document.getElementById('syncIntervalContainer');
  const syncIntervalSelect = document.getElementById('syncIntervalSelect') as HTMLSelectElement;
  const autoDownloadContainer = document.getElementById('autoDownloadContainer');
  const autoDownloadToggle = document.getElementById('autoDownloadToggle') as HTMLInputElement;

  runInBackgroundToggle?.addEventListener('change', async (e) => {
    const isEnabled = (e.target as HTMLInputElement).checked;
    await window.api.updateSetting('runInBackground', isEnabled);
    
    // Toggle UI State
    if (isEnabled) {
      openAtLoginContainer?.classList.remove('disabled-item');
      syncIntervalContainer?.classList.remove('disabled-item');
      autoDownloadContainer?.classList.remove('disabled-item');
      if (openAtLoginToggle) openAtLoginToggle.disabled = false;
      if (syncIntervalSelect) syncIntervalSelect.disabled = false;
      if (autoDownloadToggle) autoDownloadToggle.disabled = false;
      toast.success('Sincronização ativada.');
    } else {
      openAtLoginContainer?.classList.add('disabled-item');
      syncIntervalContainer?.classList.add('disabled-item');
      autoDownloadContainer?.classList.add('disabled-item');
      if (openAtLoginToggle) openAtLoginToggle.disabled = true;
      if (syncIntervalSelect) syncIntervalSelect.disabled = true;
      if (autoDownloadToggle) autoDownloadToggle.disabled = true;
      toast.info('Sincronização em segundo plano desativada.');
    }
  });

  openAtLoginToggle?.addEventListener('change', async (e) => {
    const isEnabled = (e.target as HTMLInputElement).checked;
    await window.api.updateSetting('openAtLogin', isEnabled);
    if (isEnabled) {
      toast.success('SIGAA-ME iniciará com o Windows.');
    } else {
      toast.info('Inicialização com o Windows desativada.');
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
