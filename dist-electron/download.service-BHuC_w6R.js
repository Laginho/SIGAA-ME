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
        const popupPromise = page.waitForEvent("popup", { timeout: 6e4 });
        const downloadPromise = page.waitForEvent("download", { timeout: 6e4 });
        await link.click({ force: true });
        const result = await Promise.race([
          downloadPromise.then((d) => ({ type: "download", data: d })),
          popupPromise.then((p) => ({ type: "popup", data: p })),
          new Promise((resolve) => setTimeout(() => resolve({ type: "timeout" }), 65e3))
        ]);
        if (result.type === "download") {
          const download = result.data;
          await download.saveAs(filePath);
          console.log(`Downloaded: ${filePath}`);
          return { success: true, filePath };
        } else if (result.type === "popup") {
          const popup = result.data;
          console.log(`Popup opened: ${popup.url()}`);
          let pdfResponse = null;
          const popupResponseHandler = async (response) => {
            const url = response.url();
            const contentType = response.headers()["content-type"] || "";
            const status = response.status();
            console.log(`Popup response: ${url} (${status}) [${contentType}]`);
            if (contentType.includes("application/pdf") || contentType.includes("application/octet-stream") || contentType.includes("application/zip")) {
              try {
                const buffer = await response.body();
                console.log(`Potential PDF response, size: ${buffer.length} bytes`);
                if (contentType.includes("application/pdf") && buffer.length > 0) {
                  if (this.isPdf(buffer)) {
                    console.log(`✓ Valid PDF found!`);
                    pdfResponse = response;
                  } else {
                    console.log(`✗ Not a PDF (HTML wrapper or other)`);
                  }
                } else if (buffer.length > 0) {
                  pdfResponse = response;
                }
              } catch (e) {
                console.log(`Error reading response body: ${e}`);
              }
            }
          };
          popup.on("response", popupResponseHandler);
          try {
            console.log("Waiting for popup to load...");
            await popup.waitForLoadState("networkidle", { timeout: 3e4 });
            console.log("Popup loaded.");
            await new Promise((resolve) => setTimeout(resolve, 3e3));
            if (pdfResponse) {
              console.log("Found PDF response, saving...");
              const buffer = await pdfResponse.body();
              let finalPath = filePath;
              const contentType = pdfResponse.headers()["content-type"];
              if (contentType && contentType.includes("application/pdf") && !finalPath.toLowerCase().endsWith(".pdf")) {
                finalPath += ".pdf";
                console.log(`Appended .pdf extension: ${finalPath}`);
              }
              fs.writeFileSync(finalPath, buffer);
              console.log(`✓ Saved: ${finalPath} (${buffer.length} bytes)`);
              await popup.close();
              return { success: true, filePath: finalPath };
            } else {
              console.log("No PDF response captured. Trying to extract from embed...");
              const embedSrc = await popup.evaluate(() => {
                const embed = document.querySelector('embed[type="application/pdf"]');
                return embed ? embed.src : null;
              });
              console.log(`Embed src: ${embedSrc}`);
              if (embedSrc && embedSrc !== "about:blank" && !embedSrc.startsWith("blob:")) {
                console.log(`Fetching PDF from embed URL: ${embedSrc}`);
                const context = popup.context();
                const response = await context.request.get(embedSrc);
                const buffer = await response.body();
                let finalPath = filePath;
                if (!finalPath.toLowerCase().endsWith(".pdf")) {
                  finalPath += ".pdf";
                }
                fs.writeFileSync(finalPath, buffer);
                console.log(`✓ Saved from embed: ${finalPath}`);
                await popup.close();
                return { success: true, filePath: finalPath };
              }
              await popup.close();
              return { success: false, error: "Could not capture PDF from popup" };
            }
          } finally {
            popup.off("response", popupResponseHandler);
          }
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
