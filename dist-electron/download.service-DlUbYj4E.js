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
      const downloadPromise = page.waitForEvent("download", { timeout: 6e4 });
      console.log(`Looking for file link with text: "${fileName}"`);
      const link = page.getByText(fileName, { exact: false }).first();
      if (await link.isVisible()) {
        console.log(`Found link for ${fileName}, clicking...`);
        await link.click();
      } else {
        console.log("Link not found by text, trying URL match...");
        if (fileUrl.includes("javascript:")) {
          const onclickPart = fileUrl.replace("javascript:", "");
          const element = await page.$(`a[onclick*="${onclickPart}"]`);
          if (element) {
            await element.click();
          } else {
            throw new Error(`Could not find link for file: ${fileName}`);
          }
        } else {
          await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 3e4 });
        }
      }
      console.log(`Waiting for download of ${fileName}...`);
      const download = await downloadPromise;
      await download.saveAs(filePath);
      console.log(`Downloaded: ${filePath}`);
      return { success: true, filePath };
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
