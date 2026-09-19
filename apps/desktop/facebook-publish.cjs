"use strict";

/**
 * Two-phase Facebook Page publish:
 *   1. Modal «Tạo bài viết»  → click exact «Tiếp»
 *   2. Modal «Cài đặt bài viết» → click exact «Đăng»
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

async function firstVisible(cands, timeout = 800) {
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
  const composer = dialogRoot(page).filter({ hasText: /tạo bài viết|create post|create a post/i });
  const settings = dialogRoot(page).filter({ hasText: /cài đặt bài viết|post settings/i });
  if (await visible(settings.last(), 400)) return settings.last();
  if (await visible(composer.last(), 400)) return composer.last();
  if (await visible(dialogRoot(page).last(), 400)) return dialogRoot(page).last();
  return dialogRoot(page).last();
}

async function detectStage(page) {
  if (await visible(page.getByText("Cài đặt bài viết", { exact: true }).first(), 500)) return "POST_SETTINGS";
  if (await visible(page.getByText("Tạo bài viết", { exact: true }).first(), 500)) return "COMPOSER_EDITING";
  const dlg = await resolveDialog(page);
  if (await visible(dlg.getByText(/cài đặt bài viết|post settings/i).first(), 300)) return "POST_SETTINGS";
  if (await visible(dlg.getByText(/tạo bài viết|create post/i).first(), 300)) return "COMPOSER_EDITING";
  if (await visible(dlg, 300)) return "COMPOSER_EDITING";
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

async function waitStage(page, want, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await detectStage(page)) === want) return true;
    await sleep(250);
  }
  return false;
}

/**
 * Click a control whose innerText or aria-label equals one of `labels` exactly.
 * Facebook Page composer uses div[role=button], not <button>.
 */
async function clickExactLabel(page, labels) {
  const dlg = await resolveDialog(page);
  try {
    const handle = await dlg.elementHandle();
    if (handle) {
      const clicked = await handle.evaluate((root, names) => {
        const sel = 'button, [role="button"], div[tabindex="0"], span[role="button"], a[role="button"]';
        const nodes = [...root.querySelectorAll(sel)];
        const hit = [...nodes].reverse().find((el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return false;
          const aria = (el.getAttribute("aria-label") || "").trim();
          const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          return names.includes(aria) || names.includes(text);
        });
        if (!hit) return false;
        hit.click();
        return true;
      }, labels);
      await handle.dispose();
      if (clicked) return true;
    }
  } catch {
    /* fall through to locators */
  }

  const locators = labels.flatMap((label) => [
    dlg.getByRole("button", { name: label, exact: true }),
    dlg.locator(`[aria-label="${label}"]`),
    dlg.locator('[role="button"]').filter({ hasText: new RegExp(`^${label}$`) }),
    dlg.getByText(label, { exact: true }),
    page.getByRole("button", { name: label, exact: true }),
    page.getByText(label, { exact: true }).last(),
  ]);
  const loc = await firstVisible(locators, 600);
  if (!loc) return false;
  await safeClick(loc);
  return true;
}

async function clickComposerNext(page) {
  return clickExactLabel(page, ["Tiếp", "Next"]);
}

async function clickExactPublish(page) {
  return clickExactLabel(page, ["Đăng", "Post"]);
}

async function dialogHidden(page, timeout = 30000) {
  const dlg = dialogRoot(page)
    .filter({ hasText: /cài đặt bài viết|tạo bài viết|create post|bạn đang nghĩ gì/i })
    .last();
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
  if (await visible(page.getByText("Cài đặt bài viết", { exact: true }).first(), 400)) return false;
  if (await visible(page.getByText("Tạo bài viết", { exact: true }).first(), 400)) return false;
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
  const fail = (code, message) => {
    const e = err(code, message);
    e.stages = stages;
    return e;
  };

  if (opts.hasMedia !== false) {
    const preview = await waitMediaPreview(page, 18000);
    mark("MEDIA_PREVIEW_READY", preview, preview ? "ok" : "timeout");
  }

  let stage = await detectStage(page);
  mark("COMPOSER_STAGE", true, stage);

  // Phase 1 — Tạo bài viết → Tiếp (required unless already on settings)
  if (stage !== "POST_SETTINGS") {
    const nextOk = await clickComposerNext(page);
    if (!nextOk) throw fail("UI_CHANGED", "Không thấy nút Tiếp trên modal Tạo bài viết.");
    mark("NEXT_CLICKED");
    const moved = await waitStage(page, "POST_SETTINGS", 20000);
    if (!moved) throw fail("UI_CHANGED", "Đã bấm Tiếp nhưng chưa thấy modal Cài đặt bài viết.");
    mark("POST_SETTINGS_OPEN");
  } else {
    mark("POST_SETTINGS_OPEN", true, "đã mở sẵn");
  }

  mark("PUBLISH_READY");

  // Phase 2 — Cài đặt bài viết → Đăng
  const found = await clickExactPublish(page);
  if (!found) {
    throw fail(
      "UI_CHANGED",
      "Không thấy nút Đăng trong modal Cài đặt bài viết (exact «Đăng», không phải «Đăng ngay»).",
    );
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
  if (!ok) throw fail("NEEDS_VERIFICATION", "Đã bấm Đăng nhưng chưa xác nhận bài lên. Không auto-retry.");
  mark("PUBLISH_SUCCESS");
  return { ok: true, stage: "PUBLISHED", stages };
}

module.exports = {
  publishFromComposer,
  isExactPublishName,
  isExactNextName,
  detectStage,
  clickExactLabel,
  resolveDialog,
};
