/**
 * Todos os `ipcMain.handle` saem do `main.ts` para aqui (SEC-002).
 *
 * Nada de lógica nova: é mover + validar. Cada handler passa pelo wrapper
 * `handle`, que confere o remetente (frame principal da nossa janela, origem
 * que nós carregamos) e valida o payload por allowlist antes de tocar
 * qualquer serviço. Payload inválido devolve `INVALID_REQUEST` sem tocar
 * nos serviços.
 */

import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { isInsideRoot } from '../services/download-path';
import type { SigaaService } from '../services/sigaa.service';
import type { PersistenceService } from '../services/persistence.service';
import type { BackgroundSyncService } from '../services/background-sync.service';
import type { CacheService } from '../services/cache.service';
import type { LoggerService } from '../services/logger.service';
import { logger } from '../services/logger.service';
import type { DiagnosticsService } from '../services/diagnostics.service';
import type { PortalCompatibilityService } from '../services/portal-compatibility.service';
import type { DownloadProgress } from '../../shared/ipc';
import type { DownloadStatus } from '../../shared/domain';
import { errorMessage, fail, ok } from '../../shared/errors';
import {
  parseCourseRequest,
  parseDownloadAllFilesPayload,
  parseDownloadFilePayload,
  parseFilePaths,
  parseLoginCredentials,
  parseNewsDetailRequest,
  parseSettingUpdate,
} from './validation';
import { isTrustedSender } from './sender-policy';

export interface IpcDeps {
  sigaaService: Pick<
    SigaaService,
    | 'login'
    | 'getCourses'
    | 'getCourseFiles'
    | 'downloadFile'
    | 'downloadAllFiles'
    | 'getNewsDetail'
    | 'loadAllNews'
    | 'logout'
  >;
  persistence: Pick<
    PersistenceService,
    | 'getSettings'
    | 'applySetting'
    | 'updateSetting'
    | 'saveCredentials'
    | 'clearCredentials'
    | 'loadCredentials'
    | 'reset'
  >;
  backgroundSync: Pick<BackgroundSyncService, 'restart' | 'stop' | 'start' | 'cancel'>;
  cache: Pick<CacheService, 'clear'>;
  logger: Pick<LoggerService, 'clear'>;
  diagnostics: Pick<DiagnosticsService, 'clear'>;
  compatibility: Pick<PortalCompatibilityService, 'status' | 'recordSuccess' | 'clear'>;
  userDataPath: string;
  clearBrowserStorage: () => Promise<void>;
  getWindow: () => BrowserWindow | null;
  allowedOrigin: string;
  /** `app.isPackaged`: decide se `test-simulate-new-file` existe. */
  isPackaged: boolean;
  simulateNewFile: () => Promise<boolean>;
}

const noPayload = (): Record<string, never> => ({});
const log = logger.scope('Ipc');

/** Roda `step`; uma falha vira texto em `failures` (e log), sem impedir o próximo passo. */
async function attempt(step: () => void | Promise<void>, failures: string[], label: string): Promise<void> {
  try {
    await step();
  } catch (error) {
    const message = errorMessage(error);
    failures.push(message);
    log.error(`${label} falhou`, { error: message });
  }
}

