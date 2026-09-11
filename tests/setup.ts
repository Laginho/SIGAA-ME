/**
 * jsdom 29 reflete o atributo `open` de `<dialog>`, mas não implementa
 * `showModal()`/`close()` (A11Y-001 migrou o modal de notícia para o
 * elemento nativo). Sem isso, todo teste que abre o modal — inclusive os de
 * sanitização de `SEC-001`, que não têm nada a ver com este ticket — quebra
 * com "showModal is not a function" em vez de exercitar o código deles.
 *
 * Polyfill mínimo: só o que os testes observam (o atributo `open` e o evento
 * `close`), nada da semântica de foco/inertness do browser real — essa parte
 * só é provável num Chromium de verdade (tests/e2e/accessibility.spec.ts).
 */
if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
    };
}
