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
      if (page.url() === "about:blank") {
        throw new Error("Page lost context (about:blank)");
      }
      console.log(`Looking for file link with text: "${fileName}"`);
      const link = page.locator(`a:has-text("${fileName}")`).first();
      if (await link.isVisible()) {
        console.log(`Found link for ${fileName}, clicking...`);
        let pdfResponse = null;
        const responseHandler = async (response) => {
          try {
            const contentType = response.headers()["content-type"];
            if (contentType && (contentType.includes("application/pdf") || contentType.includes("application/octet-stream") || contentType.includes("application/zip"))) {
              console.log(`Captured PDF response: ${response.url()} (${contentType})`);
              pdfResponse = response;
            }
          } catch (e) {
          }
        };
        page.context().on("response", responseHandler);
        const downloadPromise = page.waitForEvent("download", { timeout: 6e4 });
        const popupPromise = page.waitForEvent("popup", { timeout: 6e4 });
        await link.click({ force: true });
        const result = await Promise.race([
          downloadPromise.then((d) => ({ type: "download", data: d })),
          popupPromise.then((p) => ({ type: "popup", data: p })),
          new Promise((resolve) => setTimeout(() => resolve({ type: "timeout" }), 65e3))
        ]);
        page.context().off("response", responseHandler);
        if (result.type === "download") {
          const download = result.data;
          await download.saveAs(filePath);
          console.log(`Downloaded: ${filePath}`);
          return { success: true, filePath };
        } else if (result.type === "popup") {
          const popup = result.data;
          if (pdfResponse) {
            console.log("Using captured PDF response from context...");
            const buffer = await pdfResponse.body();
            fs.writeFileSync(filePath, buffer);
            await popup.close();
            console.log(`Saved popup content to: ${filePath}`);
            return { success: true, filePath };
          }
          console.log("Popup opened but no PDF response yet. Waiting...");
          try {
            const response = await popup.waitForResponse((response2) => {
              const contentType = response2.headers()["content-type"];
              return contentType && (contentType.includes("application/pdf") || contentType.includes("application/octet-stream"));
            }, { timeout: 1e4 });
            const buffer = await response.body();
            fs.writeFileSync(filePath, buffer);
            await popup.close();
            console.log(`Saved popup content to: ${filePath}`);
            return { success: true, filePath };
          } catch (e) {
            console.log("No PDF response found in popup.");
          }
          const popupUrl = popup.url();
          console.log(`Popup URL: ${popupUrl}`);
          if (popupUrl.endsWith(".pdf") || popupUrl.includes("visualizar")) {
            const context = page.context();
            const response = await context.request.get(popupUrl);
            const buffer = await response.body();
            fs.writeFileSync(filePath, buffer);
            await popup.close();
            return { success: true, filePath };
          }
          await popup.close();
          return { success: false, error: `Could not capture file from popup. URL: ${popupUrl}` };
        } else {
          throw new Error("Timeout waiting for download or popup");
        }
      } else {
        console.log("Link not found by text, trying URL match...");
        if (fileUrl.includes("javascript:")) {
          const onclickPart = fileUrl.replace("javascript:", "");
          const element = await page.$(`a[onclick*="${onclickPart}"]`);
          if (element) {
            const downloadPromise = page.waitForEvent("download", { timeout: 3e4 });
            await element.click();
            const download = await downloadPromise;
            await download.saveAs(filePath);
            return { success: true, filePath };
          } else {
            throw new Error(`Could not find link for file: ${fileName}`);
          }
        } else {
          await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 3e4 });
          return { success: true, filePath };
        }
      }
    } catch (error) {
      console.error(`Download failed for ${fileName}:`, error);
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
}
export {
  DownloadService
};
