/**
 * PROTÓTIPO — barra flutuante para alternar entre os esquemas de dark mode
 * candidatos da página de disciplina. Descartável.
 *
 * Montada só em dev (ver o gate `import.meta.env.DEV` no src/main.ts), então
 * não existe em build de produção. Setas ←/→ (mouse ou teclado) trocam o
 * esquema; 🌙/☀️ alterna o tema para comparar. A escolha persiste em
 * localStorage para sobreviver a reloads do vite.
 */
import '../styles/course-detail.prototype-dark.css';

const SCHEMES = [
    { key: 'a', name: 'Tokens do sistema' },
    { key: 'b', name: 'Meia-noite elevado' },
    { key: 'c', name: 'Cartões claros contidos' }
];
const STORAGE_KEY = 'proto-dark-scheme';

export function mountSchemeSwitcher() {
    let index = Math.max(0, SCHEMES.findIndex(s => s.key === localStorage.getItem(STORAGE_KEY)));

    const bar = document.createElement('div');
    bar.style.cssText = [
        'position:fixed', 'bottom:14px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:99999', 'display:flex', 'align-items:center', 'gap:10px',
        'background:#111', 'color:#fff', 'padding:8px 14px', 'border-radius:999px',
        'font:13px/1 monospace', 'box-shadow:0 4px 16px rgba(0,0,0,.5)',
        'border:1px solid #444', 'user-select:none'
    ].join(';');

    const prev = document.createElement('button');
    const label = document.createElement('span');
    const next = document.createElement('button');
    const themeBtn = document.createElement('button');
    for (const btn of [prev, next, themeBtn]) {
        btn.style.cssText = 'background:none;border:none;color:#fff;cursor:pointer;font-size:14px;padding:2px 4px';
    }
    prev.textContent = '←';
    next.textContent = '→';
    label.style.minWidth = '220px';
    label.style.textAlign = 'center';

    function apply() {
        const scheme = SCHEMES[index];
        document.documentElement.setAttribute('data-proto-scheme', scheme.key);
        localStorage.setItem(STORAGE_KEY, scheme.key);
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        label.textContent = `${scheme.key.toUpperCase()} — ${scheme.name}`;
        themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    prev.addEventListener('click', () => { index = (index + SCHEMES.length - 1) % SCHEMES.length; apply(); });
    next.addEventListener('click', () => { index = (index + 1) % SCHEMES.length; apply(); });
    themeBtn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
        apply();
    });

    document.addEventListener('keydown', (e) => {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
        if (e.key === 'ArrowLeft') prev.click();
        if (e.key === 'ArrowRight') next.click();
    });

    bar.append(prev, label, next, themeBtn);
    document.body.appendChild(bar);
    apply();
}
