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
            <p>Versão: 1.0.3</p>
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
}
