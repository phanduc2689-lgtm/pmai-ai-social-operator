import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeBrowserAdapter, hasComposerSideEffect } from "./browser.ts";
import { PmaiEngine } from "./engine.ts";
import { PmaiError } from "./errors.ts";
import {
  assertFutureLocal,
  buildPostQueue,
  formatRemaining,
  fromLocalDateTime,
  localDateTimeToIso,
  localOffsetLabel,
  SchedulerService,
  taskStatusLabel,
  toDateInputValue,
  toTimeInputValue,
} from "./scheduler.ts";

function primed(): PmaiEngine {
  const e = new PmaiEngine({ persist: false, llm: undefined, humanPauseMs: 0 });
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

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3600_000);
}

describe("local timezone helpers", () => {
  it("interprets picker values as machine-local, not a hardcoded zone", () => {
    const now = new Date();
    const iso = localDateTimeToIso(toDateInputValue(now), toTimeInputValue(now));
    const round = new Date(iso);
    assert.equal(round.getFullYear(), now.getFullYear());
    assert.equal(round.getMonth(), now.getMonth());
    assert.equal(round.getDate(), now.getDate());
    assert.equal(round.getHours(), now.getHours());
    assert.equal(round.getMinutes(), now.getMinutes());
    const built = fromLocalDateTime(2026, 8, 22, 20, 30);
    assert.equal(built.getFullYear(), 2026);
    assert.equal(built.getMonth(), 8);
    assert.equal(built.getDate(), 22);
    assert.equal(built.getHours(), 20);
    assert.equal(built.getMinutes(), 30);
    assert.match(localOffsetLabel(now), /^GMT[+-]\d{2}:\d{2}$/);
  });

  it("rejects past local time", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    assert.throws(() => assertFutureLocal(past), PmaiError);
  });

  it("formats countdown from scheduledAt - now", () => {
    assert.equal(formatRemaining(2 * 3600_000 + 14 * 60_000 + 32_000), "Còn 02:14:32");
    assert.equal(formatRemaining(0), "Đang thực hiện...");
    assert.equal(formatRemaining(-1), "Đang thực hiện...");
    assert.equal(taskStatusLabel("SCHEDULED"), "Sắp đăng");
    assert.equal(taskStatusLabel("MISSED"), "Bị lỡ");
    assert.equal(taskStatusLabel("QUEUED"), "Đang xếp hàng");
  });
});

