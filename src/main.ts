import './styles/main.css'
import { renderLoginPage } from './pages/login'
import { renderDashboardPage } from './pages/dashboard'
import { renderCourseDetailPage } from './pages/course-detail'
import { renderLoadingPage } from './pages/loading'

const app = document.querySelector<HTMLDivElement>('#app')!

// Simple hash-based router
function route() {
  const hash = window.location.hash || '#/login'

  if (hash.startsWith('#/course/')) {
    const courseId = hash.replace('#/course/', '')
    renderCourseDetailPage(app, courseId)
  } else if (hash === '#/dashboard') {
    // Resume sync whenever we enter the dashboard
    try {
      (window as any).api.resumeSync();
    } catch (e) {
      console.error('Failed to resume sync:', e);
    }

    // Get account from sessionStorage
    const accountData = sessionStorage.getItem('account')
    if (accountData) {
      const account = JSON.parse(accountData)
      renderDashboardPage(app, account)
    } else {
      // No account data, redirect to login
      window.location.hash = '#/login'
    }
  } else {
    renderLoginPage(app)
  }
}

// Listen for hash changes
window.addEventListener('hashchange', route)

// Initial route
if (!window.location.hash || window.location.hash === '#/login') {
  renderLoadingPage(app);

  window.api.tryAutoLogin().then((result) => {
    if ((window as any).stopLoadingInterval) (window as any).stopLoadingInterval();

    if (result.success && result.account) {
      console.log('Auto-login success!');
      sessionStorage.setItem('account', JSON.stringify(result.account));
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

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event: any, message: any) => {
  console.log(message)
})
