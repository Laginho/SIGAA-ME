/**
 * Toast notification system.
 * Shows a non-blocking, auto-dismissing notification in the top-right corner.
 *
 * Usage:
 *   import { toast } from '../components/toast';
 *   toast.success('Download concluído!');
 *   toast.error('Falha no download.');
 *   toast.info('Sincronizando...');
 */

type ToastType = 'success' | 'error' | 'info';

const DISMISS_DURATION = 4000; // ms

function getOrCreateContainer(): HTMLElement {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function show(message: string, type: ToastType): void {
  const container = getOrCreateContainer();

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  el.innerHTML = `<span class="toast__icon">${icon}</span><span class="toast__message">${message}</span>`;

  container.appendChild(el);

  // Trigger enter animation
  requestAnimationFrame(() => el.classList.add('toast--visible'));

  // Auto-dismiss
  setTimeout(() => {
    el.classList.remove('toast--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, DISMISS_DURATION);
}

export const toast = {
  success: (message: string) => show(message, 'success'),
  error: (message: string) => show(message, 'error'),
  info: (message: string) => show(message, 'info'),
};
