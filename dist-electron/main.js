var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { app, ipcMain, dialog, BrowserWindow, safeStorage } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
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
        headless: true
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
        headless: true
      });
      const context = await this.browser.newContext();
      console.log("Playwright: Injecting stored session cookies...");
      await context.addCookies(this.storedCookies);
      const page = await context.newPage();
      page.on("console", (msg) => console.log("Playwright Browser Log:", msg.text()));
      console.log("Playwright: Navigating to home page...");
      await page.goto("https://si3.ufc.br/sigaa/paginaInicial.do");
      await page.waitForLoadState("networkidle");
      if (page.url().includes("verTelaLogin")) {
        await this.close();
        return { success: false, error: "Session expired - please login again" };
      }
      console.log('Playwright: Looking for "Menu Discente" link...');
      try {
        const studentLink = page.locator('a[href="/sigaa/verPortalDiscente.do"]').first();
        await studentLink.click({ timeout: 5e3 });
        await page.waitForLoadState("networkidle");
        console.log("Playwright: Clicked Menu Discente, current URL:", page.url());
      } catch (clickError) {
        console.log("Playwright: Auto-click failed:", clickError);
        console.log("Playwright: Current URL:", page.url());
        console.log("Playwright: Trying direct navigation to verPortalDiscente.do...");
        await page.goto("https://si3.ufc.br/sigaa/verPortalDiscente.do");
        await page.waitForLoadState("networkidle");
      }
      await page.waitForTimeout(1e3);
      console.log("Playwright: Extracting courses from page...");
      const courses = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll("tr");
        for (const row of rows) {
          const idInput = row.querySelector('input[name="idTurma"]');
          const nameLink = row.querySelector('a[id*="turmaVirtual"]');
          const periodCell = row.querySelector("td.info center");
          if (idInput && nameLink && nameLink.textContent) {
            const fullText = nameLink.textContent.trim();
            const id = idInput.value;
            const parts = fullText.split(" - ");
            if (parts.length >= 2) {
              results.push({
                id,
                code: parts[0].trim(),
                name: parts.slice(1).join(" - ").trim(),
                period: periodCell ? periodCell.innerText.split("\n")[0] : ""
                // Try to get first line of period info
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
  async navigateToCourse(page, courseId) {
    try {
      await page.goto("https://si3.ufc.br/sigaa/verPortalDiscente.do");
      await page.waitForLoadState("networkidle");
      console.log(`Playwright: Entering course ${courseId}...`);
      const entered = await page.evaluate((id) => {
        const inputs = Array.from(document.querySelectorAll('input[name="idTurma"]'));
        const targetInput = inputs.find((input) => input.value === id);
        if (targetInput) {
          const row = targetInput.closest("tr");
          if (row) {
            const link = row.querySelector('a[id*="turmaVirtual"]');
            if (link) {
              console.log("Clicking course:", link.innerText);
              link.click();
              return { success: true };
            }
          }
        }
        return { success: false };
      }, courseId);
      if (!entered.success) {
        console.error("Playwright: Course not found in portal");
        return false;
      }
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2e3);
      await page.goto("https://si3.ufc.br/sigaa/ava/index.jsf");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1e3);
      return true;
    } catch (error) {
      console.error("Playwright: Navigation error:", error);
      return false;
    }
  }
  async getCourseFiles(courseId) {
    try {
      console.log(`Playwright: Fetching files for course ${courseId}...`);
      if (!this.storedCookies || this.storedCookies.length === 0) {
        return { success: false, error: "No stored session - please login first" };
      }
      this.browser = await chromium.launch({
        headless: true
      });
      const context = await this.browser.newContext();
      await context.addCookies(this.storedCookies);
      const page = await context.newPage();
      const navigated = await this.navigateToCourse(page, courseId);
      if (!navigated) {
        await this.close();
        return { success: false, error: "Failed to navigate to course page" };
      }
      console.log("Playwright: Extracting files...");
      const filesData = await page.evaluate(() => {
        const files = [];
        const links = Array.from(document.querySelectorAll("a"));
        for (const link of links) {
          const text = link.innerText.trim();
          let href = link.href;
          const onclick = link.getAttribute("onclick");
          if (text && (text.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i) || text.toLowerCase().includes("lista") || text.toLowerCase().includes("exerc"))) {
            if (href.endsWith("#") || href.includes("index.jsf#")) {
              if (onclick) {
                const urlMatch = onclick.match(/['"]([^'"]*downloadArquivo[^'"]*)['"]/i) || onclick.match(/['"]([^'"]*visualizar[^'"]*)['"]/i) || onclick.match(/['"]([^'"]*\.(pdf|doc|docx)[^'"]*)['"]/i);
                if (urlMatch) {
                  href = urlMatch[1];
                  if (!href.startsWith("http")) {
                    href = "https://si3.ufc.br" + (href.startsWith("/") ? href : "/sigaa/" + href);
                  }
                }
              }
            }
            files.push({
              name: text,
              url: href
            });
          }
        }
        return files;
      });
      console.log("Playwright: Found", filesData.length, "files");
      await this.close();
      return { success: true, files: filesData };
    } catch (error) {
      console.error("Playwright: Error fetching files:", error);
      await this.close();
      return { success: false, error: error.message };
    }
  }
  async downloadFile(courseId, courseName, fileName, fileUrl, basePath, downloadedFiles) {
    try {
      const { DownloadService } = await import("./download.service-DGya2izB.js");
      const downloadService = new DownloadService(this.browser);
      if (!this.browser) {
        this.browser = await chromium.launch({ headless: false });
      }
      const context = await this.browser.newContext();
      if (this.storedCookies.length > 0) {
        await context.addCookies(this.storedCookies);
      }
      const page = await context.newPage();
      const navigated = await this.navigateToCourse(page, courseId);
      if (!navigated) {
        await this.close();
        return { success: false, error: "Failed to navigate to course page" };
      }
      const result = await downloadService.downloadFile(
        page,
        fileUrl,
        fileName,
        courseName,
        basePath
      );
      await this.close();
      return result;
    } catch (error) {
      console.error("Playwright: Download error:", error);
      await this.close();
      return { success: false, error: error.message };
    }
  }
  async downloadAllFiles(courseId, courseName, files, basePath, downloadedFiles, onProgress) {
    try {
      const { DownloadService } = await import("./download.service-DGya2izB.js");
      const downloadService = new DownloadService(this.browser);
      if (!this.browser) {
        this.browser = await chromium.launch({ headless: false });
      }
      const context = await this.browser.newContext();
      if (this.storedCookies.length > 0) {
        await context.addCookies(this.storedCookies);
      }
      const page = await context.newPage();
      const navigated = await this.navigateToCourse(page, courseId);
      if (!navigated) {
        await this.close();
        return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
      }
      const result = await downloadService.downloadCourseFiles(
        page,
        courseId,
        courseName,
        files,
        basePath,
        downloadedFiles,
        onProgress
      );
      await this.close();
      return result;
    } catch (error) {
      console.error("Playwright: Download all error:", error);
      await this.close();
      return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
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
  async getCourseFiles(courseId) {
    try {
      console.log(`SIGAA: Fetching files for course ${courseId}...`);
      const result = await this.playwrightLogin.getCourseFiles(courseId);
      if (!result.success) {
        return { success: false, message: result.error || "Failed to fetch files" };
      }
      return { success: true, files: result.files };
    } catch (error) {
      console.error("SIGAA: Error fetching files:", error);
      return { success: false, message: error.message || "Failed to fetch files" };
    }
  }
  async downloadFile(courseId, courseName, fileName, fileUrl, basePath, downloadedFiles) {
    try {
      console.log(`SIGAA: Downloading file ${fileName}...`);
      const result = await this.playwrightLogin.downloadFile(
        courseId,
        courseName,
        fileName,
        fileUrl,
        basePath,
        downloadedFiles
      );
      if (!result.success) {
        return { success: false, message: result.error || "Download failed" };
      }
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error("SIGAA: Error downloading file:", error);
      return { success: false, message: error.message || "Download failed" };
    }
  }
  async downloadAllFiles(courseId, courseName, files, basePath, downloadedFiles, onProgress) {
    try {
      console.log(`SIGAA: Downloading all files for course ${courseName}...`);
      const result = await this.playwrightLogin.downloadAllFiles(
        courseId,
        courseName,
        files,
        basePath,
        downloadedFiles,
        onProgress
      );
      return {
        success: true,
        downloaded: result.downloaded,
        skipped: result.skipped,
        failed: result.failed,
        results: result.results
      };
    } catch (error) {
      console.error("SIGAA: Error downloading files:", error);
      return { success: false, message: error.message || "Download failed" };
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
const CREDENTIALS_PATH = path.join(app.getPath("userData"), "credentials.json");
function saveCredentials(username, password) {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password);
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({
      username,
      password: encrypted.toString("base64")
    }));
  }
}
function loadCredentials() {
  if (fs.existsSync(CREDENTIALS_PATH) && safeStorage.isEncryptionAvailable()) {
    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
      const password = safeStorage.decryptString(Buffer.from(data.password, "base64"));
      return { username: data.username, password };
    } catch (e) {
      console.error("Failed to load credentials", e);
    }
  }
  return null;
}
ipcMain.handle("login-request", async (_event, { username, password, rememberMe }) => {
  const result = await sigaaService.login(username, password);
  if (result.success && rememberMe) {
    saveCredentials(username, password);
  } else if (result.success && !rememberMe) {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
  }
  return result;
});
ipcMain.handle("try-auto-login", async () => {
  const creds = loadCredentials();
  if (creds) {
    console.log("Auto-login: Found credentials for", creds.username);
    return await sigaaService.login(creds.username, creds.password);
  }
  return { success: false };
});
ipcMain.handle("get-courses", async () => {
  return await sigaaService.getCourses();
});
ipcMain.handle("get-course-files", async (_, courseId) => {
  return await sigaaService.getCourseFiles(courseId);
});
ipcMain.handle("select-download-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Selecione a pasta para downloads"
  });
  if (result.canceled) {
    return { success: false };
  }
  return { success: true, folderPath: result.filePaths[0] };
});
ipcMain.handle("download-file", async (_, data) => {
  return await sigaaService.downloadFile(
    data.courseId,
    data.courseName,
    data.fileName,
    data.fileUrl,
    data.basePath,
    data.downloadedFiles
  );
});
ipcMain.handle("download-all-files", async (_, data) => {
  const onProgress = (fileName, status) => {
    win == null ? void 0 : win.webContents.send("download-progress", { fileName, status });
  };
  return await sigaaService.downloadAllFiles(
    data.courseId,
    data.courseName,
    data.files,
    data.basePath,
    data.downloadedFiles,
    onProgress
  );
});
ipcMain.handle("check-files-existence", async (_, filePaths) => {
  return filePaths.map((filePath) => ({
    path: filePath,
    exists: fs.existsSync(filePath)
  }));
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
