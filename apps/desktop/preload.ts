import { contextBridge, ipcRenderer } from "electron";

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
  "chrome.publish",
  "chrome.screenshot",
  "chrome.close",
  "chrome.pickImages",
  "chrome.saveMedia",
  "chrome.resolveMedia",
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
