import { FakeBrowserAdapter, hasComposerSideEffect, type BrowserAdapter } from "./browser.ts";
import { PmaiError } from "./errors.ts";
import { contentRevisionHash, newId, nowIso } from "./hash.ts";
import { createLlmClient, extractClaims, type LlmClient } from "./llm.ts";
import { assertPublishAllowed, evaluatePolicy } from "./policy.ts";
import { redact } from "./redact.ts";
import { parseTaskDsl, type LlmProvider } from "./schema.ts";
import type {
  Activity,
  Approval,
  BrandFacts,
  BrowserProfile,
  ContentItem,
  MediaAsset,
  PageTarget,
  Task,
  WorkspaceState,
} from "./types.ts";

const STORAGE_KEY = "pmai.store.v1";

export interface EngineDeps {
  llm?: LlmClient;
  browser?: BrowserAdapter;
  persist?: boolean;
}

export class PmaiEngine {
  private state: WorkspaceState;
  private llmKey: string | null = null;
  private llm: LlmClient;
  private browserFactory: () => BrowserAdapter;
  lastBrowser: BrowserAdapter | null = null;

  constructor(deps: EngineDeps = {}) {
    this.state = emptyWorkspace();
    this.llm = deps.llm ?? createLlmClient("mock", null, "mock-local");
    this.browserFactory =
      deps.browser != null
        ? () => deps.browser as BrowserAdapter
        : () =>
            new FakeBrowserAdapter({
              loggedIn: true,
              pageName: this.selectedPage()?.name,
              pageUrl: this.selectedPage()?.url,
            });
    if (deps.persist !== false) this.hydrate();
  }

  snapshot(): WorkspaceState {
    return structuredClone(this.state);
  }