describe("scheduled posting", () => {
  it("does not open composer before approval even when scheduled", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour Hà Giang");
    const at = hoursFromNow(2).toISOString();
    const browser = new FakeBrowserAdapter({
      pageName: e.snapshot().pages[0].name,
      pageUrl: e.snapshot().pages[0].url,
    });
    const { task } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    await assert.rejects(() => e.executeTask(task.id, browser), PmaiError);
    assert.equal(hasComposerSideEffect(browser.calls), false);
  });

  it("approve of a future schedule arms SCHEDULED and does not publish", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour Hà Giang tháng 10");
    const at = hoursFromNow(3).toISOString();
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(approval.id, "APPROVE");
    const armed = e.snapshot().tasks.find((t) => t.id === task.id);
    assert.equal(armed?.status, "SCHEDULED");
    assert.equal(armed?.scheduleMode, "SCHEDULED");
    const browser = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    await assert.rejects(() => e.executeTask(task.id, browser), (err: unknown) => {
      return err instanceof PmaiError && err.code === "NOT_READY";
    });
    assert.equal(hasComposerSideEffect(browser.calls), false);
  });

  it("rejects composing a schedule in the past", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour");
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    await assert.rejects(
      () => e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: past }),
      (err: unknown) => err instanceof PmaiError && /lớn hơn thời gian hiện tại/i.test(err.message),
    );
  });

  it("claimDueTasks then existing executeTask publishes through the same engine", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Tour Mộc Châu");
    const at = hoursFromNow(1).toISOString();
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(approval.id, "APPROVE");
    assert.deepEqual(e.claimDueTasks(new Date(Date.now() + 30 * 60_000)), []);
    const dueAt = new Date(new Date(at).getTime() + 1000);
    const claimed = e.claimDueTasks(dueAt);
    assert.deepEqual(claimed, [task.id]);
    assert.equal(e.snapshot().tasks.find((t) => t.id === task.id)?.status, "QUEUED");
    assert.deepEqual(e.claimDueTasks(dueAt), []);
    const browser = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    const done = await e.executeTask(task.id, browser);
    assert.equal(done.status, "SUCCESS");
    assert.ok(browser.calls.some((c) => c.method === "publish"));
  });

  it("recover after reopen past scheduledAt marks MISSED and does not auto-execute", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const draft = await e.createDraft("Combo Đà Nẵng");
    const at = hoursFromNow(1).toISOString();
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(approval.id, "APPROVE");
    const reopen = new Date(new Date(at).getTime() + 30 * 60_000);
    const recovered = e.recoverSchedule(reopen);
    assert.equal(recovered.missed, 1);
    assert.equal(e.snapshot().tasks.find((t) => t.id === task.id)?.status, "MISSED");
    const browser = new FakeBrowserAdapter({ pageName: page.name, pageUrl: page.url });
    await assert.rejects(() => e.executeTask(task.id, browser), PmaiError);
    assert.equal(hasComposerSideEffect(browser.calls), false);
    e.publishMissedNow(task.id);
    const done = await e.executeTask(task.id, browser);
    assert.equal(done.status, "SUCCESS");
  });

  it("recover while still before scheduledAt keeps the task armed", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour");
    const at = hoursFromNow(2).toISOString();
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(approval.id, "APPROVE");
    const recovered = e.recoverSchedule(new Date(Date.now() + 30 * 60_000));
    assert.equal(recovered.armed, 1);
    assert.equal(recovered.missed, 0);
    assert.equal(e.snapshot().tasks.find((t) => t.id === task.id)?.status, "SCHEDULED");
  });

  it("cancel prevents later execution and keeps the log", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Tour");
    const at = hoursFromNow(2).toISOString();
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(approval.id, "APPROVE");
    e.cancelScheduled(task.id);
    assert.equal(e.snapshot().tasks.find((t) => t.id === task.id)?.status, "CANCELLED");
    assert.equal(
      e.snapshot().activities.some((a) => a.detail.includes("User cancelled scheduled post.")),
      true,
    );
    assert.deepEqual(e.claimDueTasks(new Date(new Date(at).getTime() + 1000)), []);
  });

  it("reschedule updates scheduledAt and re-sorts the queue", async () => {
    const e = await readyEngine();
    const d1 = await e.createDraft("A 20:30");
    const d2 = await e.createDraft("B 21:15");
    const t1 = hoursFromNow(2);
    const t2 = hoursFromNow(3);
    const s1 = await e.submitForApproval(d1.id, { mode: "SCHEDULED", scheduledAt: t1.toISOString() });
    const s2 = await e.submitForApproval(d2.id, { mode: "SCHEDULED", scheduledAt: t2.toISOString() });
    e.decideApproval(s1.approval.id, "APPROVE");
    e.decideApproval(s2.approval.id, "APPROVE");
    const later = hoursFromNow(5);
    e.reschedule(s1.task.id, { mode: "SCHEDULED", scheduledAt: later.toISOString() });
    const q = buildPostQueue(e.snapshot(), new Date());
    assert.equal(q[0].taskId, s2.task.id);
    assert.equal(q[1].taskId, s1.task.id);
  });

  it("does not claim a second task for a session that is already RUNNING", async () => {
    const e = await readyEngine();
    const page = e.snapshot().pages[0];
    const d1 = await e.createDraft("one");
    const d2 = await e.createDraft("two");
    const at = hoursFromNow(1).toISOString();
    const s1 = await e.submitForApproval(d1.id, { mode: "SCHEDULED", scheduledAt: at });
    const s2 = await e.submitForApproval(d2.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(s1.approval.id, "APPROVE");
    e.decideApproval(s2.approval.id, "APPROVE");
    const due = new Date(new Date(at).getTime() + 1000);
    const first = e.claimDueTasks(due);
    assert.equal(first.length, 1);
    class SlowAdapter extends FakeBrowserAdapter {
      override launchProfile(id: string) {
        this.calls.push({ method: "launchProfile", args: [id] });
        return new Promise<void>(() => {});
      }
    }
    const browser = new SlowAdapter({ pageName: page.name, pageUrl: page.url });
    void e.executeTask(first[0], browser).catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
    const second = e.claimDueTasks(due);
    assert.equal(second.length, 0);
    const running = e.snapshot().tasks.filter((t) => t.status === "RUNNING");
    assert.equal(running.length, 1);
  });

  it("immediate posts still go QUEUED after approve", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("Now");
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "NOW" });
    e.decideApproval(approval.id, "APPROVE");
    assert.equal(e.snapshot().tasks.find((t) => t.id === task.id)?.status, "QUEUED");
  });

  it("SchedulerService tick claims due tasks without setTimeout-as-scheduler", async () => {
    const e = await readyEngine();
    const draft = await e.createDraft("svc");
    const at = hoursFromNow(1).toISOString();
    const { task, approval } = await e.submitForApproval(draft.id, { mode: "SCHEDULED", scheduledAt: at });
    e.decideApproval(approval.id, "APPROVE");
    let clock = new Date(Date.now() + 10 * 60_000);
    const svc = new SchedulerService(e, { now: () => clock, intervalMs: 60_000 });
    assert.deepEqual(svc.tick(), []);
    clock = new Date(new Date(at).getTime() + 500);
    assert.deepEqual(svc.tick(), [task.id]);
    svc.stop();
  });
});
