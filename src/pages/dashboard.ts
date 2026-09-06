import '../styles/dashboard.css';
import type { AccountProfile } from '../../shared/domain';
import type { BackgroundSyncUpdate } from '../../shared/ipc';
import { toast } from '../components/toast';
import { clearActiveAccount, clearAllLocalData, getActiveAccount, readAccountItem } from '../data/account-storage';
import { h } from '../utils/dom';
import { formatSyncLabel, mergeCoursesIntoCache } from '../utils/ui-helpers';
import {
  seedExistingItemsAsRead,
  pushNotifications,
  getAllNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  courseHasUnread
} from '../utils/notification-store';

/**
 * Handle a background sync update — exported for unit testing.
 *
 * O evento só é aceito se vier carimbado com a conta que está logada nesta
 * janela (DATA-001). Um sync disparado antes de uma troca de conta chega
 * depois dela: sem esta guarda, ele escreveria as disciplinas de quem saiu no
 * cache de quem entrou.
 */
export function handleBackgroundSyncUpdate(data: BackgroundSyncUpdate): void {
  const active = getActiveAccount();
  if (!active || data.accountId !== active.id) {
    console.warn('[Dashboard] Ignoring a background sync update that does not belong to the account signed in here.');
    return;
  }

  console.log('[Dashboard] Received background sync update:', data.courses.length, 'courses');
  if (data.courses.length > 0) {
    try {
      mergeCoursesIntoCache(data.courses, { replaceSet: true }, data.timestamp);
    } catch (error) {
      // Quota: the sync result could not be saved. The user must know —
      // silently dropping a sync is how stale data masquerades as fresh.
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar a sincronização.');
      return;
    }
    loadCoursesFromCache();
  }

  // Push notification items from the sync
  if (data.notifications.length > 0) {
    pushNotifications(data.notifications);
    updateBellBadge();
    toast.info(`${data.notifications.length} nova(s) atualização(ões) encontrada(s).`);
  }
}

