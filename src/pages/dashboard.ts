import '../styles/dashboard.css';
import { toast } from '../components/toast';
import { formatSyncLabel, mergeCoursesIntoCache } from '../utils/ui-helpers';
import {
  seedExistingItemsAsRead,
  pushNotifications,
  getAllNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  courseHasUnread,
  NotificationItem
} from '../utils/notification-store';

interface UserAccount {
  name: string;
  photoUrl?: string;
}

export function renderDashboardPage(app: HTMLDivElement, account: UserAccount) {
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

  // Fallback: Load photoUrl from localStorage if not in account
  if (!account.photoUrl) {
    const savedPhotoUrl = localStorage.getItem('userPhotoUrl');
    if (savedPhotoUrl) {
      account.photoUrl = savedPhotoUrl;
    }
  }

  const name: string = toTitleCase(account.name);
  const unreadCount = getUnreadCount();

  app.innerHTML = `
    <div class="dashboard-container">
      <header class="dashboard-header"> 
        <div class="user-info">
          ${account.photoUrl
      ? `<img src="${account.photoUrl}" alt="Foto de Perfil" class="user-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="user-photo-placeholder" style="display:none">${name.charAt(0)}</div>`
      : `<div class="user-photo-placeholder">${name.charAt(0)}</div>`
    }
          <div class="user-details">
            <h1 class="user-name">Olá, ${name}</h1>
            <p class="user-status">Bem-vindo ao SIGAA-ME</p>
          </div>
        </div>
        <div class="header-actions">
          <div class="sync-status-container" style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; margin-right: 1rem; gap: 4px;">
            <span id="syncStatusManual" class="sync-status" style="margin: 0; line-height: 1.2;"></span>
            <span id="syncStatusAuto" class="sync-status" style="margin: 0; line-height: 1.2;"></span>
          </div>
          <div class="notification-bell-wrapper">
            <button id="notificationBellBtn" class="btn-notification-bell" title="Notificações">
              🔔
              ${unreadCount > 0 ? `<span class="notification-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
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
    // Only clear session, keep localStorage cache for faster next login
    sessionStorage.clear();
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
      localStorage.clear();
      sessionStorage.clear();
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
  window.api.onBackgroundSyncUpdate((data: any) => {
    console.log('[Dashboard] Received background sync update:', data.courses?.length, 'courses');
    if (data.courses && data.courses.length > 0) {
      mergeCoursesIntoCache(data.courses, { replaceSet: true }, data.timestamp);
      loadCoursesFromCache();
    }

    // Push notification items from the sync
    if (data.notifications && data.notifications.length > 0) {
      pushNotifications(data.notifications);
      updateBellBadge();
      toast.info(`${data.notifications.length} nova(s) atualização(ões) encontrada(s).`);
    }
  });

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

  listEl.innerHTML = notifications.map((n: NotificationItem) => `
    <div class="notification-item ${n.read ? '' : 'notification-item--unread'}" 
         data-type="${n.type}" data-course-id="${n.courseId}" data-item-id="${n.itemId}">
      <span class="notification-item-icon">${n.type === 'file' ? '📄' : '📰'}</span>
      <div class="notification-item-content">
        <span class="notification-item-title">${n.itemTitle}</span>
        <span class="notification-item-course">${n.courseName}</span>
      </div>
      ${!n.read ? '<span class="notification-unread-dot"></span>' : ''}
    </div>
  `).join('');

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
    const cachedData = localStorage.getItem('coursesWithFiles');
    const cacheTimestamp = localStorage.getItem('cacheTimestamp');

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
    coursesListElement.innerHTML = `
        <div class="error-message">
          Erro ao carregar cache: ${error.message}
        </div>
      `;
  }
}

function displayCourses(coursesWithFiles: any[], coursesListElement: HTMLElement) {
  if (coursesWithFiles.length === 0) {
    coursesListElement.innerHTML = `
      <div class="no-courses">Nenhuma disciplina ativa encontrada</div>
    `;
  } else {
    coursesListElement.innerHTML = coursesWithFiles.map((course: any) => {
      const hasUnread = courseHasUnread(course.id);
      return `
      <div class="course-card" onclick="window.location.hash='#/course/${course.id}'">
        <div class="course-card-header">
          <h3>${course.name}</h3>
          ${hasUnread ? '<span class="course-unread-dot" title="Novidades"></span>' : ''}
        </div>
        <p class="course-code">${course.code || 'Sem código'}</p>
        <p class="course-period">${course.period || 'Período não especificado'}</p>
        <p class="course-files-count">${course.fileCount || course.files?.length || 0} arquivos</p>
      </div>
    `}).join('');
  }
}

