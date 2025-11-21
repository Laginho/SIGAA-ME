var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { createRequire } from "node:module";
import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Sigaa } from "sigaa-api";
import { chromium } from "playwright";
class PlaywrightLoginService {
  constructor() {
    __publicField(this, "browser", null);
  }
  async login(username, password) {
    try {
      console.log("Playwright: Launching browser...");
      this.browser = await chromium.launch({
        headless: false,
        // Set to true later for production
        slowMo: 500
        // Slow down actions so you can see what's happening
      });
      const context = await this.browser.newContext();
      const page = await context.newPage();
      console.log("Playwright: Navigating to login page...");
      await page.goto("https://si3.ufc.br/sigaa/verTelaLogin.do");
      console.log("Playwright: Filling in credentials...");
      await page.fill('input[name="user.login"]', username);
      await page.fill('input[name="user.senha"]', password);
      console.log("Playwright: Clicking login button...");
      await page.click('input[name="entrar"]');
      console.log("Playwright: Waiting for navigation...");
      await page.waitForLoadState("networkidle");
      const currentUrl = page.url();
      console.log("Playwright: Current URL after login:", currentUrl);
      if (currentUrl.includes("verTelaLogin") || currentUrl.includes("logar.do")) {
        const errorElement = await page.$(".erro, .mensagemErro, .alert");
        const errorMessage = errorElement ? await errorElement.textContent() : "Unknown error";
        await this.close();
        return { success: false, error: errorMessage || "Login failed - still on login page" };
      }
      console.log("Playwright: Login successful! Extracting user data...");
      await page.goto("https://si3.ufc.br/sigaa/portais/discente/discente.jsf");
      await page.waitForLoadState("networkidle");
      const nameElement = await page.$(".info-usuario .nome-usuario, .usuario-nome, #nome-usuario, .usuario");
      const userName = nameElement ? await nameElement.textContent() : null;
      console.log("Playwright: Extracted user name:", userName);
      const cookies = await context.cookies();
      console.log("Playwright: Found cookies:", cookies.map((c) => c.name).join(", "));
      await this.close();
      return {
        success: true,
        cookies,
        userName: (userName == null ? void 0 : userName.trim()) || "User"
      };
    } catch (error) {
      console.error("Playwright: Error during login:", error);
      await this.close();
      return { success: false, error: error.message };
    }
  }
  async close() {
    if (this.browser) {
      console.log("Playwright: Closing browser...");
      await this.browser.close();
      this.browser = null;
    }
  }
}
class SigaaService {
  constructor() {
    __publicField(this, "sigaa");
    __publicField(this, "playwrightLogin");
    this.sigaa = new Sigaa({
      url: "https://si3.ufc.br"
    });
    this.playwrightLogin = new PlaywrightLoginService();
    console.log("SIGAA: Service initialized with Playwright login");
  }
  async login(username, password) {
    try {
      console.log("SIGAA: Starting Playwright login...");
      const result = await this.playwrightLogin.login(username, password);
      if (!result.success) {
        return { success: false, message: result.error || "Login failed" };
      }
      console.log("SIGAA: Login successful!");
      return {
        success: true,
        account: {
          name: result.userName || "User",
          photoUrl: void 0
          // We can extract this later if needed
        }
      };
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