  private persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
  }

  private hydrate() {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      this.state = { ...emptyWorkspace(), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  }

  resetDemo() {
    this.state = emptyWorkspace();
    this.llmKey = null;
    this.persist();
  }

  private log(action: string, result: string, detail: string, taskId: string | null = null) {
    const row: Activity = {
      id: newId("act"),
      at: nowIso(),
      taskId,
      action,
      result,
      detail: redact(detail),
    };
    this.state.activities.unshift(row);
    this.state.activities = this.state.activities.slice(0, 200);
  }

  private selectedPage(): PageTarget | null {
    return this.state.pages.find((p) => p.id === this.state.selectedPageId) ?? null;
  }

  lights() {
    return {
      profile: this.state.profile?.status ?? "DISCONNECTED",
      session: this.state.identity?.sessionStatus ?? "UNKNOWN",
      page: this.selectedPage()?.status ?? "UNSELECTED",
    };
  }

  canCreatePost(): { ok: boolean; reason: string } {
    const l = this.lights();
    if (l.profile !== "RUNNING") return { ok: false, reason: "Cần hồ sơ trình duyệt đang chạy." };
    if (l.session !== "CONNECTED") return { ok: false, reason: "Cần đăng nhập Facebook trên đúng hồ sơ." };
    if (l.page !== "VERIFIED") return { ok: false, reason: "Cần chọn và xác minh Trang đích." };
    if (!this.state.llm.hasKey && this.state.llm.provider !== "mock") {
      return { ok: false, reason: "Chưa kết nối AI. Mở Cài đặt hoặc dùng nhà cung cấp Demo." };
    }
    return { ok: true, reason: "" };
  }

  async createProfile(input: {
    name: string;
    mode: "ATTACH_EXISTING" | "MANAGED_PROFILE";
    chromeDirectory?: string;
    userDataDir?: string;
    facebookLikely?: boolean;
  }) {
    const profile: BrowserProfile = {
      id: newId("prf"),
      name: input.name.trim() || "Hồ sơ 1",
      mode: input.mode,
      status: "RUNNING",
      createdAt: nowIso(),
      chromeDirectory: input.chromeDirectory,
      userDataDir: input.userDataDir,
      facebookLikely: input.facebookLikely,
    };
    this.state.profile = profile;
    this.state.identity = {
      id: newId("idn"),
      profileId: profile.id,
      displayName: "Chưa đăng nhập",
      sessionStatus: "AUTH_REQUIRED",
    };
    this.state.firstRunStep = 2;
    this.log("profile.create", "OK", `${profile.mode} ${profile.name} ${profile.chromeDirectory ?? ""}`);
    this.persist();
    return profile;
  }

  markLoggedIn(displayName = "Operator FB", opts?: { seedDemo?: boolean }) {
    if (!this.state.identity || !this.state.profile) {
      throw new PmaiError("NOT_READY", "Chưa có hồ sơ trình duyệt.");
    }
    this.state.identity.sessionStatus = "CONNECTED";
    this.state.identity.displayName = displayName;
    this.state.profile.status = "RUNNING";
    if (opts?.seedDemo !== false && this.state.pages.length === 0) {
      this.state.pages = demoPages(this.state.identity.id);
    }
    this.state.firstRunStep = 3;
    this.log("session.connected", "OK", displayName);
    this.persist();
  }

  addPage(input: { name: string; url: string }) {
    if (!this.state.identity) throw new PmaiError("NOT_READY", "Chưa đăng nhập Facebook.");
    const name = input.name.trim();
    let url = input.url.trim();
    if (!name) throw new PmaiError("SCHEMA_INVALID", "Cần tên Trang.");
    if (!/^https:\/\/(www\.)?facebook\.com\/.+/i.test(url)) {
      throw new PmaiError("SCHEMA_INVALID", "URL phải bắt đầu bằng https://www.facebook.com/");
    }
    url = url.replace(/\/$/, "");
    const page: PageTarget = {
      id: newId("pg"),
      identityId: this.state.identity.id,
      name,
      url,
      status: "UNSELECTED",
    };
    this.state.pages.push(page);
    this.log("page.add", "OK", `${page.name} ${page.url}`);
    this.persist();
    return page;
  }

  selectPage(pageId: string) {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) throw new PmaiError("NOT_READY", "Không tìm thấy trang.");
    this.state.pages = this.state.pages.map((p) => ({
      ...p,
      status: p.id === pageId ? "VERIFIED" : p.status === "VERIFIED" ? "UNSELECTED" : p.status,
    }));
    this.state.selectedPageId = pageId;
    this.state.firstRunStep = 4;
    this.log("page.select", "OK", `${page.name} ${page.url}`);
    this.persist();
    return page;
  }

  setBrandFacts(facts: BrandFacts) {
    this.state.brandFacts = facts;
    this.log("brand.update", "OK", facts.pageName);
    this.persist();
  }

  setIdle(minutes: number, keepOpen: boolean) {
    this.state.idleCloseMinutes = minutes;
    this.state.keepBrowserOpen = keepOpen;
    this.persist();
  }

  setLlm(provider: LlmProvider, model: string, apiKey: string | null) {
    this.llmKey = apiKey && apiKey.length > 0 ? apiKey : null;
    this.state.llm = {
      provider,
      model: model || defaultModel(provider),
      keyMasked: this.llmKey ? `••••${this.llmKey.slice(-4)}` : "",
      hasKey: Boolean(this.llmKey) || provider === "mock",
      lastPing: null,
    };
    this.llm = createLlmClient(provider, this.llmKey, this.state.llm.model);
    this.log("llm.settings", "OK", `${provider} ${this.state.llm.model}`);
    this.persist();
  }

  clearLlmKey() {
    this.llmKey = null;
    this.state.llm.hasKey = this.state.llm.provider === "mock";
    this.state.llm.keyMasked = "";
    this.state.llm.lastPing = null;
    this.llm = createLlmClient(this.state.llm.provider, null, this.state.llm.model);
    this.log("llm.clearKey", "OK", "key removed");
    this.persist();
  }

  async testLlm() {
    const r = await this.llm.ping();
    this.state.llm.lastPing = r.ok ? nowIso() : null;
    this.log("llm.ping", r.ok ? "OK" : "FAIL", r.model);
    this.persist();
    return r;
  }

  async createDraft(brief: string) {
    const gate = this.canCreatePost();
    if (!gate.ok) throw new PmaiError("NOT_READY", gate.reason);
    const page = this.selectedPage();
    if (!page) throw new PmaiError("NOT_READY", "Chưa chọn trang.");
    const raw = await this.llm.completeJson<{ body: string; unverifiedClaims?: string[] }>({
      purpose: "content",
      schemaName: "DraftResult",
      system: "You write Facebook page posts in Vietnamese. Do not invent prices.",
      user: `Brand: ${JSON.stringify(this.state.brandFacts)}\nBrief: ${brief}`,
    });
    const body = raw.body?.trim() ? raw.body : `Bản nháp cho: ${brief}`;
    const factsClaims = extractClaims(body, {
      hotline: this.state.brandFacts.hotline,
      priceNote: this.state.brandFacts.priceNote,
    });
    const media: MediaAsset[] = [];
    const revisionHash = await contentRevisionHash({ body, mediaChecksums: [], pageTargetId: page.id });
    const content: ContentItem = {
      id: newId("cnt"),
      pageTargetId: page.id,
      body,
      brief,
      media,
      status: "DRAFT",
      revisionHash,
      unverifiedClaims: [...new Set([...(raw.unverifiedClaims ?? []), ...factsClaims])],
      aiGenerated: true,
      humanModified: false,
    };
    this.state.contents.unshift(content);
    this.log("content.draft", "OK", content.id);
    this.persist();
    return content;
  }

  async updateDraft(contentId: string, body: string, media: MediaAsset[] = []) {
    const c = this.requireContent(contentId);
    c.body = body;
    c.media = media;
    c.humanModified = true;
    c.status = "DRAFT";
    c.revisionHash = await contentRevisionHash({
      body,
      mediaChecksums: media.map((m) => m.checksum),
      pageTargetId: c.pageTargetId,
    });
    c.unverifiedClaims = extractClaims(body, {
      hotline: this.state.brandFacts.hotline,
      priceNote: this.state.brandFacts.priceNote,
    });
    const linked = this.state.approvals.filter((a) => a.contentId === contentId && a.status === "APPROVED");
    for (const a of linked) {
      a.status = "STALE";
      const t = this.state.tasks.find((x) => x.id === a.taskId);
      if (t && t.status === "WAITING_APPROVAL") t.status = "STALE_APPROVAL";
    }
    this.log("content.edit", "OK", contentId);
    this.persist();
    return c;
  }

  addLocalImage(contentId: string, file: { name: string; size: number; mimeType: string }) {
    if (!file.mimeType.startsWith("image/")) {
      throw new PmaiError("SCHEMA_INVALID", "MVP1 chỉ nhận ảnh local.");
    }
    const c = this.requireContent(contentId);
    const asset: MediaAsset = {
      id: newId("med"),
      type: "image",
      name: file.name,
      checksum: `${file.size}-${file.name}`,
      mimeType: file.mimeType,
      size: file.size,
    };
    c.media = [...c.media, asset];
    c.humanModified = true;
    return this.updateDraft(contentId, c.body, c.media);
  }

  async submitForApproval(contentId: string) {
    const c = this.requireContent(contentId);
    const page = this.state.pages.find((p) => p.id === c.pageTargetId);
    if (!page || page.status !== "VERIFIED") {
      throw new PmaiError("NOT_READY", "Trang đích chưa xác minh.");
    }
    const policy = evaluatePolicy("PUBLISH_CONTENT");
    if (policy.decision === "DENY") throw new PmaiError("POLICY_REJECTED", "Policy từ chối.");
    const existing = this.state.tasks.find(
      (t) =>
        t.contentId === contentId &&
        (t.status === "RUNNING" || t.status === "NEEDS_VERIFICATION" || t.status === "WAITING_APPROVAL"),
    );
    if (existing) throw new PmaiError("IDEMPOTENT_REJECT", "Task cùng nội dung đang chờ hoặc chạy.");
    const dsl = parseTaskDsl({
      dslVersion: "2.1",
      type: "PUBLISH_CONTENT",
      accountId: this.state.identity?.id ?? "none",
      pageTargetId: c.pageTargetId,
      payload: { contentId: c.id, revisionHash: c.revisionHash, text: c.body, mediaIds: c.media.map((m) => m.id) },
      approval: { required: true },
    });
    const task: Task = {
      id: newId("tsk"),
      type: dsl.type,
      contentId: c.id,
      pageTargetId: c.pageTargetId,
      status: "WAITING_APPROVAL",
      errorCode: null,
      permalink: null,
      createdAt: nowIso(),
    };
    const approval: Approval = {
      id: newId("apr"),
      taskId: task.id,
      contentId: c.id,
      pageTargetId: c.pageTargetId,
      contentRevisionHash: c.revisionHash,
      status: "PENDING",
      createdAt: nowIso(),
      decidedAt: null,
    };
    c.status = "IN_REVIEW";
    this.state.tasks.unshift(task);
    this.state.approvals.unshift(approval);
    this.log("approval.request", "WAIT", task.id, task.id);
    this.persist();
    return { task, approval };
  }

  decideApproval(approvalId: string, decision: "APPROVE" | "REJECT" | "CANCEL") {
    const a = this.state.approvals.find((x) => x.id === approvalId);
    if (!a) throw new PmaiError("NOT_READY", "Không có yêu cầu duyệt.");
    const t = this.state.tasks.find((x) => x.id === a.taskId);
    const c = this.requireContent(a.contentId);
    if (decision === "REJECT") {
      a.status = "REJECTED";
      a.decidedAt = nowIso();
      if (t) t.status = "REJECTED";
      c.status = "DRAFT";
      this.log("approval.reject", "REJECTED", a.id, a.taskId);
      this.persist();
      return a;
    }
    if (decision === "CANCEL") {
      a.status = "REJECTED";
      a.decidedAt = nowIso();
      if (t) t.status = "CANCELLED";
      this.log("approval.cancel", "CANCELLED", a.id, a.taskId);
      this.persist();
      return a;
    }
    if (c.revisionHash !== a.contentRevisionHash) {
      a.status = "STALE";
      if (t) t.status = "STALE_APPROVAL";
      throw new PmaiError("STALE_APPROVAL", "Nội dung đã đổi — cần duyệt lại.");
    }
    a.status = "APPROVED";
    a.decidedAt = nowIso();
    if (t) t.status = "QUEUED";
    c.status = "APPROVED_SNAPSHOT";
    this.log("approval.approve", "APPROVED", a.id, a.taskId);
    this.persist();
    return a;
  }

  async executeTask(taskId: string, browser?: BrowserAdapter) {
    const t = this.state.tasks.find((x) => x.id === taskId);
    if (!t) throw new PmaiError("NOT_READY", "Không có task.");
    const a = this.state.approvals.find((x) => x.taskId === taskId);
    const c = this.requireContent(t.contentId);
    const page = this.state.pages.find((p) => p.id === t.pageTargetId);
    if (!a || !page) throw new PmaiError("NOT_READY", "Thiếu approval hoặc trang.");
    assertPublishAllowed({
      approvalStatus: a.status,
      pageTargetId: t.pageTargetId,
      approvalPageTargetId: a.pageTargetId,
      revisionHash: c.revisionHash,
      approvalRevisionHash: a.contentRevisionHash,
    });
    const running = this.state.tasks.filter((x) => x.status === "RUNNING" && x.pageTargetId === t.pageTargetId);
    if (running.length) throw new PmaiError("IDLE_BLOCKED", "Account đang chạy một task.");
    const dup = this.state.tasks.find(
      (x) =>
        x.id !== t.id &&
        x.pageTargetId === t.pageTargetId &&
        x.contentId === t.contentId &&
        (x.status === "RUNNING" || x.status === "NEEDS_VERIFICATION"),
    );
    if (dup) throw new PmaiError("IDEMPOTENT_REJECT", "Không retry khi đang chạy hoặc cần kiểm tra kết quả.");
    t.status = "RUNNING";
    this.log("task.start", "RUNNING", t.id, t.id);
    this.persist();
    const adapter = browser ?? this.browserFactory();
    this.lastBrowser = adapter;
    try {
      if (this.state.identity?.sessionStatus !== "CONNECTED") {
        throw new PmaiError("AUTH_LOGOUT", "Phiên Facebook không CONNECTED.");
      }
      await adapter.launchProfile(this.state.profile?.id ?? "none");
      const obs0 = await adapter.observe();
      if (obs0.pageState === "captcha") throw new PmaiError("CAPTCHA_REQUIRED", "CAPTCHA — mở đúng hồ sơ.");
      if (obs0.pageState === "checkpoint") throw new PmaiError("CHECKPOINT", "Checkpoint — xử lý tay.");
      if (obs0.pageState === "login") throw new PmaiError("AUTH_LOGOUT", "Đã đăng xuất.");
      await adapter.goto(page.url);
      const obs1 = await adapter.observe();
      if (obs1.pageState === "login") throw new PmaiError("AUTH_LOGOUT", "Đã đăng xuất.");
      if (obs1.pageName && !namesLooselyMatch(obs1.pageName, page.name)) {
        throw new PmaiError("ACCOUNT_MISMATCH", "Sai Trang đích.");
      }
      if (this.selectedPage()?.url !== page.url) {
        throw new PmaiError("ACCOUNT_MISMATCH", "Sai URL trang.");
      }
      await adapter.click({ name: "composer" });
      await adapter.type({ role: "textbox", name: "composer" }, c.body);
      if (c.media.length) await adapter.upload(c.media.map((m) => m.name));
      const preview = await adapter.observe();
      if (adapter instanceof FakeBrowserAdapter && !adapter.previewValid({ body: c.body, pageUrl: page.url })) {
        throw new PmaiError("PREVIEW_MISMATCH", "Preview không khớp bản đã duyệt.");
      }
      if (preview.pageName && !namesLooselyMatch(preview.pageName, page.name)) {
        throw new PmaiError("PREVIEW_MISMATCH", "Preview sai trang.");
      }
      try {
        await adapter.click({ name: "Đăng" });
      } catch (e) {
        t.status = "NEEDS_VERIFICATION";
        t.errorCode = "NEEDS_VERIFICATION";
        a.status = "CONSUMED";
        this.log("task.needs_verification", "NEEDS_VERIFICATION", String(e), t.id);
        this.persist();
        return t;
      }
      const permalink = `${page.url.replace(/\/$/, "")}/posts/${t.id.slice(-8)}`;
      await adapter.screenshot();
      t.status = "SUCCESS";
      t.permalink = permalink;
      t.errorCode = null;
      a.status = "CONSUMED";
      c.status = "PUBLISHED";
      this.log("task.success", "SUCCESS", permalink, t.id);
      this.persist();
      return t;
    } catch (e) {
      if (e instanceof PmaiError && e.code === "NEEDS_VERIFICATION") {
        t.status = "NEEDS_VERIFICATION";
        t.errorCode = e.code;
        a.status = "CONSUMED";
      } else if (e instanceof PmaiError) {
        t.status = "FAILED";
        t.errorCode = e.code;
      } else {
        t.status = "FAILED";
        t.errorCode = "BROWSER_CRASH";
      }
      this.log("task.fail", t.status, e instanceof Error ? e.message : "fail", t.id);
      this.persist();
      throw e;
    }
  }

  confirmVerification(taskId: string, found: boolean) {
    const t = this.state.tasks.find((x) => x.id === taskId);
    if (!t || t.status !== "NEEDS_VERIFICATION") {
      throw new PmaiError("NOT_READY", "Task không ở trạng thái cần kiểm tra kết quả.");
    }
    const c = this.requireContent(t.contentId);
    if (found) {
      t.status = "SUCCESS";
      t.permalink = t.permalink ?? "human-confirmed";
      c.status = "PUBLISHED";
      this.log("task.human_confirm", "SUCCESS", "Đã thấy bài", t.id);
    } else {
      t.status = "FAILED";
      t.errorCode = "PUBLISH_UNCONFIRMED";
      this.log("task.human_confirm", "FAILED", "Không thấy bài — không auto retry", t.id);
    }
    this.persist();
    return t;
  }

  cloneContent(contentId: string) {
    const c = this.requireContent(contentId);
    const n: ContentItem = { ...c, id: newId("cnt"), status: "DRAFT", humanModified: true };
    this.state.contents.unshift(n);
    this.log("content.clone", "OK", n.id);
    this.persist();
    return n;
  }

  private requireContent(id: string): ContentItem {
    const c = this.state.contents.find((x) => x.id === id);
    if (!c) throw new PmaiError("NOT_READY", "Không có bản nháp.");
    return c;
  }
}

