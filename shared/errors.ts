/**
 * Resultado e erro de toda operação que atravessa o IPC (ARCH-001).
 *
 * Importado pelos três lados (main, preload, renderer): nada de `electron`,
 * `fs` ou Node aqui — só tipos e funções puras.
 *
 * `AppResult<T>` é união discriminada em `success`. Depois de
 * `if (!r.success) return`, `r.data` é `T` — não `T | undefined`. É a regra 6
 * do CLAUDE.md aplicada na origem, em vez de `?? 'Erro desconhecido'` em cada
 * consumidor.
 */

export type AppErrorCode =
  /** Payload inválido ou pré-condição do chamador não atendida. Não adianta repetir. */
  | 'INVALID_REQUEST'
  /** Sem sessão, credencial ausente, ou o SIGAA devolveu a tela de login. Relogar resolve. */
  | 'SESSION_EXPIRED'
  /** O HTML do portal não tem mais a estrutura que o parser conhece. Precisa de atualização do app. */
  | 'SELECTOR_DRIFT'
  /** O usuário cancelou (dialog fechado, operação abortada). Não é falha. */
  | 'CANCELLED'
  /** Disco, settings ou credenciais locais. */
  | 'STORAGE'
  /** O portal aceitou o pedido, mas o arquivo não veio (HTML no lugar do binário, 302, etc). */
  | 'DOWNLOAD_FAILED'
  /** Timeout, rede, 5xx: o portal não respondeu. Tentar de novo mais tarde. */
  | 'PORTAL_UNAVAILABLE'
  /** Disciplina, arquivo ou notícia não está mais na página. */
  | 'NOT_FOUND'
  | 'UNKNOWN'

export interface AppError {
  code: AppErrorCode
  /** Texto para o usuário. Já vem em português quando a origem é nossa; mensagem de biblioteca passa como está. */
  message: string
}

export interface AppFailure {
  success: false
  error: AppError
}

export type AppResult<T = void> = { success: true; data: T } | AppFailure

export function ok(): AppResult<void>
export function ok<T>(data: T): AppResult<T>
export function ok<T>(data?: T): AppResult<T | void> {
  return { success: true, data }
}

export function fail(code: AppErrorCode, message: string): AppFailure {
  return { success: false, error: { code, message } }
}

/** Falhas onde repetir a operação (após relogin, ou mais tarde) tem chance real de funcionar. */
const RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>(['SESSION_EXPIRED', 'PORTAL_UNAVAILABLE'])

export function isRetryable(error: AppError): boolean {
  return RETRYABLE.has(error.code)
}

/**
 * Deduz o código a partir da mensagem que o scraper devolveu.
 *
 * ponytail: heurística por regex sobre as mensagens que os serviços já emitem
 * (`"SIGAA selector drift: ..."`, `"Session expired: ..."`, `"... not found in
 * portal"`). O upgrade é cada ponto de origem devolver `AppError` direto e
 * esta função sumir; até lá ela é a única tabela a manter quando uma mensagem
 * nova aparecer. A ordem importa: "Course session data not found" é sessão,
 * não NOT_FOUND.
 */
export function classifyMessage(message: string): AppErrorCode {
  if (/selector drift/i.test(message)) return 'SELECTOR_DRIFT'
  if (/session|login page|please login|credentials|re-authenticate/i.test(message)) return 'SESSION_EXPIRED'
  if (/timed? ?out|ECONN|ENOTFOUND|ETIMEDOUT|net::|navigation|socket hang up/i.test(message)) return 'PORTAL_UNAVAILABLE'
  if (/not found|could not find/i.test(message)) return 'NOT_FOUND'
  return 'UNKNOWN'
}

/** `fail()` para mensagem de origem externa (scraper, exceção), com o código deduzido. */
export function failFromMessage(message: string | undefined, fallback = 'Erro desconhecido'): AppFailure {
  const text = message || fallback
  return fail(classifyMessage(text), text)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
