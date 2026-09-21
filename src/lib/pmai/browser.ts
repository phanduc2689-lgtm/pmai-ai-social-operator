import type { DestinationType } from "./types.ts";

export type SemanticTarget = { role?: string; name: string };

export interface Observation {
  url: string;
  title: string;
  pageState: "login" | "feed" | "page" | "composer" | "captcha" | "checkpoint" | "unknown";
  pageName: string | null;
}

export interface BrowserCall {
  method: string;
  args: unknown[];
}

export interface PublishStage {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface PublishResult {
  ok: boolean;
  stage: string;
  stages?: PublishStage[];
  permalink?: string | null;
}

export interface BrowserAdapter {
  readonly kind: string;
  capabilities(): {
    canAttach: boolean;
    canPersistent: boolean;
    canUpload: boolean;
    canScreenshot: boolean;
  };
  launchProfile(id: string): Promise<void>;
  observe(): Promise<Observation>;
  goto(url: string): Promise<void>;
  type(target: SemanticTarget, text: string): Promise<void>;
  upload(files: string[]): Promise<void>;
  click(target: SemanticTarget): Promise<void>;
  publish(opts?: { destinationType?: DestinationType; hasMedia?: boolean }): Promise<PublishResult>;
  screenshot(): Promise<string>;
  close(): Promise<void>;
  calls: BrowserCall[];
}

export interface FakeBrowserOptions {
  loggedIn?: boolean;
  pageName?: string;
  pageUrl?: string;
  crashAfterClickPublish?: boolean;
  captcha?: boolean;
  mismatchPage?: boolean;
}

export class FakeBrowserAdapter implements BrowserAdapter {
  readonly kind = "fake";
  calls: BrowserCall[] = [];
  private opts: FakeBrowserOptions;
  private url = "about:blank";
  private composerOpen = false;
  private typed = "";
  private uploaded: string[] = [];

  constructor(opts: FakeBrowserOptions = {}) {
    this.opts = { loggedIn: true, ...opts };
  }

  capabilities() {
    return { canAttach: true, canPersistent: true, canUpload: true, canScreenshot: true };
  }

  async launchProfile(id: string) {
    this.calls.push({ method: "launchProfile", args: [id] });
  }

  async observe(): Promise<Observation> {
    this.calls.push({ method: "observe", args: [] });
    if (this.opts.captcha) {
      return { url: this.url, title: "Security check", pageState: "captcha", pageName: null };
    }
    if (!this.opts.loggedIn) {
      return { url: "https://www.facebook.com/login", title: "Log in", pageState: "login", pageName: null };
    }
    const name = this.opts.mismatchPage ? "Wrong Page" : (this.opts.pageName ?? "Demo Page");
    return {
      url: this.url,
      title: name,
      pageState: this.composerOpen ? "composer" : "page",
      pageName: name,
    };
  }

  async goto(url: string) {
    this.calls.push({ method: "goto", args: [url] });
    this.url = this.opts.mismatchPage ? "https://www.facebook.com/wrongpage" : url;
  }

  async type(target: SemanticTarget, text: string) {
    this.calls.push({ method: "type", args: [target, text] });
    this.typed = text;
    this.composerOpen = true;
  }

  async upload(files: string[]) {
    this.calls.push({ method: "upload", args: [files] });
    this.uploaded = files;
  }

  async click(target: SemanticTarget) {
    this.calls.push({ method: "click", args: [target] });
    if (/composer|tạo bài|create/i.test(target.name)) this.composerOpen = true;
    if (/đăng|publish|post/i.test(target.name) && this.opts.crashAfterClickPublish) {
      throw Object.assign(new Error("disconnected"), { code: "BROWSER_CRASH" });
    }
  }

  async publish(opts?: { destinationType?: DestinationType; hasMedia?: boolean }): Promise<PublishResult> {
    this.calls.push({ method: "publish", args: [opts ?? {}] });
    if (this.opts.crashAfterClickPublish) {
      throw Object.assign(new Error("disconnected"), { code: "BROWSER_CRASH" });
    }
    this.composerOpen = false;
    return {
      ok: true,
      stage: "PUBLISHED",
      stages: [
        { name: "CONTENT_READY", ok: true },
        { name: "POST_SETTINGS_OPEN", ok: true },
        { name: "PUBLISH_BUTTON_FOUND", ok: true },
        { name: "PUBLISH_CLICKED", ok: true },
        { name: "PUBLISH_SUCCESS", ok: true },
      ],
    };
  }

  async screenshot() {
    this.calls.push({ method: "screenshot", args: [] });
    return "data:image/png;base64,fake";
  }

  async close() {
    this.calls.push({ method: "close", args: [] });
  }

  previewValid(expected: { body: string; pageUrl: string }): boolean {
    return this.typed === expected.body && this.url === expected.pageUrl;
  }

  getTyped() {
    return this.typed;
  }
}

export function hasComposerSideEffect(calls: BrowserCall[]): boolean {
  return calls.some(
    (c) =>
      c.method === "type" ||
      c.method === "upload" ||
      c.method === "publish" ||
      (c.method === "click" && /đăng|publish/i.test(JSON.stringify(c.args))),
  );
}