export function namesLooselyMatch(observed: string, expected: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s*\|\s*facebook.*$/i, "").replace(/\s+/g, " ").trim();
  const a = norm(observed);
  const b = norm(expected);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function defaultModel(p: LlmProvider): string {
  switch (p) {
    case "openai":
      return "gpt-4.1-mini";
    case "gemini":
      return "gemini-2.0-flash";
    case "anthropic":
      return "claude-sonnet-4";
    case "xai":
      return "grok-3";
    default:
      return "mock-local";
  }
}

function demoPages(identityId: string): PageTarget[] {
  return [
    {
      id: newId("pg"),
      identityId,
      name: "PM Travel Hà Giang",
      url: "https://www.facebook.com/pmtravelhagiang",
      status: "UNSELECTED",
    },
    {
      id: newId("pg"),
      identityId,
      name: "PM Travel Hàn Quốc",
      url: "https://www.facebook.com/pmtravelkorea",
      status: "UNSELECTED",
    },
  ];
}

function emptyWorkspace(): WorkspaceState {
  return {
    id: "ws_local",
    name: "Workspace của tôi",
    operatorName: "Operator",
    brandFacts: { hotline: "", pageName: "", priceNote: "", policyNote: "" },
    idleCloseMinutes: 15,
    keepBrowserOpen: false,
    llm: { provider: "mock", model: "mock-local", keyMasked: "", hasKey: true, lastPing: null },
    profile: null,
    identity: null,
    pages: [],
    selectedPageId: null,
    contents: [],
    tasks: [],
    approvals: [],
    activities: [],
    firstRunStep: 1,
  };
}

export function createEngine(deps?: EngineDeps) {
  return new PmaiEngine(deps);
}
