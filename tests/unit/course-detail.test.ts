// @vitest-environment jsdom
/**
 * `QA-003`: a falha de download tem que mostrar a mensagem que veio do main.
 *
 * O `BUG-006` foi corrigido lendo `result.message` em vez de `result.error`
 * (campo que nunca existiu), e na época nenhum teste tocava esse caminho —
 * quem pegou foi o `tsc`, quando o retorno deixou de ser `any`. Desde o
 * `ARCH-001` a falha é `{ success: false, error: { code, message } }`
 * (`AppResult`, shared/errors.ts); o tipo prova que o campo existe e este teste
 * prova que o valor chega ao usuário.
 *
 * Também cobre a fronteira do `ARCH-001`: o cache antigo carrega `script`, e o
 * botão de download deve mandar só `fileId`/`fileName` — nunca o script.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/toast';
import { setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { renderCourseDetailPage } from '../../src/pages/course-detail';
import { fail, ok } from '../../shared/errors';

function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('course-detail: falha de download', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();

        // DATA-001: o cache é por conta.
        setActiveAccount({ id: 'acc-test', name: 'ALUNO' });
        writeAccountItem('courses', JSON.stringify([{
            id: 'c1',
            name: 'Cálculo I',
            code: 'CB0001',
            files: [{ name: 'Lista 3.pdf', type: 'file', id: '555', script: "jsfcljs(document.forms['formAva'],'formAva:j_id_jsp_1,formAva:j_id_jsp_1,id,555','');" }],
            news: [],
        }]));

        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ lastDownloadPath: 'C:/Users/aluno/SIGAA' }),
            downloadFile: vi.fn().mockResolvedValue({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Sessão expirada no SIGAA' } }),
            selectDownloadFolder: vi.fn(),
            updateSetting: vi.fn(),
            checkFilesExistence: vi.fn().mockResolvedValue(ok([])),
            // Assinado no render; sem ele a página cai no error-message e não há botão.
            onDownloadProgress: vi.fn(() => () => undefined),
        };
    });

    it('mostra a message vinda do main, não "Erro desconhecido" (BUG-006)', async () => {
        const toastError = vi.spyOn(toast, 'error').mockImplementation(() => undefined);
        const container = document.createElement('div');
        document.body.appendChild(container);

        renderCourseDetailPage(container, 'c1');
        // A lista de arquivos é renderizada depois de awaits em fetchCourseFiles.
        for (let i = 0; i < 10; i++) await flushAll();
        const button = container.querySelector<HTMLButtonElement>('.btn-download-file');
        expect(button).not.toBeNull();

        button!.click();
        for (let i = 0; i < 10; i++) await flushAll();

        expect((window as any).api.downloadFile).toHaveBeenCalledWith(
            { courseId: 'c1', courseName: 'Cálculo I', fileId: '555', fileName: 'Lista 3.pdf' }
        );
        expect(JSON.stringify((window as any).api.downloadFile.mock.calls[0][0])).not.toContain('jsfcljs');
        expect(toastError).toHaveBeenCalledWith('Erro no download: Sessão expirada no SIGAA');
        expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining('Erro desconhecido'));
    });
    it('renderiza a lista mesmo quando checkFilesExistence devolve INVALID_REQUEST (SEC-002)', async () => {
        // Há um download registrado, então a checagem de existência é chamada. Se o
        // main rejeitar o pedido, a poda do cache é pulada — a lista não pode sumir.
        // DL-004: a chave é o fileId, não o nome — dois arquivos de nomes iguais
        // não podem compartilhar a mesma entrada de cache.
        writeAccountItem('downloads', JSON.stringify({ c1: { '555': { path: 'C:/Users/aluno/SIGAA/Lista 3.pdf' } } }));
        (window as any).api.checkFilesExistence = vi.fn().mockResolvedValue(fail('INVALID_REQUEST', 'lista de caminhos inválida'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const container = document.createElement('div');
        document.body.appendChild(container);

        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        expect((window as any).api.checkFilesExistence).toHaveBeenCalledWith(['C:/Users/aluno/SIGAA/Lista 3.pdf']);
        expect(container.querySelectorAll('.file-item')).toHaveLength(1);
        expect(container.querySelector('.status-done')).not.toBeNull();
    });
});

describe('course-detail: link externo (BUG-014)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();

        setActiveAccount({ id: 'acc-test', name: 'ALUNO' });
        writeAccountItem('courses', JSON.stringify([{
            id: 'c1',
            name: 'Cálculo I',
            code: 'CB0001',
            files: [
                { name: 'Slides no Drive', type: 'link', id: 'link:1', url: 'https://drive.google.com/x' },
                { name: 'Link antigo do cache', type: 'link', id: 'link:2' },
            ],
            news: [],
        }]));

        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ lastDownloadPath: 'C:/Users/aluno/SIGAA' }),
            downloadFile: vi.fn(),
            selectDownloadFolder: vi.fn(),
            updateSetting: vi.fn(),
            checkFilesExistence: vi.fn().mockResolvedValue(ok([])),
            onDownloadProgress: vi.fn(() => () => undefined),
        };
    });

    it('renderiza um link com url como controle abrível com nome acessível', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        const link = container.querySelector<HTMLAnchorElement>('a[href="https://drive.google.com/x"]');
        expect(link).not.toBeNull();
        expect(link!.getAttribute('aria-label')).toBe('Abrir link externo Slides no Drive');
    });

    it('mantém o ícone inerte para link sem url, sem lançar erro (cache antigo)', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        const rows = container.querySelectorAll('.file-item');
        const inertIcon = rows[1].querySelector('[title="Link indisponível"]');
        expect(inertIcon).not.toBeNull();
        expect(inertIcon!.tagName).toBe('SPAN');
    });
});
