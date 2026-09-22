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

  private payload(extra?: Record<string, unknown>) {
    const profileId = this.directory || undefined;
    return { ...extra, profileId, directory: profileId };
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
    await this.call("chrome.launch", this.payload({ reuse: true, directory: this.directory || id }));
  }
  async observe() {
    this.calls.push({ method: "observe", args: [] });
    return this.call<Observation>("chrome.observe", this.payload());
  }
  async goto(url: string) {
    this.calls.push({ method: "goto", args: [url] });
    await this.call("chrome.goto", this.payload({ url }));
  }
  async type(target: SemanticTarget, text: string) {
    this.calls.push({ method: "type", args: [target, text] });
    await this.call("chrome.type", this.payload({ name: target.name, text }));
  }
  async upload(files: string[]) {
    this.calls.push({ method: "upload", args: [files] });
    const bad = files.find((f) => looksLikeMediaId(f));
    if (bad) {
      throw new PmaiError("NOT_READY", `Không upload id nội bộ ${bad}. Chọn lại ảnh từ máy.`);
    }
    await this.call("chrome.upload", this.payload({ files }));
  }
  async click(target: SemanticTarget) {
    this.calls.push({ method: "click", args: [target] });
    await this.call("chrome.click", this.payload({ name: target.name }));
  }
  async publish(opts?: { destinationType?: import("./types.ts").DestinationType; hasMedia?: boolean; hasVideo?: boolean }) {
    this.calls.push({ method: "publish", args: [opts ?? {}] });
    return this.call<PublishResult>("chrome.publish", this.payload({ ...(opts ?? {}) }));
  }
  async screenshot() {
    this.calls.push({ method: "screenshot", args: [] });
    return this.call<string>("chrome.screenshot", this.payload());
  }
  async scrapeGroup(input: { url: string; maxScrolls?: number; maxPosts?: number }) {
    this.calls.push({ method: "scrapeGroup", args: [input] });
    return this.call<{ author?: string; text: string; permalink?: string | null }[]>("chrome.scrapeGroup", this.payload(input));
  }
  async commentOnPost(input: { snippet: string; text: string; submit: boolean; permalink?: string | null }) {
    this.calls.push({ method: "commentOnPost", args: [input] });
    return this.call<{ ok: boolean; typed: boolean; submitted: boolean }>("chrome.commentPost", this.payload(input));
  }
  async close() {
    this.calls.push({ method: "close", args: [] });
    await this.call("chrome.close", this.payload());
  }
}
