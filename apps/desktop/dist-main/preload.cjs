"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const ALLOWLIST = [
  "chrome.listProfiles",
  "chrome.status",
  "chrome.launch",
  "chrome.autoConnect",
  "chrome.createProfile",
  "chrome.cloneProfile",
  "chrome.observe",
  "chrome.goto",
  "chrome.type",
  "chrome.upload",
  "chrome.click",
  "chrome.screenshot",
  "chrome.close",
  "workspace.get",
  "profile.create",
  "session.markLoggedIn",
  "page.select",
  "content.createDraft",
  "content.update",
  "approval.submit",
  "approval.decide",
  "task.execute",
  "task.verifyNeeds",
  "llm.test",
  "settings.set",
  "activity.list",
];

contextBridge.exposeInMainWorld("pmai", {
  invoke: (channel, payload) => {
    if (!ALLOWLIST.includes(channel)) {
      return Promise.reject(new Error("IPC channel not allowlisted"));
    }
    return ipcRenderer.invoke(channel, payload);
  },
});