export function registerIpcHandlers(deps: IpcDeps): void {
  function handle<Req, Res>(
    channel: string,
    parse: (raw: unknown) => Req | null,
    run: (req: Req) => Promise<Res>,
    onInvalid: () => Res,
  ): void {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      const win = deps.getWindow();
      const senderFrame = event.senderFrame;
      const frame = senderFrame ? { url: senderFrame.url, parent: senderFrame.parent } : null;
      if (
        !isTrustedSender(frame, event.sender.id, {
          windowWebContentsId: win?.webContents.id ?? null,
          allowedOrigin: deps.allowedOrigin,
        })
      ) {
        throw new Error(`IPC ${channel}: remetente não confiável`);
      }
      const req = parse(raw);
      if (req === null) return onInvalid();
      return run(req);
    });
  }

  handle('login-request', parseLoginCredentials,
    async (req) => {
      const result = await deps.sigaaService.login(req.username, req.password);
      if (!result.success) return result;
      if (req.rememberMe) {
        try {
          deps.persistence.saveCredentials(req.username, req.password);
        } catch (error) {
          const message = errorMessage(error);
          log.error('Failed to save remembered credentials', { error: message });
          return fail('STORAGE', `Login succeeded, but the session could not be remembered: ${message}`);
        }
      } else {
        // `clearCredentials()` agora propaga falha do `unlink` (DATA-002): sem
        // isto o handler devolveria sucesso com a credencial ainda no disco.
        try {
          deps.persistence.clearCredentials();
        } catch (error) {
          const message = errorMessage(error);
          log.error('Failed to clear credentials', { error: message });
          return fail('STORAGE', message);
        }
      }
      return result;
    },
    () => fail('INVALID_REQUEST', 'login-request: credenciais inválidas'),
  );

  handle('try-auto-login', noPayload, async () => {
    const creds = deps.persistence.loadCredentials();
    if (creds) {
      log.info('Auto-login: stored credentials found');
      return await deps.sigaaService.login(creds.username, creds.password);
    }
    return fail('SESSION_EXPIRED', 'Nenhuma credencial salva.');
  }, () => fail('INVALID_REQUEST', 'try-auto-login: não recebe payload'));

  handle('get-courses', noPayload, async () => {
    return await deps.sigaaService.getCourses();
  }, () => fail('INVALID_REQUEST', 'get-courses: não recebe payload'));

  handle('get-course-files', parseCourseRequest,
    async (req) => {
      const result = await deps.sigaaService.getCourseFiles(req.courseId, req.courseName);
      // Restauração do kill-switch (decisão 4, PORTAL-005): um manual bem-sucedido
      // aqui cobre o fluxo real do usuário, que sempre chama get-course-files.
      if (result.success) deps.compatibility.recordSuccess();
      return result;
    },
    () => fail('INVALID_REQUEST', 'get-course-files: courseId/courseName inválidos'),
  );

  // `status()` nunca lança; `onInvalid` é inalcançável — só existe para satisfazer o tipo.
  handle('get-compatibility-status', noPayload, async () => {
    return deps.compatibility.status();
  }, () => {
    throw new Error('get-compatibility-status: não recebe payload');
  });

  handle('select-download-folder', noPayload, async () => {
    const win = deps.getWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Selecione a pasta para downloads',
    });

    if (result.canceled) {
      return fail('CANCELLED', 'Seleção de pasta cancelada.');
    }

    const folderPath = result.filePaths[0];
    try {
      deps.persistence.updateSetting('lastDownloadPath', folderPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail('STORAGE', `Não foi possível salvar a pasta de downloads: ${message}`);
    }
    return ok({ folderPath });
  }, () => fail('INVALID_REQUEST', 'select-download-folder: não recebe payload'));

  handle('download-file', parseDownloadFilePayload,
    async (req) => {
      const root = deps.persistence.getSettings().lastDownloadPath;
      if (!root) return fail('INVALID_REQUEST', 'Nenhuma pasta de downloads definida');
      return await deps.sigaaService.downloadFile(
        req.courseId,
        req.courseName,
        { id: req.fileId, name: req.fileName },
        root,
      );
    },
    () => fail('INVALID_REQUEST', 'download-file: courseId/courseName/fileId/fileName inválidos'),
  );

  handle('download-all-files', parseDownloadAllFilesPayload,
    async (req) => {
      const root = deps.persistence.getSettings().lastDownloadPath;
      if (!root) return fail('INVALID_REQUEST', 'Nenhuma pasta de downloads definida');
      const onProgress = (fileName: string, status: DownloadStatus) => {
        const progress: DownloadProgress = { fileName, status };
        deps.getWindow()?.webContents.send('download-progress', progress);
      };

      return await deps.sigaaService.downloadAllFiles(
        req.courseId,
        req.courseName,
        req.files,
        root,
        onProgress,
      );
    },
    () => fail('INVALID_REQUEST', 'download-all-files: courseId/courseName/files inválidos'),
  );

  handle('check-files-existence', parseFilePaths,
    async (req) => {
      const root = deps.persistence.getSettings().lastDownloadPath;
      return ok(
        req.map((filePath) => ({
          path: filePath,
          exists: root !== null && isInsideRoot(root, filePath) && fs.existsSync(filePath),
        })),
      );
    },
    () => fail('INVALID_REQUEST', 'check-files-existence: lista de caminhos inválida'),
  );

  handle('get-news-detail', parseNewsDetailRequest,
    async (req) => {
      return await deps.sigaaService.getNewsDetail(req.courseId, req.courseName, req.newsId);
    },
    () => fail('INVALID_REQUEST', 'get-news-detail: courseId/courseName/newsId inválidos'),
  );

  handle('load-all-news', parseCourseRequest,
    async (req) => {
      return await deps.sigaaService.loadAllNews(req.courseId, req.courseName);
    },
    () => fail('INVALID_REQUEST', 'load-all-news: courseId/courseName inválidos'),
  );

  // `getSettings` devolve `AppSettings` cru (não falível): `parse` nunca falha,
  // então `onInvalid` é inalcançável — só existe para satisfazer o tipo.
  handle('get-app-settings', noPayload, async () => {
    return deps.persistence.getSettings();
  }, () => {
    throw new Error('get-app-settings: não recebe payload');
  });

  handle('update-app-setting', parseSettingUpdate,
    async (req) => {
      try {
        deps.persistence.applySetting(req);
      } catch (error) {
        // Disco recusou a escrita: a memória não mudou (DATA-003), então nada
        // abaixo deve rodar e o renderer precisa saber que não foi salvo.
        const message = error instanceof Error ? error.message : String(error);
        return fail('STORAGE', `Não foi possível salvar a configuração: ${message}`);
      }
      if (req.key === 'openAtLogin') {
        app.setLoginItemSettings({
          openAtLogin: req.value,
          path: process.execPath,
          args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
        });
      }
      if (req.key === 'runInBackground' || req.key === 'syncInterval') {
        deps.backgroundSync.restart();
      }
      return ok();
    },
    () => fail('INVALID_REQUEST', 'update-app-setting: chave ou valor inválido'),
  );

  // Ordem: a credencial some primeiro para que nenhum sync novo consiga
  // começar no intervalo (`syncNow` aborta sem ela); só depois de a sessão
  // estar drenada e fechada o handler devolve sucesso. Cada passo roda mesmo
  // que um anterior tenha falhado — a sessão precisa terminar de fechar de
  // qualquer forma, mas o resultado avisa que a credencial pode ter sobrado.
  handle('logout', noPayload, async () => {
    log.info('Logout: clearing credentials and closing session...');
    const failures: string[] = [];
    await attempt(() => deps.persistence.clearCredentials(), failures, 'Limpar credencial');
    await attempt(() => deps.backgroundSync.cancel(), failures, 'Encerrar sincronização');
    await attempt(() => deps.sigaaService.logout(), failures, 'Fechar sessão');
    if (failures.length > 0) return fail('STORAGE', failures.join('; '));
    return ok();
  }, () => fail('INVALID_REQUEST', 'logout: não recebe payload'));

  handle('clear-all-data', noPayload, async () => {
    const win = deps.getWindow();
    const { response } = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Apagar tudo', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Limpar todos os dados',
      message: 'Apagar todos os dados locais do SIGAA-ME?',
      detail:
        'Isso remove credenciais salvas, cache de disciplinas, notificações, ' +
        'configurações e logs desta máquina, de todas as contas. ' +
        'Os arquivos baixados na sua pasta de downloads não serão apagados.',
    });
    if (response !== 0) return fail('CANCELLED', 'Limpeza cancelada.');

    log.info('Clear all data: closing session before destructive cleanup...');
    const failures: string[] = [];

    // 1. Fecha a sessão — nada destrutivo antes disto.
    await attempt(() => deps.persistence.clearCredentials(), failures, 'Limpar credencial');
    await attempt(() => deps.backgroundSync.stop(), failures, 'Parar agendador');
    await attempt(() => deps.backgroundSync.cancel(), failures, 'Encerrar sincronização');
    await attempt(() => deps.sigaaService.logout(), failures, 'Fechar sessão');

    // Lido antes do reset: depois dele `getSettings()` já mostra o default.
    const openAtLoginBefore = deps.persistence.getSettings().openAtLogin;

    // 2. Só agora, os passos destrutivos.
    await attempt(() => deps.cache.clear(), failures, 'Limpar cache');
    await attempt(() => deps.persistence.reset(), failures, 'Limpar configurações');
    await attempt(() => deps.diagnostics.clear(), failures, 'Apagar diagnósticos salvos');
    await attempt(() => deps.compatibility.clear(), failures, 'Limpar estado de compatibilidade');
    await attempt(() => deps.clearBrowserStorage(), failures, 'Limpar armazenamento do navegador');

    if (openAtLoginBefore) {
      app.setLoginItemSettings({
        openAtLogin: false,
        path: process.execPath,
        args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
      });
    }

    // 3. Estado de "primeiro launch": agendador de volta, sem credencial ele não-opera.
    deps.backgroundSync.start();
    // O log por ultimo: `backgroundSync.start()` grava uma linha e o logger
    // reabre `logs/app.log` no primeiro write depois de `clear()`. Limpar antes
    // deixava o arquivo recriado no disco (clear-all.spec.ts, DATA-002).
    await attempt(() => deps.logger.clear(), failures, 'Limpar log');

    if (failures.length > 0) {
      return fail(
        'STORAGE',
        `${failures.join('; ')}. Feche o SIGAA-ME e apague a pasta manualmente: ${deps.userDataPath}`,
      );
    }
    return ok();
  }, () => fail('INVALID_REQUEST', 'clear-all-data: não recebe payload'));

  if (!deps.isPackaged) {
    handle('test-simulate-new-file', noPayload, async () => {
      return await deps.simulateNewFile();
    }, () => false);
  }
}
