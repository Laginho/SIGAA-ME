import tseslint from 'typescript-eslint'

/**
 * Estratégia: estrito por ZONA, não permissivo em geral.
 *
 * O projeto tem 113 `: any` e 28 `as any` herdados. Ligar tudo como erro de uma
 * vez deixaria o lint vermelho no primeiro dia — e gate que nasce vermelho é
 * gate que todo mundo aprende a ignorar.
 *
 * Então:
 *   - FRONTEIRA (preload, main, shared): erro. Hoje já passa limpo.
 *   - RESTO do código existente: aviso. Visível, não bloqueia.
 *   - TESTES: relaxado. Mock precisa de `any`.
 *   - CREDENCIAL: erro em todo lugar, sem exceção. Ver SEC-000.
 *
 * Catraca (disciplina, não ferramenta): o número de avisos só pode cair. Cada
 * tarefa que tocar um arquivo o deixa mais limpo do que encontrou.
 *
 * Gatilho para promover os avisos a erro global: conclusão do SEC-002 (preload
 * tipado). Depois dele, `as any` para atravessar IPC deixa de ter qualquer
 * justificativa. Ver docs/HARDENING_TRACKER.md.
 */

/**
 * Proíbe `process.env.SENHA || 'algo'` — foi exatamente o SEC-000.
 *
 * A primeira versão desta regra pegava QUALQUER `process.env.X || fallback`, e
 * deu falso positivo em `process.env.VITE_PUBLIC || path.join(...)`
 * (background-sync.service.ts:228) — caminho de ícone, não segredo. Regra que
 * precisa de `eslint-disable` espalhado treina as pessoas a ignorar o linter.
 *
 * Agora casa só com nome de variável que parece segredo. O limite disso é claro:
 * um segredo com nome fora do padrão escapa. A rede geral é scanner de conteúdo
 * no CI (gitleaks, PIPE-003) — esta regra é o sinal local e rápido.
 */
const noCredentialFallback = {
  selector:
    'LogicalExpression[operator="||"] > MemberExpression[object.object.name="process"][object.property.name="env"][property.name=/PASS|SENHA|SECRET|TOKEN|CREDENTIAL|_KEY$|APIKEY/i]',
  message:
    'Credencial nunca tem valor padrão. Se a variável de ambiente não existir, ' +
    'o programa deve falhar. O `||` transforma erro de config em segredo ' +
    'hardcoded permanente (ver SEC-000).',
}

/** Proíbe `x as any`. O cast que escondeu o bug do pauseSync por meses. */
const noAsAny = {
  selector: 'TSAsExpression > TSAnyKeyword',
  message:
    '`as any` desliga o verificador de tipos. Se `window.api` não tem o método ' +
    'que você quer, o problema é o contrato do preload, não o TypeScript.',
}

/**
 * `innerHTML` só com literal, ou com o retorno do sanitizador. Regra 1 do CLAUDE.md, SEC-001.
 *
 * O esqueleto estático de cada página continua `innerHTML` (literal sem `${}`).
 * Qualquer coisa que dependa de dado vira nó: `h()`/`textContent` (`src/utils/dom.ts`).
 * O corpo de notícia é o único `innerHTML` com dado externo, e só passa porque
 * o RHS é a chamada a `sanitizeNewsHtml(...)`.
 */
const noUnsafeInnerHtml = {
  selector:
    'AssignmentExpression[left.property.name="innerHTML"]' +
    ':not([right.type="Literal"])' +
    ':not([right.type="TemplateLiteral"][right.expressions.length=0])' +
    ':not([right.type="CallExpression"][right.callee.name="sanitizeNewsHtml"])',
  message:
    'innerHTML só aceita literal sem interpolação ou sanitizeNewsHtml(...). ' +
    'Dado vira nó: h()/textContent (src/utils/dom.ts). Ver SEC-001.',
}

const noOtherHtmlSinks = {
  selector:
    'AssignmentExpression[left.property.name="outerHTML"], ' +
    'CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]',
  message: 'Sink de HTML fora do padrão do projeto. Ver SEC-001.',
}

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '_agent_tmp/**', // scratch de agentes (screenshots do visual spec, checkouts alheios); nunca é código deste repo
      '.claude/worktrees/**', // worktree de agente: checkout do repo dentro do repo, local da máquina
      '*.config.js',
      '*.config.ts',
    ],
  },

  // Base para todo TypeScript do projeto.
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------- global
  {
    files: ['**/*.ts'],
    rules: {
      // Erro em qualquer lugar: credencial com fallback.
      'no-restricted-syntax': ['error', noCredentialFallback],

      // Herança: aviso por enquanto. Promovido a erro após SEC-002.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // try/catch que só engole erro. Regra 3 do CLAUDE.md — a segunda defesa
      // que falhou no pauseSync. Aviso porque há vários casos herdados.
      'no-empty': 'warn',
    },
  },

  // ------------------------------------------------------- ZONA DO RENDERER
  // `innerHTML` com dado é o defeito do SEC-001: erro aqui, sem exceção.
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noCredentialFallback,
        noUnsafeInnerHtml,
        noOtherHtmlSinks,
      ],
    },
  },

  // ------------------------------------------------------- ZONA DE FRONTEIRA
  // Código que atravessa renderer <-> main. Aqui é estrito de verdade.
  {
    files: [
      'electron/preload.ts',
      'electron/main.ts',
      'electron/ipc/**/*.ts',
      'electron/security/**/*.ts',
      'shared/**/*.ts', // ainda não existe; nasce estrito (ARCH-001)
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', noCredentialFallback, noAsAny],
      '@typescript-eslint/no-unsafe-function-type': 'error',
      'no-empty': 'error',
    },
  },

  // ------------------------------------------------------------------ TESTES
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
