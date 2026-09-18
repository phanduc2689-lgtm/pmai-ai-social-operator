import { contextBridge, ipcRenderer } from "electron";

const ALLOWLIST = [
  "chrome.listProfiles",
  "chrome.status",
  "chrome.launch",
  "chrome.autoConnect",
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
] as const;

contextBridge.exposeInMainWorld("pmai", {
  invoke: (channel: string, payload?: unknown) => {
    if (!ALLOWLIST.includes(channel as (typeof ALLOWLIST)[number])) {
      return Promise.reject(new Error("IPC channel not allowlisted"));
    }
    return ipcRenderer.invoke(channel, payload);
  },
});
