/**
 * Contratos da fronteira renderer <-> main.
 *
 * Este arquivo é importado pelos TRÊS lados (main, preload, renderer), então
 * não pode importar `electron`, `fs`, nem nada de Node — só tipos.
 *
 * Os modelos (disciplina, arquivo, notícia) vivem em `shared/domain.ts`; o
 * resultado discriminado e os códigos de erro, em `shared/errors.ts`. Aqui fica
 * só o que é específico do IPC: payloads, eventos e o `RendererApi`.
 *
 * Regra ao editar: nada de `any`. Se o formato é desconhecido, use `unknown` e
 * valide no consumidor.
 */

import type {
  AccountProfile,
  CourseFile,
  CourseId,
  CourseSnapshot,
  CourseSummary,
  DownloadStatus,
  DownloadResult,
  DownloadToken,
  NewsDetail,
  NewsSummary,
  NotificationItem,
} from './domain'
import type { AppResult } from './errors'

// ---------------------------------------------------------------- credenciais

export interface LoginCredentials {
  username: string
  password: string
  rememberMe?: boolean
}

// ---------------------------------------------------------------------- payloads

export interface CourseRequest {
  courseId: CourseId
  courseName: string
}

export interface DownloadFilePayload extends CourseRequest {
  fileId: DownloadToken
  fileName: string
}

/** Só id e nome atravessam — nunca o objeto inteiro do cache, que pode carregar campos antigos. */
export type DownloadFileRef = Pick<CourseFile, 'id' | 'name'>

export interface DownloadAllFilesPayload extends CourseRequest {
  files: DownloadFileRef[]
}

export interface NewsDetailRequest extends CourseRequest {
  newsId: string
}

export interface DownloadProgress {
  fileName: string
  status: DownloadStatus
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
 * `lastDownloadPath` só pode ser limpo pelo renderer (null = "Sempre perguntar");
 * a definição vem do main via `selectDownloadFolder` (DL-001).
 */
export type RendererSettingKey = Exclude<
  keyof AppSettings,
  'lastBackgroundSync' | 'autoSync'
>

/**
 * União discriminada exigida pelo `SEC-002`: amarra cada chave ao tipo do seu
 * valor. Impede `updateSetting('syncInterval', 'texto')`, que o
 * `(key: string, value: any)` anterior aceitava sem reclamar.
 * `lastDownloadPath` é exceção: renderer só pode limpar (null), nunca definir.
 * A validação em runtime é `parseSettingUpdate` (`electron/ipc/validation.ts`).
 */
export type SettingUpdate =
  | { key: 'lastDownloadPath'; value: null }
  | { [K in Exclude<RendererSettingKey, 'lastDownloadPath'>]: { key: K; value: Required<AppSettings>[K] } }[Exclude<RendererSettingKey, 'lastDownloadPath'>]

// -------------------------------------------------------- contrato do preload

/**
 * O que o renderer pode chamar. **Uma declaração, dois usos:**
 *
 * - `electron/preload.ts` anota o objeto do `contextBridge` com este tipo, então
 *   ponte faltando é erro de compilação;
 * - `src/vite-env.d.ts` declara `Window.api` com este tipo, então o renderer vê
 *   exatamente o que a ponte implementa.
 *
 * Antes disso a forma era escrita à mão nos dois lugares, e as duas cópias
 * divergiram: `getSettings` estava declarada e não estava na ponte. Cinco call
 * sites quebravam em runtime com o `tsc` verde (`BUG-008`). Não volte a
 * descrever esta forma em nenhum outro arquivo — a duplicação **é** o bug.
 *
 * Por que declarar o tipo em vez de derivar da implementação com
 * `typeof api`: `ipcRenderer.invoke` devolve `Promise<any>`, então derivar
 * apagaria todos os retornos e reabriria a porta do `BUG-006` (campo lido que o
 * main nunca devolveu). O retorno anotado é o que o typecheck tem para conferir.
 *
 * Todo retorno falível é `AppResult<T>` (ARCH-001). O que o main devolve é o
 * que `SigaaService` devolve — ao mudar um, abra o outro.
 */
export interface RendererApi {
  login: (credentials: LoginCredentials) => Promise<AppResult<AccountProfile>>
  tryAutoLogin: () => Promise<AppResult<AccountProfile>>
  getCourses: () => Promise<AppResult<{ courses: CourseSummary[]; photoUrl?: string }>>
  getCourseFiles: (courseId: CourseId, courseName: string) => Promise<AppResult<{ files: CourseFile[]; news: NewsSummary[] }>>
  selectDownloadFolder: () => Promise<AppResult<{ folderPath: string }>>
  downloadFile: (data: DownloadFilePayload) => Promise<AppResult<{ filePath: string }>>
  downloadAllFiles: (data: DownloadAllFilesPayload) => Promise<AppResult<DownloadResult>>
  checkFilesExistence: (filePaths: string[]) => Promise<AppResult<{ path: string; exists: boolean }[]>>
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void
  getNewsDetail: (courseId: CourseId, courseName: string, newsId: string) => Promise<AppResult<NewsDetail>>
  loadAllNews: (courseId: CourseId, courseName: string) => Promise<AppResult<NewsSummary[]>>
  logout: () => Promise<AppResult>
  clearAllData: () => Promise<AppResult>
  getSettings: () => Promise<AppSettings>
  updateSetting: <K extends SettingUpdate['key']>(
    key: K,
    value: Extract<SettingUpdate, { key: K }>['value'],
  ) => Promise<AppResult>
  onBackgroundSyncUpdate: (callback: (data: BackgroundSyncUpdate) => void) => () => void
}

// ------------------------------------------------------------------- eventos

/** Payload de `background-sync-update`. */
export interface BackgroundSyncUpdate {
  courses: CourseSnapshot[]
  notifications: NotificationItem[]
  timestamp: number
}
