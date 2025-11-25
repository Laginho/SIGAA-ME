"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
electron.contextBridge.exposeInMainWorld("api", {
  login: (credentials) => electron.ipcRenderer.invoke("login-request", credentials),
  tryAutoLogin: () => electron.ipcRenderer.invoke("try-auto-login"),
  getCourses: () => electron.ipcRenderer.invoke("get-courses"),
  getCourseFiles: (courseId, courseName) => electron.ipcRenderer.invoke("get-course-files", { courseId, courseName }),
  checkFilesExistence: (filePaths) => electron.ipcRenderer.invoke("check-files-existence", filePaths),
  selectDownloadFolder: () => electron.ipcRenderer.invoke("select-download-folder"),
  downloadFile: (data) => electron.ipcRenderer.invoke("download-file", data),
  downloadAllFiles: (data) => electron.ipcRenderer.invoke("download-all-files", data),
  onDownloadProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    electron.ipcRenderer.on("download-progress", subscription);
    return () => electron.ipcRenderer.off("download-progress", subscription);
  },
  getNewsDetail: (courseId, newsId) => electron.ipcRenderer.invoke("get-news-detail", { courseId, newsId })
});
