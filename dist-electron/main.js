var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { createRequire } from "node:module";
import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Sigaa } from "sigaa-api";
class SigaaLoginUFC {
  constructor(http, session) {
    this.http = http;
    this.session = session;
  }
  async login(username, password) {
    if (this.session.loginStatus === 1) {
      throw new Error("SIGAA: This session already has a user logged in.");
    }
    const loginPage = await this.http.get("/sigaa/verTelaLogin.do");
    const $ = loginPage.$;
    const form = $('form[name="loginForm"]');
    if (form.length === 0) {
      console.warn("SIGAA: Login form not found in response, attempting hardcoded fallback.");
    }
    let actionUrl = "/sigaa/logar.do?dispatch=logOn";
    const postValues = {};
    if (form.length > 0) {
      const parsedAction = form.attr("action");
      if (parsedAction) {
        actionUrl = parsedAction;
      }
      form.find("input").each((_, element) => {
        const name = $(element).attr("name");
        const value = $(element).val();
        if (name) {
          postValues[name] = value || "";
        }
      });
    } else {
      postValues["width"] = "0";
      postValues["height"] = "0";
      postValues["urlRedirect"] = "";
      postValues["acao"] = "";
    }
    postValues["user.login"] = username;
    postValues["user.senha"] = password;
    postValues["width"] = "1920";
    postValues["height"] = "1080";
    postValues["entrar"] = "Entrar";
    console.log("SIGAA: Attempting login to", actionUrl);
    console.log("SIGAA: Form values:", JSON.stringify(postValues, null, 2));
    const resultPage = await this.http.post(actionUrl, postValues);
    console.log("SIGAA: POST response status:", resultPage.statusCode);
    console.log("SIGAA: POST response URL:", resultPage.url.href);
    const finalPage = await this.http.followAllRedirect(resultPage);
    const body = finalPage.bodyDecoded;
    console.log("SIGAA: Final URL after redirects:", finalPage.url.href);
    console.log("SIGAA: Final status code:", finalPage.statusCode);
    const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      console.log("SIGAA: Page title:", titleMatch[1]);
    }
    if (body.includes("Entrar no Sistema") || body.includes('name="loginForm"')) {
      const errorPatterns = [
        /class="erro"[^>]*>(.*?)</i,
        /class="mensagemErro"[^>]*>(.*?)</i,
        /class="alert"[^>]*>(.*?)</i,
        /Usuário e\/ou senha inválidos/i,
        /Dados inválidos/i
      ];
      for (const pattern of errorPatterns) {
        const match = body.match(pattern);
        if (match) {
          console.error("SIGAA: Found error on page:", match[0]);
        }
      }
      const formStart = body.indexOf("<form");
      if (formStart !== -1) {
        const snippet = body.substring(formStart, formStart + 1e3).replace(/\s+/g, " ");
        console.error("SIGAA: Form area snippet:", snippet);
      }
      if (body.includes("Usuário e/ou senha inválidos") || body.includes("Dados inválidos")) {
        throw new Error("SIGAA: Invalid credentials.");
      }
      throw new Error("SIGAA: Invalid response after login attempt (Still on login page).");
    }
    this.session.loginStatus = 1;
    return finalPage;
  }
}
class DummyLogin {
  async login(_username, _password) {
    throw new Error("DummyLogin should not be called directly.");
  }
}
class SigaaService {
  constructor() {
    __publicField(this, "sigaa");
    this.sigaa = new Sigaa({
      url: "https://si3.ufc.br",
      login: new DummyLogin()
      // Cast to any to satisfy interface if needed
    });
    const http = this.sigaa.http;
    const session = this.sigaa.session;
    const ufcLogin = new SigaaLoginUFC(http, session);
    this.sigaa.login = async (username, password) => {
      console.log("SIGAA: Starting custom UFC login flow...");
      const page = await ufcLogin.login(username, password);
      const accountFactory = this.sigaa.accountFactory;
      return accountFactory.getAccount(page);
    };
    console.log("SIGAA: Service initialized with custom UFC login override.");
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
