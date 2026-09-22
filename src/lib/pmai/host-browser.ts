import type { BrowserAdapter, BrowserCall, Observation, PublishResult, SemanticTarget } from "./browser.ts";
import { PmaiError } from "./errors.ts";
import { hostInvoke } from "./ipc.ts";
import { looksLikeMediaId } from "./media.ts";

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
      const err = new PmaiError((r.error?.code as never) || "NOT_READY", r.error?.message || "Chrome IPC lỗi");
      if (Array.isArray(r.error?.stages)) {
        Object.assign(err, { stages: r.error.stages });
      }
      throw err;
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
    const bad = files.find((f) => looksLikeMediaId(f));
    if (bad) {
      throw new PmaiError("NOT_READY", `Không upload id nội bộ ${bad}. Chọn lại ảnh từ máy.`);
    }
    await this.call("chrome.upload", { files });
  }
  async click(target: SemanticTarget) {
    this.calls.push({ method: "click", args: [target] });
    await this.call("chrome.click", { name: target.name });
  }
  async publish(opts?: { destinationType?: import("./types.ts").DestinationType; hasMedia?: boolean; hasVideo?: boolean }) {
    this.calls.push({ method: "publish", args: [opts ?? {}] });
    return this.call<PublishResult>("chrome.publish", opts ?? {});
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
