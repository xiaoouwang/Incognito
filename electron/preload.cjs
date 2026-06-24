const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appMeta", {
  isElectron: true,
  platform: process.platform,
});

contextBridge.exposeInMainWorld("nerApi", {
  detectEntities: (text, backend) => ipcRenderer.invoke("ner:detect", text, backend),
  exportLabelStudio: (payload) => ipcRenderer.invoke("export:labelStudio", payload),
  batchAnonymizeLabelStudio: () => ipcRenderer.invoke("batch:anonymizeLabelStudio"),
  batchProcessTextFolder: (options) => ipcRenderer.invoke("batch:processTextFolder", options),
  loadTextFolder: () => ipcRenderer.invoke("batch:loadTextFolder"),
  writeBatchOutputs: (payload) => ipcRenderer.invoke("batch:writeOutputs", payload),
});
