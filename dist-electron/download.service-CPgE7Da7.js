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
              console.log("Forcing Content-Type to application/octet-stream");
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
          await download.saveAs(filePath);
          console.log(`Downloaded: ${filePath}`);
          return { success: true, filePath };
        } else if (result.type === "popup") {
          const popup = result.data;
          console.log(`Popup opened: ${popup.url()}`);
          try {
            const popupDownload = await popup.waitForEvent("download", { timeout: 5e3 });
            await popupDownload.saveAs(filePath);
            console.log(`Downloaded from popup: ${filePath}`);
            await popup.close();
            return { success: true, filePath };
          } catch (e) {
            console.log("No download event in popup yet...");
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
            await popup.reload();
            const download = await reloadDownloadPromise;
            await download.saveAs(filePath);
            console.log(`Downloaded after popup reload: ${filePath}`);
            await popup.close();
            return { success: true, filePath };
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
            await download.saveAs(filePath);
            return { success: true, filePath };
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
  async downloadCourseFiles(page, courseId, courseName, files, basePath, downloadedFiles) {
    const results = [];
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    for (const file of files) {
      const courseDownloads = downloadedFiles[courseId] || {};
      if (courseDownloads[file.name]) {
        const existingPath = courseDownloads[file.name].path;
        if (fs.existsSync(existingPath)) {
          console.log(`Skipping duplicate: ${file.name}`);
          skipped++;
          results.push({ fileName: file.name, status: "skipped", filePath: existingPath });
          continue;
        }
        if (fs.existsSync(existingPath + ".pdf")) {
          console.log(`Skipping duplicate: ${file.name}.pdf`);
          skipped++;
          results.push({ fileName: file.name, status: "skipped", filePath: existingPath + ".pdf" });
          continue;
        }
      }
      const result = await this.downloadFile(page, file.url, file.name, courseName, basePath);
      if (result.success) {
        downloaded++;
        results.push({ fileName: file.name, status: "downloaded", filePath: result.filePath });
      } else {
        failed++;
        results.push({ fileName: file.name, status: "failed" });
      }
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
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
