/**
 * Seletores, famílias de URL e parsing de parâmetros JSF do SIGAA (PORTAL-001).
 *
 * Único lugar autorizado a conter estes literais. `playwright-login.service.ts`
 * e `http-scraper.service.ts` importam daqui; `portal-adapter-ownership.test.ts`
 * garante isso para as famílias conhecidas. Um seletor novo entra aqui, não
 * inline no serviço.
 */

export const LOGIN = {
    url: 'https://si3.ufc.br/sigaa/verTelaLogin.do',
    username: 'input[name="user.login"]',
    password: 'input[name="user.senha"]',
    submit: 'input[name="entrar"]',
    /** Extração best-effort do nome do usuário logo após o login. */
    userNameFallback: '.nome_usuario, .info-usuario .nome',
    errorMessage: '.erro, .mensagemErro, .alert'
} as const;

export const LOGIN_SELECTOR_LABELS: ReadonlyArray<readonly [string, string]> = [
    [LOGIN.username, 'username field'],
    [LOGIN.password, 'password field'],
    [LOGIN.submit, 'login button']
];

/** Landmarks admissíveis de STUDENT_HOME — só sinais que a produção já usa. */
export const STUDENT_HOME = {
    menuDiscenteLink: 'a[href="/sigaa/verPortalDiscente.do"]',
    portalDiscenteText: 'Portal do Discente'
} as const;

/** Landmarks admissíveis de STUDENT_PORTAL. */
export const STUDENT_PORTAL = {
    courseIdInput: 'input[name="idTurma"]',
    virtualClassroomLink: 'a[id*="turmaVirtual"]',
    userName: '.nome_usuario'
} as const;

export function courseIdInputWithValue(courseId: string): string {
    return `input[name="idTurma"][value="${courseId}"]`;
}

export const COURSE_HOME = {
    /** Mantido pela verificação existente em `enterCourseAndGetHTML`; não reescrever a checagem, só mover o literal. */
    nomeTurmaSelector: '#nomeTurma',
    urlFragment: 'ava/index.jsf',
    emptyTopicsMarker: 'O Sistema detectou que até agora seu professor não criou nenhum tópico de aula',
    menuTurmaVirtualMarker: 'Menu Turma Virtual'
} as const;

export const AVA = {
    formName: 'formAva',
    formSelector: 'form[name="formAva"]',
    viewStateField: 'javax.faces.ViewState',
    viewStateSelector: 'input[name="javax.faces.ViewState"]'
} as const;

export function formByName(name: string): string {
    return `form[name="${name}"]`;
}

export const FILES_MENU = {
    itemMenu: '.itemMenu',
    itemMenuHeaderMateriais: '.itemMenuHeaderMateriais',
    conteudoLinkSelector: 'a, .itemMenu',
    conteudoTextPattern: /Conte.do/i,
    fileLinkReadySelector: 'a[onclick*="jsfcljs"][onclick*=",id,"]'
} as const;

export const JSF = {
    /** `jsfcljs(document.forms['NOME'],'PARAM1,PARAM2', ...)` — link que aciona uma ação JSF. */
    linkPattern: /jsfcljs\(document\.forms\['([^']+)'\],'([^']+)'/,
    /** Mesma chamada quando o form não precisa ser capturado, só os parâmetros. */
    scriptParamsPattern: /jsfcljs\([^,]+,'([^']+)'/
};

/**
 * Lê um parâmetro do `jsfcljs(...)` do onclick — `...,id,555','` devolve `555`.
 * A classe exclui a quote de fechamento: `[^,]+` capturava `555'`, que virava
 * identidade de arquivo no cache.json (BUG-009).
 */
export function jsfParam(onclick: string, name: string): string | undefined {
    return onclick.match(new RegExp(`,${name},([^,'"]+)`))?.[1];
}

export const NEWS = {
    idInput: 'input[name="id"]'
} as const;

export function newsFormSelector(newsId: string): string {
    return `form:has(input[name="id"][value="${newsId}"])`;
}
