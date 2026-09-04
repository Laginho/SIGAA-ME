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
import type { DownloadProgress } from '../../shared/ipc';
import type { DownloadStatus } from '../../shared/domain';
import { errorMessage, fail, failFromMessage, ok } from '../../shared/errors';
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
  >;
  backgroundSync: Pick<BackgroundSyncService, 'restart'>;
  getWindow: () => BrowserWindow | null;
  allowedOrigin: string;
  /** `app.isPackaged`: decide se `test-simulate-new-file` existe. */
  isPackaged: boolean;
  simulateNewFile: () => Promise<boolean>;
}

const noPayload = (): Record<string, never> => ({});

export function registerIpcHandlers(deps: IpcDeps): void {
  function handle<Req, Res>(
    channel: string,
    parse: (raw: unknown) => Req | null,
    run: (req: Req) => Promise<Res>,
    onInvalid: () => Res,
  ): void {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      const win = deps.getWindow();
      const frame =
        event.senderFrame === null || event.senderFrame === undefined
          ? null
          : {
              url: event.senderFrame.url,
              parent: (event.senderFrame as unknown as { parent: unknown | null }).parent ?? null,
            };
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
          console.error('Failed to save remembered credentials:', message);
          return fail('STORAGE', `Login succeeded, but the session could not be remembered: ${message}`);
        }
      } else {
        deps.persistence.clearCredentials();
      }
      return result;
    },
    () => fail('INVALID_REQUEST', 'login-request: credenciais inválidas'),
  );

  handle('try-auto-login', noPayload, async () => {
    const creds = deps.persistence.loadCredentials();
    if (creds) {
      console.log('Auto-login: stored credentials found');
      return await deps.sigaaService.login(creds.username, creds.password);
    }
    return fail('SESSION_EXPIRED', 'Nenhuma credencial salva.');
  }, () => fail('INVALID_REQUEST', 'try-auto-login: não recebe payload'));

  handle('get-courses', noPayload, async () => {
    return await deps.sigaaService.getCourses();
  }, () => fail('INVALID_REQUEST', 'get-courses: não recebe payload'));

  handle('get-course-files', parseCourseRequest,
    async (req) => {
      return await deps.sigaaService.getCourseFiles(req.courseId, req.courseName);
    },
    () => fail('INVALID_REQUEST', 'get-course-files: courseId/courseName inválidos'),
  );

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
    deps.persistence.updateSetting('lastDownloadPath', folderPath);
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
      deps.persistence.applySetting(req);
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

  handle('logout', noPayload, async () => {
    console.log('Logout: Clearing credentials and closing session...');
    try {
      deps.persistence.clearCredentials();
      await deps.sigaaService.logout();
      return ok();
    } catch (error) {
      const message = errorMessage(error);
      console.error('Logout error:', message);
      return failFromMessage(message);
    }
  }, () => fail('INVALID_REQUEST', 'logout: não recebe payload'));

  handle('clear-all-data', noPayload, async () => {
    console.log('Clear all data: Clearing credentials and closing session...');
    try {
      deps.persistence.clearCredentials();
      await deps.sigaaService.logout();
      return ok();
    } catch (error) {
      const message = errorMessage(error);
      console.error('Clear all data error:', message);
      return failFromMessage(message);
    }
  }, () => fail('INVALID_REQUEST', 'clear-all-data: não recebe payload'));

  if (!deps.isPackaged) {
    handle('test-simulate-new-file', noPayload, async () => {
      return await deps.simulateNewFile();
    }, () => false);
  }
}
