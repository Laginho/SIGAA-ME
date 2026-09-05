/**
 * Política de navegação da BrowserWindow (SEC-003).
 *
 * Um site externo carregado na NOSSA janela herdaria o preload e o
 * `window.api`. Então a janela nunca navega para fora do app: `will-navigate`
 * só passa para a própria URL do app, e todo link sai pelo navegador do SO.
 *
 * `classifyNavigation` é pura (sem `electron`) e é onde mora a decisão;
 * `installNavigationGuard` só liga os fios. Contrato e decisões:
 * `.scratch/04-fase3-fronteiras-de-confianca/issues/04-SEC-003-*.md`.
 */
import type { WebContents } from 'electron'

export type NavigationVerdict =
  | { kind: 'in-app' }
  | { kind: 'external'; trusted: boolean }
  | { kind: 'blocked'; reason: string }

export interface NavigationGuardDeps {
  appUrl: string
  openExternal: (url: string) => Promise<void>
  /** Resolve `true` quando o usuário escolheu abrir. */
  confirmExternal: (url: string) => Promise<boolean>
}

/** Dev: mesma origem do vite. Empacotado: o próprio `index.html` (hash/query ignorados). */
function isAppUrl(url: URL, appUrl: string): boolean {
  let app: URL
  try {
    app = new URL(appUrl)
  } catch {
    return false
  }
  if (app.protocol === 'file:') {
    return url.protocol === 'file:' && url.pathname === app.pathname
  }
  return url.origin === app.origin
}

/** `ufc.br` e subdomínios; do GitHub, só o repositório do projeto. */
function isTrustedHost(url: URL): boolean {
  const host = url.hostname
  if (host === 'ufc.br' || host.endsWith('.ufc.br')) return true
  if (host !== 'github.com') return false
  return url.pathname === '/Laginho/SIGAA-ME' || url.pathname.startsWith('/Laginho/SIGAA-ME/')
}

export function classifyNavigation(target: string, appUrl: string): NavigationVerdict {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return { kind: 'blocked', reason: 'URL não parseável' }
  }

  if (isAppUrl(url, appUrl)) return { kind: 'in-app' }

  // `mailto:` segue a mesma regra de um https fora da allowlist: confirma antes.
  if (url.protocol === 'mailto:') return { kind: 'external', trusted: false }
  if (url.protocol !== 'https:') return { kind: 'blocked', reason: `esquema ${url.protocol}` }
  // `https://si3.ufc.br@evil.example/` não vai para o si3: o host é o `evil`.
  if (url.username !== '' || url.password !== '') {
    return { kind: 'blocked', reason: 'credencial embutida na URL' }
  }

  return { kind: 'external', trusted: isTrustedHost(url) }
}

async function openOutside(url: string, trusted: boolean, deps: NavigationGuardDeps): Promise<void> {
  try {
    if (!trusted && !(await deps.confirmExternal(url))) return
    await deps.openExternal(url)
  } catch (err) {
    // Handler de evento não tem chamador para quem propagar (o updater faz igual).
    console.error(`[nav] falha ao abrir link externo ${url}:`, err)
  }
}

export function installNavigationGuard(
  contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
  deps: NavigationGuardDeps,
): void {
  contents.on('will-navigate', (details) => {
    const verdict = classifyNavigation(details.url, deps.appUrl)
    if (verdict.kind === 'in-app') return

    details.preventDefault()
    if (verdict.kind === 'blocked') {
      console.warn(`[nav] navegação bloqueada (${verdict.reason}): ${details.url}`)
      return
    }
    void openOutside(details.url, verdict.trusted, deps)
  })

  // Sempre negado, inclusive para URL confiável: o sanitizador nunca emite
  // `target`, então um popup só pode vir de algo que não deveria estar rodando.
  contents.setWindowOpenHandler(({ url }) => {
    console.warn(`[nav] window.open negado: ${url}`)
    return { action: 'deny' }
  })
}
