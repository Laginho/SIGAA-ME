var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import * as fs from "fs";
import * as path from "path";
class DownloadService {
  constructor(browser) {
    __publicField(this, "browser", null);
    this.browser = browser;
  }
  async downloadFile(page, fileUrl, fileName, courseName, basePath) {
    try {
      const courseFolder = path.join(basePath, this.sanitizeFolderName(courseName));
      if (!fs.existsSync(courseFolder)) {
        fs.mkdirSync(courseFolder, { recursive: true });
      }
      const filePath = path.join(courseFolder, this.sanitizeFileName(fileName));
      if (fs.existsSync(filePath)) {
        console.log(`File already exists: ${filePath}`);
        return { success: true, filePath };
      }
      if (fs.existsSync(filePath + ".pdf")) {
        console.log(`File already exists: ${filePath}.pdf`);
        return { success: true, filePath: filePath + ".pdf" };
      }
      if (page.url() === "about:blank") {
        throw new Error("Page lost context (about:blank)");
      }
      console.log(`Looking for file link with text: "${fileName}"`);
      const link = page.locator(`a:has-text("${fileName}")`).first();
      if (await link.isVisible()) {
        console.log(`Found link for ${fileName}, clicking...`);
        await page.route("**/*", async (route) => {
          try {
            const response = await route.fetch();
            const headers = response.headers();
            const contentType = headers["content-type"] || "";
            if (contentType.includes("application/pdf")) {
              console.log(`Intercepted PDF request: ${route.request().url()}`);
              headers["content-type"] = "application/octet-stream";
              headers["content-disposition"] = "attachment";
              await route.fulfill({
                response,
                headers
              });
            } else {
              await route.continue();
            }
          } catch (e) {
            try {
              await route.continue();
            } catch {
            }
          }
        });
        const downloadPromise = page.waitForEvent("download", { timeout: 6e4 });
        const popupPromise = page.waitForEvent("popup", { timeout: 6e4 });
        await link.click({ force: true });
        const result = await Promise.race([
          downloadPromise.then((d) => ({ type: "download", data: d })),
          popupPromise.then((p) => ({ type: "popup", data: p })),
          new Promise((resolve) => setTimeout(() => resolve({ type: "timeout" }), 65e3))
        ]);
        await page.unroute("**/*");
        if (result.type === "download") {
          const download = result.data;
          let finalPath = filePath;
          if (!finalPath.toLowerCase().endsWith(".pdf")) {
            finalPath += ".pdf";
          }
          await download.saveAs(finalPath);
          console.log(`Downloaded: ${finalPath}`);
          return { success: true, filePath: finalPath };
        } else if (result.type === "popup") {
          const popup = result.data;
          console.log(`Popup opened: ${popup.url()}`);
          try {
            const popupDownload = await popup.waitForEvent("download", { timeout: 5e3 });
            let finalPath = filePath;
            if (!finalPath.toLowerCase().endsWith(".pdf")) {
              finalPath += ".pdf";
            }
            await popupDownload.saveAs(finalPath);
            console.log(`Downloaded from popup: ${finalPath}`);
            await popup.close();
            return { success: true, filePath: finalPath };
          } catch (e) {
          }
          console.log("Reloading popup to force interception...");
          await popup.route("**/*", async (route) => {
            var _a;
            try {
              const response = await route.fetch();
              const headers = response.headers();
              if ((_a = headers["content-type"]) == null ? void 0 : _a.includes("application/pdf")) {
                console.log("Intercepted PDF in popup! Forcing download...");
                headers["content-type"] = "application/octet-stream";
                headers["content-disposition"] = "attachment";
                await route.fulfill({ response, headers });
              } else {
                await route.continue();
              }
            } catch {
              try {
                await route.continue();
              } catch {
              }
            }
          });
          try {
            const reloadDownloadPromise = popup.waitForEvent("download", { timeout: 1e4 });
            await popup.reload().catch((e) => {
              if (e.message.includes("ERR_ABORTED") || e.message.includes("frame was detached")) {
                console.log("Reload aborted as expected (download started)");
              } else {
                throw e;
              }
            });
            const download = await reloadDownloadPromise;
            let finalPath = filePath;
            if (!finalPath.toLowerCase().endsWith(".pdf")) {
              finalPath += ".pdf";
            }
            await download.saveAs(finalPath);
            console.log(`Downloaded after popup reload: ${finalPath}`);
            await popup.close();
            return { success: true, filePath: finalPath };
          } catch (e) {
            console.log(`Reload strategy failed: ${e}`);
          }
          await popup.close();
          return { success: false, error: "Could not force download" };
        } else {
          throw new Error("Timeout waiting for download or popup");
        }
      } else {
        if (fileUrl.includes("javascript:")) {
          const onclickPart = fileUrl.replace("javascript:", "");
          const element = await page.$(`a[onclick*="${onclickPart}"]`);
          if (element) {
            const downloadPromise = page.waitForEvent("download", { timeout: 3e4 });
            await element.click();
            const download = await downloadPromise;
            let finalPath = filePath;
            if (!finalPath.toLowerCase().endsWith(".pdf")) {
              finalPath += ".pdf";
            }
            await download.saveAs(finalPath);
            return { success: true, filePath: finalPath };
          }
        }
        await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 3e4 });
        return { success: true, filePath };
      }
    } catch (error) {
      console.error(`Download failed for ${fileName}:`, error);
      try {
        await page.unroute("**/*");
      } catch {
      }
      return { success: false, error: error.message };
    }
  }
  async downloadCourseFiles(page, courseId, courseName, files, basePath, downloadedFiles, onProgress) {
    const results = [];
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    const queue = files.filter((file) => {
      const courseDownloads = downloadedFiles[courseId] || {};
      if (courseDownloads[file.name]) {
        const existingPath = courseDownloads[file.name].path;
        if (fs.existsSync(existingPath) || fs.existsSync(existingPath + ".pdf")) {
          console.log(`Skipping duplicate: ${file.name}`);
          skipped++;
          results.push({ fileName: file.name, status: "skipped", filePath: existingPath });
          if (onProgress) onProgress(file.name, "skipped");
          return false;
        }
      }
      return true;
    });
    console.log(`Starting parallel download for ${queue.length} files with 3 workers...`);
    const courseUrl = page.url();
    const CONCURRENCY = 3;
    const processQueue = async (workerId) => {
      let workerPage = workerId === 0 ? page : await page.context().newPage();
      try {
        if (workerId !== 0) {
          console.log(`[Worker ${workerId}] Navigating to course...`);
          await workerPage.goto(courseUrl, { waitUntil: "domcontentloaded" });
        }
        while (queue.length > 0) {
          const file = queue.shift();
          if (!file) break;
          console.log(`[Worker ${workerId}] Processing ${file.name}...`);
          if (workerPage.url() !== courseUrl) {
            await workerPage.goto(courseUrl, { waitUntil: "domcontentloaded" });
          }
          const result = await this.downloadFile(workerPage, file.url, file.name, courseName, basePath);
          if (result.success) {
            downloaded++;
            results.push({ fileName: file.name, status: "downloaded", filePath: result.filePath });
          } else {
            failed++;
            results.push({ fileName: file.name, status: "failed" });
          }
        }
      } catch (e) {
        console.error(`[Worker ${workerId}] Error:`, e);
      } finally {
        if (workerId !== 0) {
          await workerPage.close();
        }
      }
    };
    const workers = [];
    const numWorkers = Math.min(CONCURRENCY, Math.max(1, queue.length));
    for (let i = 0; i < numWorkers; i++) {
      workers.push(processQueue(i));
    }
    await Promise.all(workers);
    return { downloaded, skipped, failed, results };
  }
  sanitizeFileName(fileName) {
    return fileName.replace(/[<>:"/\\|?*]/g, "_");
  }
  sanitizeFolderName(folderName) {
    return folderName.replace(/[<>:"/\\|?*]/g, "_").substring(0, 100);
  }
  isPdf(buffer) {
    if (buffer.length < 4) return false;
    return buffer[0] === 37 && buffer[1] === 80 && buffer[2] === 68 && buffer[3] === 70;
  }
}
export {
  DownloadService
};
