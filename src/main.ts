import './styles/main.css'
import { renderLoginPage } from './pages/login'
import { renderDashboardPage } from './pages/dashboard'
import { renderCourseDetailPage } from './pages/course-detail'

const app = document.querySelector<HTMLDivElement>('#app')!

// Simple hash-based router
function route() {
  const hash = window.location.hash || '#/login'

  if (hash.startsWith('#/course/')) {
    const courseId = hash.replace('#/course/', '')
    renderCourseDetailPage(app, courseId)
  } else if (hash === '#/dashboard') {
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
// Initial route
if (!window.location.hash || window.location.hash === '#/login') {
  window.api.tryAutoLogin().then((result) => {
    if (result.success && result.account) {
      console.log('Auto-login success!');
      sessionStorage.setItem('account', JSON.stringify(result.account));
      window.location.hash = '#/dashboard';
    } else {
      route();
    }
  }).catch(() => route());
} else {
  route();
}

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