export function renderDashboardPage(app: HTMLDivElement, account: AccountProfile) {
  // Seed read state for items that existed before this feature was added
  seedExistingItemsAsRead();

  // Title Case Helper
  const toTitleCase = (str: string) => {
    return str.toLowerCase().split(' ').map(word => {
      // Exceptions for Portuguese prepositions
      if (['de', 'da', 'do', 'dos', 'das', 'e'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  };

  // Fallback: a foto guardada é da conta ativa, nunca de quem usou antes.
  if (!account.photoUrl) {
    const savedPhotoUrl = readAccountItem('photo');
    if (savedPhotoUrl) {
      account.photoUrl = savedPhotoUrl;
    }
  }

  const name: string = toTitleCase(account.name);

  app.innerHTML = `
    <div class="dashboard-container">
      <header class="dashboard-header"> 
        <div class="user-info">
        </div>
        <div class="header-actions">
          <div class="sync-status-container" style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; margin-right: 1rem; gap: 4px;">
            <span id="syncStatusManual" class="sync-status" style="margin: 0; line-height: 1.2;"></span>
            <span id="syncStatusAuto" class="sync-status" style="margin: 0; line-height: 1.2;"></span>
          </div>
          <div class="notification-bell-wrapper">
            <button id="notificationBellBtn" class="btn-notification-bell" title="Notificações">
              🔔
            </button>
            <div id="notificationDropdown" class="notification-dropdown">
              <div class="notification-dropdown-header">
                <span class="notification-dropdown-title">Notificações</span>
                <button id="markAllReadBtn" class="btn-mark-all-read" title="Marcar tudo como lido">Marcar como lido</button>
              </div>
              <div id="notificationList" class="notification-list">
                <!-- Populated dynamically -->
              </div>
            </div>
          </div>
          <button id="refreshBtn" class="btn-refresh" title="Sincronizar">🔄</button>
          <button id="settingsBtn" class="btn-settings" title="Configurações">⚙️</button>
          <button id="clearDataBtn" class="btn-clear-data" title="Limpar todos os dados locais">🗑️</button>
          <button id="logoutBtn" class="btn-logout">Sair</button>
        </div>
      </header>

      <main class="dashboard-content">
        <section class="courses-section">
          <h2>Suas Disciplinas</h2>
          <div id="coursesList" class="courses-grid">
            <div class="loading-courses">Carregando disciplinas...</div>
          </div>
        </section>
      </main>
    </div>
  `;

  // Dados do SIGAA viram nós, nunca HTML (SEC-001). A foto só entra no
  // atributo `src` com allowlist de origem do portal.
  const userInfo = app.querySelector('.user-info');
  if (userInfo) {
    const placeholder = h('div', { className: 'user-photo-placeholder' }, name.charAt(0));
    if (typeof account.photoUrl === 'string' && account.photoUrl.startsWith('https://si3.ufc.br/')) {
      const photo = document.createElement('img');
      photo.src = account.photoUrl;
      photo.alt = 'Foto de Perfil';
      photo.className = 'user-photo';
      placeholder.style.display = 'none';
      photo.addEventListener('error', () => {
        photo.style.display = 'none';
        placeholder.style.display = 'flex';
      });
      userInfo.append(photo, placeholder);
    } else {
      userInfo.append(placeholder);
    }
    const details = h('div', { className: 'user-details' });
    const nameEl = h('h1', { className: 'user-name' });
    nameEl.textContent = 'Olá, ' + name;
    details.append(nameEl);
    details.append(h('p', { className: 'user-status' }, 'Bem-vindo ao SIGAA-ME'));
    userInfo.append(details);
  }
  updateBellBadge();

  // ─── Notification Bell Logic ───────────────────────────
  const bellBtn = document.getElementById('notificationBellBtn');
  const dropdown = document.getElementById('notificationDropdown');
  const markAllBtn = document.getElementById('markAllReadBtn');

  bellBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('open');
    if (dropdown?.classList.contains('open')) {
      renderNotificationList();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (dropdown?.classList.contains('open') && !dropdown.contains(e.target as Node) && e.target !== bellBtn) {
      dropdown.classList.remove('open');
    }
  });

  markAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    markAllAsRead();
    updateBellBadge();
    renderNotificationList();
    // Also refresh course cards to remove unread dots
    loadCoursesFromCache();
    toast.info('Todas as notificações marcadas como lidas.');
  });

  // ─── Settings handler ─────────────────────────────────
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    window.location.hash = '#/settings';
  });

  // Logout handler - clears credentials and session, but keeps cached data
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
      await window.api.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Só a sessão: o cache com escopo desta conta fica, para o próximo login
    // dela ser rápido. Ele é invisível para qualquer outra conta.
    clearActiveAccount();
    window.location.hash = '#/login';
  });

  // Clear data handler
  document.getElementById('clearDataBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('clearDataBtn') as HTMLButtonElement;
    if (btn.dataset.confirming) {
      // Second click — execute
      delete btn.dataset.confirming;
      btn.innerHTML = '🗑️';
      btn.title = 'Limpar todos os dados locais';
      try {
        await window.api.clearAllData();
      } catch (e) {
        console.error('Clear data error:', e);
      }
      clearAllLocalData();
      toast.success('Dados locais removidos.');
      setTimeout(() => { window.location.hash = '#/login'; }, 1200);
    } else {
      // First click — ask for confirmation via button state
      btn.dataset.confirming = '1';
      btn.innerHTML = '⚠️';
      btn.title = 'Clique novamente para confirmar a exclusão de todos os dados';
      toast.info('Clique novamente no botão ⚠️ para confirmar a limpeza de dados.');
      setTimeout(() => {
        // Reset if user doesn't confirm within 4s
        if (btn.dataset.confirming) {
          delete btn.dataset.confirming;
          btn.innerHTML = '🗑️';
          btn.title = 'Limpar todos os dados locais';
        }
      }, 4000);
    }
  });

  // Refresh button handler
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    // Redirect to Sync Selection screen for manual refresh
    window.location.hash = '#/sync-selection';
  });

  // Listen for background sync updates to refresh dashboard in real-time
  window.api.onBackgroundSyncUpdate(handleBackgroundSyncUpdate);

  // Load courses from cache
  loadCoursesFromCache();
}

/** Update the bell badge count */
function updateBellBadge() {
  const bellBtn = document.getElementById('notificationBellBtn');
  if (!bellBtn) return;
  const count = getUnreadCount();
  const existingBadge = bellBtn.querySelector('.notification-badge');
  if (existingBadge) existingBadge.remove();
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'notification-badge';
    badge.textContent = count > 9 ? '9+' : String(count);
    bellBtn.appendChild(badge);
  }
}

