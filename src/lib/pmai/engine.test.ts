import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeBrowserAdapter, hasComposerSideEffect } from "./browser.ts";
import { PmaiEngine, namesLooselyMatch } from "./engine.ts";
import { PmaiError } from "./errors.ts";
import { evaluatePolicy } from "./policy.ts";

function primed() {
  const e = new PmaiEngine({ persist: false });
  e.setLlm("mock", "mock-local", null);
  return e;
}
async function ready() {
  const e = primed();
  await e.createProfile({ name: "P1", mode: "MANAGED_PROFILE" });
  e.markLoggedIn("PM Travel");
  e.selectPage(e.snapshot().pages[0].id);
  return e;
}

describe("invariants", () => {
  it("publish waits for approval", () => {
    assert.equal(evaluatePolicy("PUBLISH_CONTENT").decision, "WAIT_APPROVAL");
  });
  it("does not open composer before approval", async () => {
    const e = await ready();
    const draft = await e.createDraft("Tour");
    const browser = new FakeBrowserAdapter({ pageName: e.snapshot().pages[0].name, pageUrl: e.snapshot().pages[0].url });
    const { task } = await e.submitForApproval(draft.id);
    await assert.rejects(() => e.executeTask(task.id, browser), PmaiError);
    assert.equal(hasComposerSideEffect(browser.calls), false);
  });
  it("happy path after approve", async () => {
    const e = await ready();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour");
    const { task, approval } = await e.submitForApproval(draft.id);
    e.decideApproval(approval.id, "APPROVE");
    const done = await e.executeTask(task.id, new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url }));
    assert.equal(done.status, "SUCCESS");
  });
  it("matches Facebook title suffix", () => {
    assert.equal(namesLooselyMatch("PM Travel Hà Giang | Facebook", "PM Travel Hà Giang"), true);
    assert.equal(namesLooselyMatch("Wrong Page", "PM Travel Hà Giang"), false);
  });
  it("adds a real page without demo seed", async () => {
    const e = primed();
    await e.createProfile({ name: "P1", mode: "ATTACH_EXISTING" });
    e.markLoggedIn("Op", { seedDemo: false });
    assert.equal(e.snapshot().pages.length, 0);
    const page = e.addPage({ name: "Shop", url: "https://www.facebook.com/myshop/" });
    assert.equal(page.url, "https://www.facebook.com/myshop");
  });
});
