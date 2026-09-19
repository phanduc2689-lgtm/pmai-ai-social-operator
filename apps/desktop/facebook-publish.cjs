"use strict";

/**
 * Facebook Page publish state machine.
 * Click only exact «Đăng» / «Post» / «Tiếp» / «Next» inside the composer dialog.
 * Never match «Đăng ngay» or «Tiếp cận nhiều người…».
 */

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isExactPublishName(name) {
  const n = String(name || "").trim();
  return n === "Đăng" || n === "Post";
}

function isExactNextName(name) {
  const n = String(name || "").trim();
  return n === "Tiếp" || n === "Next";
}

function dialogRoot(page) {
  return page.locator('[role="dialog"], [aria-modal="true"]');
}

async function visible(loc, timeout = 700) {
  try {
    return await loc.isVisible({ timeout });
  } catch {
    return false;
  }
}

async function firstVisible(cands, timeout = 1200) {
  for (const loc of cands) {
    if (await visible(loc, timeout)) return loc;
  }
  return null;
}

async function safeClick(loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
  } catch {
    /* ignore */
  }
  try {
    await loc.click({ timeout: 5000 });
  } catch {
    await loc.click({ timeout: 5000, force: true });
  }
}

async function resolveDialog(page) {
  const titled = dialogRoot(page).filter({ hasText: /cài đặt bài viết|tạo bài viết|create post|create a post/i });
  if (await visible(titled.last(), 500)) return titled.last();
  if (await visible(dialogRoot(page).last(), 500)) return dialogRoot(page).last();
  return dialogRoot(page).last();
}

function exactPublishButtons(dialog) {
  return [
    dialog.getByRole("button", { name: "Đăng", exact: true }),
    dialog.getByRole("button", { name: "Post", exact: true }),
    dialog.locator('[role="button"][aria-label="Đăng"]'),
    dialog.locator('[role="button"][aria-label="Post"]'),
    dialog.locator('button[aria-label="Đăng"], button[aria-label="Post"]'),
  ];
}

function exactNextButtons(dialog) {
  return [
    dialog.getByRole("button", { name: "Tiếp", exact: true }),
    dialog.getByRole("button", { name: "Next", exact: true }),
    dialog.locator('[role="button"][aria-label="Tiếp"]'),
    dialog.locator('[role="button"][aria-label="Next"]'),
  ];
}

async function detectStage(page) {
  const settings = page.getByText("Cài đặt bài viết", { exact: true }).first();
  if (await visible(settings, 600)) return "POST_SETTINGS";
  const dlg = await resolveDialog(page);
  if (await visible(dlg.getByText(/cài đặt bài viết|post settings/i).first(), 400)) return "POST_SETTINGS";
  if (await visible(dlg, 400)) return "COMPOSER_EDITING";
  return "UNKNOWN";
}

async function waitMediaPreview(page, timeout = 18000) {
  const dlg = await resolveDialog(page);
  const media = dlg.locator("img, video").first();
  try {
    await media.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitStage(page, want, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await detectStage(page)) === want) return true;
    await sleep(250);
  }
  return false;
}

async function dialogHidden(page, timeout = 30000) {
  const dlg = dialogRoot(page).filter({ hasText: /cài đặt bài viết|tạo bài viết|create post|bạn đang nghĩ gì/i }).last();
  try {
    await dlg.waitFor({ state: "hidden", timeout });
    return true;
  } catch {
    return !(await visible(dlg, 400));
  }
}

async function verifyPublished(page) {
  const toasts = [
    page.getByText(/bài viết đã được đăng|đã đăng|is now live|published/i).first(),
    page.getByRole("status").filter({ hasText: /đăng|published/i }).first(),
  ];
  for (const t of toasts) {
    if (await visible(t, 2500)) return true;
  }
  const settings = page.getByText("Cài đặt bài viết", { exact: true }).first();
  if (await visible(settings, 500)) return false;
  const composer = dialogRoot(page).filter({ hasText: /bạn đang nghĩ gì|what's on your mind|tạo bài viết/i }).first();
  if (await visible(composer, 500)) return false;
  return true;
}

async function clickExactPublish(page) {
  const dlg = await resolveDialog(page);
  const btn = await firstVisible(exactPublishButtons(dlg), 2500);
  if (btn) {
    await safeClick(btn);
    return true;
  }
  const pageLevel = await firstVisible(
    [
      page.getByRole("button", { name: "Đăng", exact: true }).last(),
      page.getByRole("button", { name: "Post", exact: true }).last(),
    ],
    1500,
  );
  if (pageLevel) {
    await safeClick(pageLevel);
    return true;
  }
  return false;
}

async function clickExactNext(page) {
  const dlg = await resolveDialog(page);
  const btn = await firstVisible(exactNextButtons(dlg), 1000);
  if (!btn) return false;
  await safeClick(btn);
  return true;
}

/**
 * @param {import('playwright').Page} page
 * @param {{ hasMedia?: boolean }} [opts]
 */
async function publishFromComposer(page, opts = {}) {
  const stages = [];
  const mark = (name, ok = true, detail = "") => {
    stages.push({ name, ok, detail });
  };

  if (opts.hasMedia !== false) {
    const preview = await waitMediaPreview(page, 18000);
    mark("MEDIA_PREVIEW_READY", preview, preview ? "ok" : "timeout — tiếp tục nếu caption-only");
  }

  let stage = await detectStage(page);
  if (stage === "COMPOSER_EDITING") {
    if (await clickExactNext(page)) {
      mark("NEXT_CLICKED");
      await waitStage(page, "POST_SETTINGS", 12000);
      stage = await detectStage(page);
    }
  }

  if (stage !== "POST_SETTINGS") {
    const opened = await clickExactPublish(page);
    if (opened) {
      mark("COMPOSER_POST_CLICKED");
      await sleep(600);
      await waitStage(page, "POST_SETTINGS", 12000);
      stage = await detectStage(page);
    }
  }

  if ((await detectStage(page)) === "POST_SETTINGS") {
    mark("POST_SETTINGS_OPEN");
  } else {
    mark("POST_SETTINGS_OPEN", false, await detectStage(page));
  }

  mark("PUBLISH_READY");

  const found = await clickExactPublish(page);
  if (!found) {
    const e = err("UI_CHANGED", "Không thấy nút Đăng trong modal Cài đặt bài viết (exact «Đăng», không phải «Đăng ngay»).");
    e.stages = stages;
    throw e;
  }
  mark("PUBLISH_BUTTON_FOUND");
  mark("PUBLISH_CLICKED");

  const hidden = await dialogHidden(page, 30000);
  mark("PUBLISH_PROCESSING", hidden, hidden ? "modal đóng" : "modal còn mở");

  if (!hidden) {
    const again = await clickExactPublish(page);
    if (again) {
      mark("PUBLISH_CLICKED", true, "click lần 2");
      await dialogHidden(page, 20000);
    }
  }

  const ok = await verifyPublished(page);
  if (!ok) {
    const e = err("NEEDS_VERIFICATION", "Đã bấm Đăng nhưng chưa xác nhận bài lên. Không auto-retry.");
    e.stages = stages;
    throw e;
  }
  mark("PUBLISH_SUCCESS");
  return { ok: true, stage: "PUBLISHED", stages };
}

module.exports = {
  publishFromComposer,
  isExactPublishName,
  isExactNextName,
  detectStage,
  exactPublishButtons,
  resolveDialog,
};