/** Render the notification dropdown list */
function renderNotificationList() {
  const listEl = document.getElementById('notificationList');
  if (!listEl) return;

  const notifications = getAllNotifications();
  if (notifications.length === 0) {
    listEl.innerHTML = '<div class="notification-empty">Nenhuma notificação recente</div>';
    return;
  }

  listEl.replaceChildren();
  for (const n of notifications) {
    const row = h('div', {
      className: `notification-item${n.read ? '' : ' notification-item--unread'}`,
      dataset: { type: n.type, courseId: n.courseId, itemId: n.itemId },
    });
    row.append(h('span', { className: 'notification-item-icon' }, n.type === 'file' ? '📄' : '📰'));
    const content = h('div', { className: 'notification-item-content' });
    content.append(h('span', { className: 'notification-item-title' }, n.itemTitle ?? ''));
    content.append(h('span', { className: 'notification-item-course' }, n.courseName ?? ''));
    row.append(content);
    if (!n.read) row.append(h('span', { className: 'notification-unread-dot' }));
    listEl.append(row);
  }

  // Add click listeners for shortcuts
  listEl.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.getAttribute('data-type') as 'file' | 'news';
      const courseId = item.getAttribute('data-course-id')!;
      const itemId = item.getAttribute('data-item-id')!;

      // Mark as read
      markAsRead(type, courseId, itemId);
      updateBellBadge();
      item.classList.remove('notification-item--unread');
      item.querySelector('.notification-unread-dot')?.remove();

      // Navigate to the course detail page
      const dropdown = document.getElementById('notificationDropdown');
      dropdown?.classList.remove('open');
      window.location.hash = `#/course/${courseId}`;
    });
  });
}



function loadCoursesFromCache() {
  const coursesListElement = document.getElementById('coursesList');
  const syncStatusManual = document.getElementById('syncStatusManual');
  const syncStatusAuto = document.getElementById('syncStatusAuto');
  if (!coursesListElement) return;

  try {
    const cachedData = readAccountItem('courses');
    const cacheTimestamp = readAccountItem('sync-timestamp');

    if (cachedData) {
      console.log('Loading from cache...');
      const coursesWithFiles = JSON.parse(cachedData);
      displayCourses(coursesWithFiles, coursesListElement);

      if (cacheTimestamp && syncStatusManual) {
        syncStatusManual.textContent = `Sync manual: ${formatSyncLabel(parseInt(cacheTimestamp)).replace('hoje às ', '')}`;
      }

      // Load and display auto sync status
      window.api.getSettings().then(settings => {
        if (settings.lastBackgroundSync && syncStatusAuto) {
          syncStatusAuto.textContent = `Sync automático: ${formatSyncLabel(settings.lastBackgroundSync).replace('hoje às ', '')}`;
        }
      }).catch(console.error);

    } else {
      // Should normally be handled by main.ts redirect, but just in case:
      coursesListElement.innerHTML = '<div class="no-courses">Nenhum dado encontrado. <a href="#/sync-selection">Sincronizar agora</a></div>';
    }
  } catch (error: any) {
    console.error('Error loading courses:', error);
    coursesListElement.replaceChildren(
      h('div', { className: 'error-message' }, 'Erro ao carregar cache: ' + error.message),
    );
  }
}

function displayCourses(coursesWithFiles: any[], coursesListElement: HTMLElement) {
  if (coursesWithFiles.length === 0) {
    coursesListElement.innerHTML = `
      <div class="no-courses">Nenhuma disciplina ativa encontrada</div>
    `;
  } else {
    coursesListElement.replaceChildren();
    for (const course of coursesWithFiles) {
      const hasUnread = courseHasUnread(course.id);
      // O `id` entra numa string JS do listener, nunca em HTML (SEC-001):
      // fim da rota dentro de handler inline.
      const card = h('div', {
        className: 'course-card',
        onClick: () => { window.location.hash = '#/course/' + course.id; },
      });
      const header = h('div', { className: 'course-card-header' });
      header.append(h('h3', undefined, course.name ?? ''));
      if (hasUnread) header.append(h('span', { className: 'course-unread-dot', title: 'Novidades' }));
      card.append(header);
      card.append(h('p', { className: 'course-code' }, course.code || 'Sem código'));
      card.append(h('p', { className: 'course-period' }, course.period || 'Período não especificado'));
      card.append(h('p', { className: 'course-files-count' }, `${course.fileCount || course.files?.length || 0} arquivos`));
      coursesListElement.append(card);
    }
  }
}

