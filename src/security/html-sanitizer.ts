import DOMPurify from 'dompurify'

/**
 * HTML de corpo de notícia do SIGAA, reduzido à allowlist. Idempotente.
 * Só para `NewsSummary.content`/`NewsDetail.content` (SEC-001).
 *
 * Professores colam tabela e link do portal: `p`, `table`, `a[href]` ficam.
 * Todo o resto que executa ou carrega coisa — `script`, `style`, `iframe`,
 * `form`, `svg`, `math`, `img`, handlers `on*`, `style`/`class`/`id`,
 * `data-*`, `javascript:`/`data:`/`vbscript:`/`file:` — cai.
 *
 * Todo `<a>` mantido recebe `rel="noopener noreferrer"`. Sem
 * `target="_blank"`: sem `setWindowOpenHandler` (SEC-003) isso abriria uma
 * `BrowserWindow` nova com o preload do app.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function sanitizeNewsHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
      'ul', 'ol', 'li', 'blockquote', 'h3', 'h4', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a',
    ],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'frame', 'object', 'embed',
      'form', 'input', 'button', 'textarea', 'select',
      'svg', 'math', 'img', 'link', 'meta', 'base', 'noscript', 'template',
    ],
  })
}
