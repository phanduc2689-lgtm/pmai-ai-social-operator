import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeBrowserAdapter, hasComposerSideEffect } from "./browser.ts";
import { PmaiEngine, namesLooselyMatch, sanitizeComposerBody, urlsLooselyMatch } from "./engine.ts";
import { PmaiError } from "./errors.ts";
import { contentRevisionHash } from "./hash.ts";
import { looksLikeMediaId, resolveMediaSource, uploadPaths } from "./media.ts";
import { evaluatePolicy } from "./policy.ts";
import { containsSecret, maskKey, redact } from "./redact.ts";
import { parseTaskDsl } from "./schema.ts";

function primed(): PmaiEngine {
  const e = new PmaiEngine({ persist: false, llm: undefined });
  e.setLlm("mock", "mock-local", null);
  return e;
}

async function readyEngine(): Promise<PmaiEngine> {
  const e = primed();
  await e.createProfile({ name: "P1", mode: "MANAGED_PROFILE" });
  e.markLoggedIn("PM Travel");
  const snap = e.snapshot();
  e.selectPage(snap.pages[0].id);
  return e;
}

describe("policy", () => {
  it("publish waits for approval", () => {
    assert.equal(evaluatePolicy("PUBLISH_CONTENT").decision, "WAIT_APPROVAL");
    assert.equal(evaluatePolicy("SAVE_LOCAL_DRAFT").decision, "ALLOW");
    assert.equal(evaluatePolicy("mass_friend_request").decision, "DENY");
  });
});

describe("schema", () => {
  it("rejects playwright-shaped payloads by requiring dsl types", () => {
    assert.throws(() => parseTaskDsl({ type: "page.click", dslVersion: "2.1" }));
  });
});

describe("redaction", () => {
  it("masks keys and flags secrets", () => {
    assert.equal(maskKey("sk-abcdefghijklmnop"), "••••mnop");
    assert.equal(containsSecret("header sk-abcdefghijklmnop"), true);
    assert.match(redact("Authorization: Bearer abc.def"), /••••|Bearer/);
  });
});

describe("revision hash", () => {
  it("changes when body changes", async () => {
    const a = await contentRevisionHash({ body: "a", mediaChecksums: [], pageTargetId: "p1" });
    const b = await contentRevisionHash({ body: "b", mediaChecksums: [], pageTargetId: "p1" });
    assert.notEqual(a, b);
  });
});

