/**
 * Contratos da fronteira renderer <-> main.
 *
 * Este arquivo é importado pelos TRÊS lados (main, preload, renderer), então
 * não pode importar `electron`, `fs`, nem nada de Node — só tipos.
 *
 * Escopo deliberadamente pequeno: contém apenas o que atravessa o IPC hoje.
 * O `ARCH-001` do HARDENING_TRACKER prevê modelar também `CourseSummary`,
 * `CourseFile`, `NewsDetail`, `AppResult<T>` e `AppErrorCode`. Isso ainda não
 * está aqui porque os retornos do IPC não são anotados explicitamente — logo,
 * modelá-los agora seria especulação, e mudar todos os consumidores de uma vez
 * sem teste de fronteira é justamente o risco que a Fase 1 existe para evitar.
 *
 * Regra ao editar: nada de `any`. Se o formato é desconhecido, use `unknown` e
 * valide no consumidor.
 */

// ---------------------------------------------------------------- credenciais

export interface LoginCredentials {
  username: string
  password: string
  rememberMe?: boolean
}

// ----------------------------------------------------------------------- conta

/**
 * Identidade da conta exibida no header, devolvida por `login` e
 * `tryAutoLogin`. Fonte: `sigaa.service.ts:38`.
 */
export interface AccountSummary {
  name: string
  photoUrl?: string
}

// ------------------------------------------------------------------ downloads

/** Referência a um arquivo de disciplina, como o renderer a conhece. */
export interface CourseFileRef {
  name: string
  url: string
  script?: string
}

export interface DownloadFilePayload {
  courseId: string
  courseName: string
  fileName: string
  fileUrl: string
  basePath: string
  /**
   * Mapa de arquivos já baixados, vindo do localStorage.
   * ponytail: o main recebe e ignora (`_downloadedFiles` em sigaa.service.ts).
   * Encanamento morto — remover junto com `fileUrl`. Ver BUG-005.
   */
  downloadedFiles: Record<string, unknown>
  script?: string
}

export interface DownloadAllFilesPayload {
  courseId: string
  courseName: string
  files: CourseFileRef[]
  basePath: string
  /** Mesma observação de `DownloadFilePayload.downloadedFiles`. Ver BUG-005. */
  downloadedFiles: Record<string, unknown>
}

export type DownloadStatus = 'downloaded' | 'skipped' | 'failed'

/**
 * Item de `downloadAllFiles().results`.
 * Fonte: `sigaa.service.ts:319,416,437,442` — `filePath` só existe quando
 * `status === 'downloaded'`.
 */
export interface DownloadResultItem {
  fileName: string
  status: DownloadStatus
  filePath?: string
}

export interface DownloadProgress {
  fileName: string
  status: DownloadStatus
}

// ---------------------------------------------------------------------- news

/**
 * Detalhe de uma notícia, como o Playwright a extrai
 * (`playwright-login.service.ts:1183-1188`). Todos os campos são `string`
 * porque o extrator devolve string vazia quando o rótulo não existe na página —
 * nenhum deles é opcional.
 *
 * ⚠️ `content` é **HTML bruto do SIGAA**. Não renderizar com `innerHTML` sem
 * sanitização — ver `SEC-001` e a regra 1 do `CLAUDE.md`.
 */
export interface NewsDetail {
  title: string
  date: string
  content: string
  notification: string
}

// ------------------------------------------------------------------ settings

export interface AppSettings {
  theme: 'light' | 'dark'
  /** ponytail: nunca é lido. O controle real é `runInBackground`. Ver auditoria. */
  autoSync: boolean
  lastDownloadPath: string | null
  runInBackground: boolean
  /** Em minutos. */
  syncInterval: number
  autoDownloadUpdates: boolean
  lastBackgroundSync?: number
  openAtLogin: boolean
}

/**
 * Chaves que o renderer tem permissão de alterar.
 *
 * `lastBackgroundSync` é escrito só pelo main (background-sync.service.ts).
 * `autoSync` é campo morto. Nenhum dos dois deve ser mutável pelo renderer.
 *
 * O `SEC-002` quer excluir também a raiz de download; hoje não dá, porque
 * `lastDownloadPath` é gravado pelo renderer em course-detail.ts e settings.ts.
 * Fica para quando o main passar a resolver a pasta sozinho (DL-001).
 */
export type RendererSettingKey = Exclude<
  keyof AppSettings,
  'lastBackgroundSync' | 'autoSync'
>

/**
 * União discriminada exigida pelo `SEC-002`: amarra cada chave ao tipo do seu
 * valor. Impede `updateSetting('syncInterval', 'texto')`, que o
 * `(key: string, value: any)` anterior aceitava sem reclamar.
 */
export type SettingUpdate = {
  [K in RendererSettingKey]: { key: K; value: Required<AppSettings>[K] }
}[RendererSettingKey]

// ------------------------------------------------------------------- eventos

/**
 * Payload de `background-sync-update`.
 *
 * `courses` e `notifications` continuam `unknown[]` de propósito: o renderer
 * hoje faz merge estrutural com o que está no localStorage, e modelar isso é
 * tarefa do `ARCH-001`. `unknown` obriga o consumidor a validar antes de usar,
 * que é exatamente o que se quer numa fronteira.
 */
export interface BackgroundSyncUpdate {
  courses: unknown[]
  notifications: unknown[]
  timestamp: number
}
