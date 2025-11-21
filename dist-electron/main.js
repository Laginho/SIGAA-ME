var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
class PlaywrightLoginService {
  constructor() {
    __publicField(this, "browser", null);
    __publicField(this, "storedCookies", []);
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
      const nameElement = await page.$(".nome_usuario, .info-usuario .nome");
      const userName = nameElement ? await nameElement.textContent() : null;
      console.log("Playwright: Extracted user name:", userName);
      const cookies = await context.cookies();
      console.log("Playwright: Found cookies:", cookies.map((c) => c.name).join(", "));
      this.storedCookies = cookies;
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
  async getCourses() {
    try {
      console.log("Playwright: Launching browser to fetch courses...");
      if (!this.storedCookies || this.storedCookies.length === 0) {
        return { success: false, error: "No stored session - please login first" };
      }
      this.browser = await chromium.launch({
        headless: false,
        slowMo: 500
      });
      const context = await this.browser.newContext();
      console.log("Playwright: Injecting stored session cookies...");
      await context.addCookies(this.storedCookies);
      const page = await context.newPage();
      console.log("Playwright: Navigating to home page...");
      await page.goto("https://si3.ufc.br/sigaa/paginaInicial.do");
      await page.waitForLoadState("networkidle");
      if (page.url().includes("verTelaLogin")) {
        await this.close();
        return { success: false, error: "Session expired - please login again" };
      }
      console.log('Playwright: Looking for "Menu Discente" link...');
      try {
        const studentLink = page.locator('a[href="/sigaa/verPortalDiscente.do"]');
        await studentLink.click({ timeout: 5e3 });
        await page.waitForLoadState("networkidle");
        console.log("Playwright: Clicked Menu Discente, current URL:", page.url());
      } catch (clickError) {
        console.log("Playwright: Auto-click failed:", clickError);
        console.log("Playwright: Current URL:", page.url());
        console.log("Playwright: Trying direct navigation to verPortalDiscente.do...");
        await page.goto("https://si3.ufc.br/sigaa/verPortalDiscente.do");
        await page.waitForLoadState("networkidle");
        console.log("Playwright: Direct navigation complete, URL:", page.url());
      }
      await page.waitForTimeout(1e3);
      console.log("Playwright: Extracting courses from page...");
      const courses = await page.evaluate(() => {
        var _a;
        const results = [];
        const courseCodePattern = /^[A-Z]{2}\d{4}/;
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent && node.textContent.trim()) {
            textNodes.push(node);
          }
        }
        for (const textNode of textNodes) {
          const text = ((_a = textNode.textContent) == null ? void 0 : _a.trim()) || "";
          const match = text.match(courseCodePattern);
          if (match) {
            const fullText = text;
            const parts = fullText.split(" - ");
            if (parts.length >= 2) {
              results.push({
                code: parts[0].trim(),
                name: parts.slice(1).join(" - ").trim(),
                period: ""
                // We can extract this later if needed
              });
            }
          }
        }
        return results;
      });
      console.log("Playwright: Found courses:", courses.length);
      if (courses.length > 0) {
        console.log("Playwright: Sample courses:", courses.slice(0, 3));
      }
      await this.close();
      return { success: true, courses };
    } catch (error) {
      console.error("Playwright: Error fetching courses:", error);
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
    __publicField(this, "playwrightLogin");
    this.playwrightLogin = new PlaywrightLoginService();
    console.log("SIGAA: Service initialized with Playwright");
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
  async getCourses() {
    var _a;
    try {
      console.log("SIGAA: Fetching courses using Playwright...");
      const result = await this.playwrightLogin.getCourses();
      if (!result.success) {
        return { success: false, message: result.error || "Failed to fetch courses" };
      }
      console.log("SIGAA: Found courses:", ((_a = result.courses) == null ? void 0 : _a.length) || 0);
      return {
        success: true,
        courses: result.courses
      };
    } catch (error) {
      console.error("SIGAA: Error fetching courses:", error);
      return { success: false, message: error.message || "Failed to fetch courses" };
    }
  }
}
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
ipcMain.handle("get-courses", async () => {
  return await sigaaService.getCourses();
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
