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
  script?: string
}

export interface DownloadAllFilesPayload {
  courseId: string
  courseName: string
  files: CourseFileRef[]
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
 * Os retornos ainda usam `unknown` em vários pontos: o `ARCH-001` vai modelar
 * `CourseSummary`, `CourseFile` e um `AppResult<T>` discriminado. Até então
 * `unknown` é honesto — obriga o consumidor a validar — enquanto `any` mentia
 * dizendo que o formato era conhecido. Os PAYLOADS (renderer -> main) já estão
 * estritos, porque é a direção por onde dado não confiável entra no processo
 * privilegiado.
 */
export interface RendererApi {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; message?: string; account?: AccountSummary }>
  tryAutoLogin: () => Promise<{ success: boolean; message?: string; account?: AccountSummary }>
  getCourses: () => Promise<{ success: boolean; courses?: unknown[]; photoUrl?: string; message?: string }>
  getCourseFiles: (courseId: string, courseName?: string) => Promise<{ success: boolean; files?: unknown[]; news?: unknown[]; message?: string }>
  selectDownloadFolder: () => Promise<{ success: true; folderPath: string } | { success: false }>
  downloadFile: (data: DownloadFilePayload) => Promise<{ success: boolean; filePath?: string; message?: string }>
  downloadAllFiles: (data: DownloadAllFilesPayload) => Promise<{ success: boolean; message?: string; downloaded?: number; skipped?: number; failed?: number; results?: DownloadResultItem[] }>
  checkFilesExistence: (filePaths: string[]) => Promise<{ path: string; exists: boolean }[]>
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void
  getNewsDetail: (courseId: string, courseName: string, newsId: string) => Promise<{ success: boolean; news?: NewsDetail; message?: string }>
  loadAllNews: (courseId: string, courseName: string) => Promise<{ success: boolean; news?: unknown[]; message?: string }>
  logout: () => Promise<{ success: boolean; message?: string }>
  clearAllData: () => Promise<{ success: boolean; message?: string }>
  getSettings: () => Promise<AppSettings>
  updateSetting: <K extends SettingUpdate['key']>(
    key: K,
    value: Extract<SettingUpdate, { key: K }>['value'],
  ) => Promise<{ success: boolean }>
  simulateNewFile?: () => Promise<boolean>
  onBackgroundSyncUpdate: (callback: (data: BackgroundSyncUpdate) => void) => () => void
}

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
