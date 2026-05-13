const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nerApi", {
  detectEntities: (text) => ipcRenderer.invoke("ner:detect", text),
});