describe("invariants", () => {
  it("does not open composer before approval", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour Hà Giang 2 ngày");
    const browser = new FakeBrowserAdapter({
      pageName: e.snapshot().pages[0].name,
      pageUrl: e.snapshot().pages[0].url,
    });
    const { task } = await e.submitForApproval(draft.id);
    await assert.rejects(() => e.executeTask(task.id, browser), PmaiError);
    assert.equal(hasComposerSideEffect(browser.calls), false);
  });

  it("happy path publish after approve", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour Hà Giang");
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const browser = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    const done = await e.executeTask(task.id, browser);
    assert.equal(done.status, "SUCCESS");
    assert.ok(done.permalink);
    assert.ok(browser.calls.some((c) => c.method === "type"));
    assert.ok(browser.calls.some((c) => c.method === "publish"));
  });

  it("edit after approve invalidates", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour");
    const { approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    await e.updateDraft(draft.id, "Tour sửa");
    const a2 = e.snapshot().approvals.find((x) => x.id === approval.id);
    assert.equal(a2?.status, "STALE");
  });

  it("double execute after consume is idempotent-safe", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour");
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const b1 = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    await e.executeTask(task.id, b1);
    await assert.rejects(() => e.executeTask(task.id, b1), PmaiError);
  });

  it("crash after publish click -> NEEDS_VERIFICATION and no retry", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour");
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const browser = new FakeBrowserAdapter({
      pageName: page.name,
      pageUrl: page.url,
      crashAfterClickPublish: true,
    });
    const t = await e.executeTask(task.id, browser);
    assert.equal(t.status, "NEEDS_VERIFICATION");
    await assert.rejects(() => e.executeTask(task.id, browser), PmaiError);
  });

  it("wrong page stops with ACCOUNT_MISMATCH and no type", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour");
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const browser = new FakeBrowserAdapter({
      pageName: page.name,
      pageUrl: page.url,
      mismatchPage: true,
    });
    await assert.rejects(() => e.executeTask(task.id, browser), (err: unknown) => {
      return err instanceof PmaiError && err.code === "ACCOUNT_MISMATCH";
    });
    assert.equal(browser.calls.some((c) => c.method === "type"), false);
  });

  it("reject is REJECTED not FAILED_POLICY", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour");
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "REJECT");
    assert.equal(e.snapshot().tasks.find((t) => t.id === task.id)?.status, "REJECTED");
  });

  it("accepts Facebook title suffix and rejects wrong page", () => {
    assert.equal(namesLooselyMatch("PM Travel Hà Giang | Facebook", "PM Travel Hà Giang"), true);
    assert.equal(namesLooselyMatch("Wrong Page", "PM Travel Hà Giang"), false);
    assert.equal(urlsLooselyMatch("https://www.facebook.com/myshop/", "https://www.facebook.com/myshop"), true);
    assert.equal(urlsLooselyMatch("https://www.facebook.com/wrongpage", "https://www.facebook.com/myshop"), false);
  });

  it("uploads attached localPath and skips detached media", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour Ha Giang");
    await e.addLocalMedia(draft.id, {
      name: "tour.jpg",
      size: 1200,
      mimeType: "image/jpeg",
      localPath: "C:\\\\media\\\\tour.jpg",
    });
    await e.addLocalMedia(draft.id, {
      name: "skip.jpg",
      size: 800,
      mimeType: "image/jpeg",
      localPath: "C:\\\\media\\\\skip.jpg",
    });
    const skip = e.snapshot().contents[0].media[1];
    await e.toggleMediaAttach(draft.id, skip.id, false);
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const browser = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    const done = await e.executeTask(task.id, browser);
    assert.equal(done.status, "SUCCESS");
    const upload = browser.calls.find((c) => c.method === "upload");
    assert.ok(upload);
    assert.deepEqual(upload.args[0], ["C:\\\\media\\\\tour.jpg"]);
  });

  it("rejects mixed image and video", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour");
    await e.addLocalMedia(draft.id, { name: "a.jpg", size: 10, mimeType: "image/jpeg", localPath: "/tmp/a.jpg" });
    await assert.throws(
      () => e.addLocalMedia(draft.id, { name: "b.mp4", size: 20, mimeType: "video/mp4", localPath: "/tmp/b.mp4" }),
      PmaiError,
    );
  });

  it("removePage unselects target", async () => {
    const e = await readyEngine();
    const id = e.snapshot().selectedPageId;
    assert.ok(id);
    e.removePage(id);
    assert.equal(e.snapshot().selectedPageId, null);
    assert.equal(e.canCreatePost().ok, false);
  });

  it("adds a real page when demo pages are not seeded", async () => {
    const e = primed();
    await e.createProfile({ name: "P1", mode: "ATTACH_EXISTING", chromeDirectory: "Profile 1" });
    e.markLoggedIn("Op", { seedDemo: false });
    assert.equal(e.snapshot().pages.length, 0);
    const page = e.addPage({ name: "Shop", url: "https://www.facebook.com/myshop/" });
    assert.equal(page.url, "https://www.facebook.com/myshop");
    e.selectPage(page.id);
    assert.equal(e.snapshot().selectedPageId, page.id);
  });

  it("electron adapter refuses med_ ids and missing paths", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour");
    await e.addLocalMedia(draft.id, { name: "sol.jpg", size: 10, mimeType: "image/jpeg" });
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const browser = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    (browser as { kind: string }).kind = "electron-chrome";
    await assert.rejects(() => e.executeTask(task.id, browser), (err: unknown) => {
      return err instanceof PmaiError && err.code === "NOT_READY";
    });
    assert.equal(browser.calls.some((c) => c.method === "upload"), false);
  });

  it("never treats med_ ids as filesystem paths", () => {
    assert.equal(looksLikeMediaId("med_1083b3fe628b460894fdae"), true);
    assert.equal(looksLikeMediaId("C:\\\\Users\\\\Admin\\\\Pictures\\\\a.jpg"), false);
    const local = resolveMediaSource("C:\\\\Users\\\\Admin\\\\Pictures\\\\a.jpg");
    assert.equal(local.kind, "local");
    const http = resolveMediaSource("https://example.com/a.jpg");
    assert.equal(http.kind, "http");
    const fileUrl = resolveMediaSource("file:///C:/Users/Admin/Pictures/a.jpg");
    assert.equal(fileUrl.kind, "local");
    assert.match(fileUrl.value, /C:/);
    assert.throws(() => resolveMediaSource("med_1083b3fe628b460894fdae"), PmaiError);
    assert.throws(
      () =>
        uploadPaths(
          [
            {
              id: "med_1083b3fe628b460894fdae",
              type: "image",
              name: "x.jpg",
              checksum: "1",
              mimeType: "image/jpeg",
              size: 1,
            },
          ],
          true,
        ),
      PmaiError,
    );
  });

  it("strips Brand JSON leaked into caption", () => {
    const raw = 'Khám phá cùng PMAI.\n\nBrand: {"hotline":"","pageName":"","priceNote":"","policyNote":""}';
    assert.equal(sanitizeComposerBody(raw), "Khám phá cùng PMAI.");
    assert.equal(sanitizeComposerBody('{"hotline":"","pageName":"x","priceNote":"","policyNote":""}'), "");
  });

  it("does not treat Đăng ngay or Tiếp cận as the publish button", async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const pub = req("../../../apps/desktop/facebook-publish.cjs") as {
      isExactPublishName: (n: string) => boolean;
      isExactNextName: (n: string) => boolean;
    };
    assert.equal(pub.isExactPublishName("Đăng"), true);
    assert.equal(pub.isExactPublishName("Post"), true);
    assert.equal(pub.isExactPublishName("Đăng ngay"), false);
    assert.equal(pub.isExactNextName("Tiếp"), true);
    assert.equal(pub.isExactNextName("Tiếp cận nhiều người hơn khi bạn chia sẻ bài viết trong các nhóm phù hợp."), false);
  });
});
