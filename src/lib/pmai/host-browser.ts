import type { BrowserAdapter, BrowserCall, Observation, SemanticTarget } from "./browser.ts";
import { PmaiError } from "./errors.ts";
import { hostInvoke } from "./ipc.ts";

export class HostBrowserAdapter implements BrowserAdapter {
  readonly kind = "electron-chrome";
  calls: BrowserCall[] = [];
  constructor(private directory = "Default") {}

  capabilities() {
    return { canAttach: true, canPersistent: true, canUpload: true, canScreenshot: true };
  }

  private async call<T>(channel: string, payload?: unknown): Promise<T> {
    const r = await hostInvoke<T>(channel, payload);
    if (!r.ok) {
      throw new PmaiError((r.error?.code as never) || "NOT_READY", r.error?.message || "Chrome IPC lỗi");
    }
    return r.data as T;
  }

  async launchProfile(id: string) {
    this.calls.push({ method: "launchProfile", args: [id] });
    await this.call("chrome.launch", { directory: this.directory || id, reuse: true });
  }
  async observe() {
    this.calls.push({ method: "observe", args: [] });
    return this.call<Observation>("chrome.observe");
  }
  async goto(url: string) {
    this.calls.push({ method: "goto", args: [url] });
    await this.call("chrome.goto", { url });
  }
  async type(target: SemanticTarget, text: string) {
    this.calls.push({ method: "type", args: [target, text] });
    await this.call("chrome.type", { name: target.name, text });
  }
  async upload(files: string[]) {
    this.calls.push({ method: "upload", args: [files] });
    await this.call("chrome.upload", { files });
  }
  async click(target: SemanticTarget) {
    this.calls.push({ method: "click", args: [target] });
    await this.call("chrome.click", { name: target.name });
  }
  async screenshot() {
    this.calls.push({ method: "screenshot", args: [] });
    return this.call<string>("chrome.screenshot");
  }
  async close() {
    this.calls.push({ method: "close", args: [] });
    await this.call("chrome.close");
  }
}
