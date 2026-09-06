import './styles/main.css'
import { renderLoginPage } from './pages/login'
import { renderDashboardPage } from './pages/dashboard'
import { renderCourseDetailPage } from './pages/course-detail'
import { renderLoadingPage } from './pages/loading'
import { renderSyncSelectionPage } from './pages/sync-selection'
import { renderSettingsPage } from './pages/settings'
import { getActiveAccount, readAccountItem, setActiveAccount } from './data/account-storage'

const app = document.querySelector<HTMLDivElement>('#app')!

// Simple hash-based router
function route() {
  const hash = window.location.hash || '#/login'

  if (hash.startsWith('#/course/')) {
    const courseId = hash.replace('#/course/', '')
    renderCourseDetailPage(app, courseId)
  } else if (hash === '#/dashboard') {
    const account = getActiveAccount()
    if (account) {
      // Logic: If no cache, likely "New Game" -> Redirect to Sync Selection
      const hasCache = readAccountItem('courses');
      if (!hasCache) {
        window.location.hash = '#/sync-selection';
        return;
      }

      renderDashboardPage(app, account)
    } else {
      // No account data, redirect to login
      window.location.hash = '#/login'
    }
  } else if (hash === '#/sync-selection') {
    renderSyncSelectionPage(app)
  } else if (hash === '#/settings') {
    renderSettingsPage(app)
  } else {
    renderLoginPage(app)
  }
}

// Listen for hash changes
window.addEventListener('hashchange', route)

// Initial theme application
window.api.getSettings().then((settings) => {
  document.documentElement.setAttribute('data-theme', settings.theme);
});

// Initial route
if (!window.location.hash || window.location.hash === '#/login') {
  renderLoadingPage(app);

  window.api.tryAutoLogin().then((result) => {
    if ((window as any).stopLoadingInterval) (window as any).stopLoadingInterval();

    if (result.success) {
      console.log('Auto-login success!');
      setActiveAccount(result.data);
      window.location.hash = '#/dashboard';
    } else {
      route();
    }
  }).catch(() => {
    if ((window as any).stopLoadingInterval) (window as any).stopLoadingInterval();
    route();
  });
} else {
  route();
}
