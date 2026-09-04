/**
 * Modelos de domínio que o renderer conhece (ARCH-001).
 *
 * Importado pelos três lados (main, preload, renderer): só tipos, nenhum
 * import de Node ou Electron.
 *
 * Regra desta fronteira: **nada que o SIGAA use para se governar chega aqui.**
 * Script JSF (`onclick`), `key`, ViewState, cookie, `href` interno — tudo isso
 * fica no main. O renderer identifica arquivo, notícia e disciplina por id
 * estável e o main resolve o resto contra a página fresca. É o que permite ao
 * `SEC-001` sanitizar e ao `SEC-002` validar sem que um campo "de passagem"
 * reabra a porta. `tests/unit/preload-contract.test.ts` cobra isso lendo este
 * arquivo como texto.
 *
 * Tudo aqui vem do HTML do portal e é entrada não confiável para o renderer:
 * `textContent`, nunca `innerHTML` (regra 1 do CLAUDE.md).
 */

// ----------------------------------------------------------------------- conta

/** Login do SIGAA (matrícula). É o que `DATA-001` usa para separar dados por conta. */
export type AccountId = string

export interface AccountProfile {
  id: AccountId
  name: string
  /** URL absoluta da foto no portal. Só existe depois do primeiro `getCourses`. */
  photoUrl?: string
}

// ------------------------------------------------------------------ disciplina

/** `idTurma` do SIGAA. Estável dentro do semestre. */
export type CourseId = string

/** Uma linha da lista de turmas do portal do discente. */
export interface CourseSummary {
  id: CourseId
  /** Código da disciplina, ex. `CB0699`. */
  code: string
  name: string
  /** Ex. `2026.1`. Vazio quando a célula não existe. */
  period: string
}

/** Disciplina com o conteúdo sincronizado — o que vive em `localStorage.coursesWithFiles`. */
export interface CourseSnapshot extends CourseSummary {
  files: CourseFile[]
  news: NewsSummary[]
  fileCount: number
}

// -------------------------------------------------------------------- arquivos

/**
 * `id` do arquivo no JSF (`jsfcljs(...,id,555,...)`) que o renderer devolve
 * ao main para baixar um arquivo. O `name` que acompanha o pedido **não**
 * seleciona qual script executar: só dá nome ao arquivo em disco e guia o
 * Playwright até o link no DOM vivo quando os parses estáticos não acham o
 * id. O script que executa o download **não** sai do main: ele é
 * reconstruído da página fresca a cada pedido, casando só por este id.
 */
export type DownloadToken = string

export interface CourseFile {
  id: DownloadToken
  name: string
  /** `link` é material externo postado pelo professor; não tem download via JSF. */
  type: 'file' | 'link'
  /** `dd/mm/aaaa`, quando a timeline lateral registrou o upload. */
  date?: string
}

export type DownloadStatus = 'downloaded' | 'skipped' | 'failed'

/** Resultado por arquivo de `downloadAllFiles`. `filePath` só existe quando baixou. */
export type DownloadRecord =
  | { fileName: string; status: 'downloaded'; filePath: string }
  | { fileName: string; status: 'skipped' | 'failed' }

export interface DownloadResult {
  downloaded: number
  skipped: number
  failed: number
  results: DownloadRecord[]
}

// -------------------------------------------------------------------- notícias

export interface NewsSummary {
  id: string
  title: string
  date: string
  /** `Sim`/`Não`/vazio — se o SIGAA mandou e-mail. */
  notification: string
  /**
   * HTML bruto do SIGAA, presente só depois de `loadAllNews`/`getNewsDetail`.
   * ⚠️ Não renderizar com `innerHTML` sem sanitização (`SEC-001`): o renderer
   * sanitiza em `mergeCoursesIntoCache` (antes de cachear) e no modal (antes
   * de renderizar).
   */
  content?: string
}

/**
 * Detalhe de uma notícia, como o Playwright a extrai. Todos os campos são
 * `string` porque o extrator devolve string vazia quando o rótulo não existe.
 *
 * ⚠️ `content` é **HTML bruto do SIGAA**. Ver `NewsSummary.content`
 * (sanitizado em `mergeCoursesIntoCache` e no modal — `SEC-001`).
 */
export interface NewsDetail {
  title: string
  date: string
  content: string
  notification: string
}

// ---------------------------------------------------------------- notificações

/** Item do sino. Construído pelo main no background sync, guardado pelo renderer. */
export interface NotificationItem {
  /** Único: `${type}-${courseId}-${itemId}`. */
  id: string
  type: 'file' | 'news'
  courseId: CourseId
  courseName: string
  /** Nome do arquivo ou id da notícia. */
  itemId: string
  itemTitle: string
  timestamp: number
  read: boolean
}
