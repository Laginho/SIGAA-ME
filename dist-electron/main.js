var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { createRequire } from "node:module";
import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Sigaa } from "sigaa-api";
class SigaaService {
  constructor() {
    __publicField(this, "sigaa");
    this.sigaa = new Sigaa({
      url: "https://si3.ufc.br"
      // We might need to make this configurable later!
    });
  }
  async login(username, password) {
    try {
      const account = await this.sigaa.login(username, password);
      if (account) {
        const name = await account.getName();
        const photoUrl = await account.getProfilePictureURL();
        return {
          success: true,
          account: {
            name,
            photoUrl: photoUrl ? photoUrl.toString() : void 0
          }
        };
      } else {
        return { success: false, message: "Authentication failed." };
      }
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, message: error.message || "Unknown error occurred." };
    }
  }
}
const require$1 = createRequire(import.meta.url);
let iconv;
try {
  iconv = require$1("sigaa-api/node_modules/iconv-lite");
} catch (e) {
  iconv = require$1("iconv-lite");
}
iconv.enableStreamingAPI(require$1("stream"));
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
const sigaaService = new SigaaService();
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle("login-request", async (_event, { username, password }) => {
  return await sigaaService.login(username, password);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
