"use strict";

/**
 * Two-phase Facebook Page publish:
 *   1. Modal «Tạo bài viết»  → click exact «Tiếp»
 *   2. Modal «Cài đặt bài viết» → click exact «Đăng» in the footer that also has «Lưu»
 *
 * Never match «Đăng ngay» or «Tiếp cận nhiều người…».
 * Never exclude a node just because an ancestor (the modal) contains «Đăng ngay».
 * Facebook Page composer uses div[role=button] / tabindex, not <button>.
 */

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeLabel(name) {
  return String(name || "")
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExactPublishName(name) {
  const n = normalizeLabel(name);
  return n === "Đăng" || n === "Post";
}

function isExactNextName(name) {
  const n = normalizeLabel(name);
  return n === "Tiếp" || n === "Next";
}

function isExactSaveName(name) {
  const n = normalizeLabel(name);
  return n === "Lưu" || n === "Save";
}

/**
 * Pick the publish CTA that shares the tightest ancestor with a Save/Lưu control.
 * `nodes`: { id, text, aria, visible, ancestorIds: string[] }
 */
function pickFooterPublish(nodes) {
  const vis = (nodes || []).filter((n) => n && n.visible !== false);
  const pubs = vis.filter((n) => isExactPublishName(n.aria) || isExactPublishName(n.text));
  const saves = vis.filter((n) => isExactSaveName(n.aria) || isExactSaveName(n.text));
  if (!pubs.length) return null;

  function chain(n) {
    return new Set([...(n.ancestorIds || []), n.id]);
  }

  let best = null;
  let bestScore = -1;
  for (const pub of pubs) {
    for (const save of saves) {
      const pc = chain(pub);
      const common = [...(save.ancestorIds || [])].filter((id) => pc.has(id));
      if (pc.has(save.id)) common.push(save.id);
      if (common.length > bestScore) {
        bestScore = common.length;
        best = pub;
      }
    }
  }
  if (!best && pubs.length === 1) best = pubs[0];
  return best ? best.id : null;
}

function dialogRoot(page) {
  return page.locator('[role="dialog"], [aria-modal="true"], [role="sheet"]');
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
  const settings = dialogRoot(page).filter({
    hasText: /cài đặt bài viết|post settings|cài đặt thước phim|reel settings/i,
  });
  const reelEdit = dialogRoot(page).filter({ hasText: /chỉnh sửa thước phim|edit reel|chỉnh sửa video/i });
  const composer = dialogRoot(page).filter({ hasText: /tạo bài viết|create post|create a post/i });
  if (await visible(settings.last(), 400)) return settings.last();
  if (await visible(reelEdit.last(), 400)) return reelEdit.last();
  if (await visible(composer.last(), 400)) return composer.last();
  if (await visible(dialogRoot(page).last(), 400)) return dialogRoot(page).last();
  return dialogRoot(page).last();
}

async function detectStage(page) {
  if (await visible(page.getByText("Cài đặt thước phim", { exact: true }).first(), 400)) return "REEL_SETTINGS";
  if (await visible(page.getByText("Reel settings", { exact: true }).first(), 300)) return "REEL_SETTINGS";
  if (await visible(page.getByText("Cài đặt bài viết", { exact: true }).first(), 500)) return "POST_SETTINGS";
  if (await visible(page.getByText("Post settings", { exact: true }).first(), 400)) return "POST_SETTINGS";
  if (await visible(page.getByText("Chỉnh sửa thước phim", { exact: true }).first(), 400)) return "REEL_EDITOR";
  if (await visible(page.getByText("Edit reel", { exact: true }).first(), 300)) return "REEL_EDITOR";
  if (await visible(page.getByText("Tạo bài viết", { exact: true }).first(), 500)) return "COMPOSER_EDITING";
  const dlg = await resolveDialog(page);
  if (await visible(dlg.getByText(/cài đặt thước phim|reel settings/i).first(), 250)) return "REEL_SETTINGS";
  if (await visible(dlg.getByText(/cài đặt bài viết|post settings/i).first(), 300)) return "POST_SETTINGS";
  if (await visible(dlg.getByText(/chỉnh sửa thước phim|edit reel/i).first(), 250)) return "REEL_EDITOR";
  if (await visible(dlg.getByText(/tạo bài viết|create post/i).first(), 300)) return "COMPOSER_EDITING";
  if (await visible(dlg, 300)) return "COMPOSER_EDITING";
  return "UNKNOWN";
}

async function waitMediaPreview(page, timeout = 8000) {
  const media = require("./media-upload.cjs");
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await media.hasComposerMediaPreview(page)) return true;
    await sleep(280);
  }
  return false;
}

async function waitAnyStage(page, wants, timeout = 20000) {
  const start = Date.now();
  const set = new Set(wants);
  while (Date.now() - start < timeout) {
    const s = await detectStage(page);
    if (set.has(s)) return s;
    await sleep(250);
  }
  return null;
}

function framesOf(page) {
  if (page && typeof page.frames === "function") {
    const list = page.frames();
    if (Array.isArray(list) && list.length) return list;
  }
  return [page];
}

/**
 * Click a control whose innerText or aria-label equals one of `labels` exactly.
 * Used for «Tiếp» on Tạo bài viết. Facebook uses div[role=button], not <button>.
 */
async function clickExactLabel(page, labels) {
  const wanted = labels.map(normalizeLabel);
  const dlg = await resolveDialog(page);
  try {
    const handle = await dlg.elementHandle();
    if (handle) {
      const clicked = await handle.evaluate((root, names) => {
        const norm = (s) =>
          String(s || "")
            .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const sel = 'button, [role="button"], div[tabindex="0"], span[role="button"], a[role="button"]';
        const nodes = [...root.querySelectorAll(sel)];
        const hit = [...nodes].reverse().find((el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return false;
          const aria = norm(el.getAttribute("aria-label") || "");
          const text = norm(el.innerText || el.textContent || "");
          return names.includes(aria) || names.includes(text);
        });
        if (!hit) return false;
        hit.click();
        return true;
      }, wanted);
      await handle.dispose();
      if (clicked) return true;
    }
  } catch {
    /* fall through */
  }

  const locators = labels.flatMap((label) => [
    dlg.getByRole("button", { name: new RegExp(`^${label}$`) }),
    dlg.locator(`[aria-label="${label}"]`),
    dlg.locator('[role="button"]').filter({ hasText: new RegExp(`^${label}$`) }),
    dlg.getByText(label, { exact: true }),
    page.getByRole("button", { name: new RegExp(`^${label}$`) }),
    page.locator('[role="button"]').filter({ hasText: new RegExp(`^${label}$`) }),
    page.getByText(label, { exact: true }).last(),
  ]);
  const loc = await firstVisible(locators, 500);
  if (!loc) return false;
  await safeClick(loc);
  return true;
}

/**
 * In-page: find exact Đăng/Post that shares the tightest ancestor with Lưu/Save.
 * Does not require role=dialog. Does not exclude because the modal contains «Đăng ngay».
 */
function inPageClickFooterPublish() {
  const norm = (s) =>
    String(s || "")
      .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isPub = (s) => {
    const n = norm(s);
    return n === "Đăng" || n === "Post";
  };
  const isSave = (s) => {
    const n = norm(s);
    return n === "Lưu" || n === "Save";
  };
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  };
  const labelOf = (el) => ({
    aria: norm(el.getAttribute("aria-label") || ""),
    text: norm(el.innerText || el.textContent || ""),
  });
  const sel = 'button, [role="button"], [tabindex="0"], a[role="button"], span[role="button"]';

  const headingHit = [...document.querySelectorAll("h1,h2,h3,h4,[role='heading'],span,div")].find((el) => {
    const t = norm(el.innerText || el.textContent);
    return (
      t === "Cài đặt bài viết" ||
      t === "Post settings" ||
      t === "Post Settings" ||
      t === "Cài đặt thước phim" ||
      t === "Reel settings"
    );
  });

  let scope = document.body;
  if (headingHit) {
    let p = headingHit.parentElement;
    while (p && p !== document.documentElement) {
      const clickables = [...p.querySelectorAll(sel)];
      const hasPub = clickables.some((el) => {
        const l = labelOf(el);
        return isPub(l.aria) || isPub(l.text);
      });
      const hasSave = clickables.some((el) => {
        const l = labelOf(el);
        return isSave(l.aria) || isSave(l.text);
      });
      if (hasPub && hasSave) {
        scope = p;
        break;
      }
      p = p.parentElement;
    }
  }

  const clickables = [...scope.querySelectorAll(sel)].filter(isVisible);
  const pubs = clickables.filter((el) => {
    const l = labelOf(el);
    if (!(isPub(l.aria) || isPub(l.text))) return false;
    if (l.text.length > 16 && !isPub(l.aria)) return false;
    return true;
  });
  const saves = clickables.filter((el) => {
    const l = labelOf(el);
    return (isSave(l.aria) || isSave(l.text)) && l.text.length <= 16;
  });

  const common = (a, b) => {
    const set = new Set();
    for (let p = a; p; p = p.parentElement) set.add(p);
    for (let p = b; p; p = p.parentElement) if (set.has(p)) return p;
    return null;
  };

  let best = null;
  let bestArea = Infinity;
  for (const pub of pubs) {
    for (const save of saves) {
      const anc = common(pub, save);
      if (!anc) continue;
      const r = anc.getBoundingClientRect();
      const area = Math.max(1, r.width * r.height);
      if (area < bestArea) {
        bestArea = area;
        best = pub;
      }
    }
  }
  if (!best && pubs.length) {
    pubs.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    best = pubs[0];
  }
  if (!best) {
    const leaves = [...scope.querySelectorAll("span, div, a")].filter(
      (el) => isVisible(el) && isPub(norm(el.innerText)) && norm(el.innerText).length <= 16,
    );
    for (const leaf of leaves) {
      let p = leaf;
      while (p && p !== scope.parentElement) {
        if (p.matches && p.matches(sel)) {
          best = p;
          break;
        }
        p = p.parentElement;
      }
      if (!best) best = leaf;
      if (best) break;
    }
  }
  if (!best) return { ok: false };
  best.click();
  return { ok: true, text: norm(best.innerText || best.getAttribute("aria-label")).slice(0, 40) };
}

async function clickPublishEvaluate(page) {
  for (const frame of framesOf(page)) {
    try {
      const result = await frame.evaluate(inPageClickFooterPublish);
      if (result && result.ok) return true;
    } catch {
      /* cross-origin frame */
    }
  }
  return false;
}

/**
 * Semantic footer click: innermost container that has both Lưu and /^Đăng$/.
 * Scoped to footer, not the whole modal (modal always contains «Đăng ngay»).
 */
async function clickFooterPublishLocators(page) {
  const settingsModal = page
    .locator('[role="dialog"], [aria-modal="true"], [role="sheet"]')
    .filter({ hasText: /cài đặt bài viết|post settings|cài đặt thước phim|reel settings/i })
    .last();

  const divLayer = page
    .locator("div")
    .filter({
      has: page
        .getByText("Cài đặt bài viết", { exact: true })
        .or(page.getByText("Cài đặt thước phim", { exact: true }))
        .or(page.getByText("Post settings", { exact: true }))
        .or(page.getByText("Reel settings", { exact: true })),
    })
    .filter({ has: page.getByText("Lưu", { exact: true }).or(page.getByText("Save", { exact: true })) })
    .filter({ has: page.getByText(/^Đăng$/).or(page.getByText(/^Post$/)) });

  const layer = (await visible(settingsModal, 250)) ? settingsModal : divLayer.last();

  const footer = layer
    .locator("div")
    .filter({ has: page.getByText("Lưu", { exact: true }).or(page.getByText("Save", { exact: true })) })
    .filter({ has: page.getByText(/^Đăng$/).or(page.getByText(/^Post$/) ) })
    .last();

  if (!(await visible(footer, 250))) return false;

  const publishBtn = footer
    .getByRole("button", { name: /^Đăng$|^Post$/ })
    .or(footer.locator('[role="button"]').filter({ hasText: /^Đăng$|^Post$/ }))
    .or(footer.getByText(/^Đăng$/, { exact: true }))
    .or(footer.getByText(/^Post$/, { exact: true }));

  const btn = publishBtn.last();
  if (!(await visible(btn, 250))) return false;
  await safeClick(btn);
  return true;
}

async function clickComposerNext(page) {
  const layers = [
    page.locator('[role="dialog"], [aria-modal="true"], [role="sheet"]').filter({ hasText: /chỉnh sửa thước phim|edit reel|chỉnh sửa video/i }).last(),
    page.locator('[role="dialog"], [aria-modal="true"], [role="sheet"]').filter({ hasText: /tạo bài viết|create post|create a post/i }).last(),
    page.locator("div").filter({ has: page.getByText("Chỉnh sửa thước phim", { exact: true }) }).last(),
    page.locator("div").filter({ has: page.getByText("Tạo bài viết", { exact: true }) }).last(),
  ];
  for (const layer of layers) {
    if (!(await visible(layer, 350))) continue;
    const nextBtn = layer
      .getByRole("button", { name: /^Tiếp$|^Next$/ })
      .or(layer.locator('[role="button"]').filter({ hasText: /^Tiếp$|^Next$/ }))
      .or(layer.getByText(/^Tiếp$/, { exact: true }))
      .or(layer.getByText(/^Next$/, { exact: true }));
    if (await visible(nextBtn.last(), 800)) {
      await safeClick(nextBtn.last());
      return true;
    }
  }
  return clickExactLabel(page, ["Tiếp", "Next"]);
}

async function clickExactPublish(page) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    try {
      if (await clickFooterPublishLocators(page)) return true;
    } catch {
      /* locators miss — evaluate next */
    }
    try {
      if (await clickPublishEvaluate(page)) return true;
    } catch {
      /* ignore */
    }
    await sleep(250);
  }
  return false;
}

function inPageHasMessengerCta() {
  const norm = (s) =>
    String(s || "")
      .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const texts = [...document.querySelectorAll("h1,h2,h3,h4,span,div,button,[role='button'],[role='heading']")].map((el) =>
    norm(el.innerText || el.textContent),
  );
  if (texts.some((t) => t === "Chat trực tiếp với khách hàng" || /^chat with customers$/i.test(t))) return true;
  const hasLater = texts.some((t) => /^(lúc khác|later|not now)$/i.test(t));
  const hasAdd = texts.some((t) => /^(thêm nút|add button)$/i.test(t));
  return hasLater && hasAdd;
}

function inPageClickLucKhac() {
  const norm = (s) =>
    String(s || "")
      .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isLater = (s) => /^(lúc khác|later|not now|maybe later)$/i.test(norm(s));
  const nodes = [...document.querySelectorAll("button, [role='button'], [tabindex], a, span, div")];
  const hits = [];
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
    const aria = norm(el.getAttribute("aria-label") || "");
    const own = norm(
      [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(" "),
    );
    const text = norm(el.innerText || el.textContent);
    if (text.length > 32 && !isLater(aria)) continue;
    if (isLater(own) || isLater(text) || isLater(aria)) hits.push(el);
  }
  if (!hits.length) return { ok: false };
  hits.sort((a, b) => norm(a.innerText).length - norm(b.innerText).length);
  const leaf = hits[0];
  const target = leaf.closest("button, [role='button'], a, [tabindex='0']") || leaf;
  target.click();
  return { ok: true, text: norm(target.innerText || target.getAttribute("aria-label")).slice(0, 24) };
}

async function hasPageMessengerCtaPopup(page) {
  for (const frame of framesOf(page)) {
    try {
      if (await frame.evaluate(inPageHasMessengerCta)) return true;
    } catch {
      /* cross-origin */
    }
  }
  if (await visible(page.getByText("Chat trực tiếp với khách hàng", { exact: true }).first(), 200)) return true;
  const later = page.getByText("Lúc khác", { exact: true });
  const add = page.getByText("Thêm nút", { exact: true });
  return (await visible(later.first(), 150)) && (await visible(add.first(), 150));
}

/** Fanpage-only: dismiss «Chat trực tiếp với khách hàng» via exact «Lúc khác». Never «Thêm nút». */
async function dismissPageComposerPrompts(page, timeout = 2500) {
  const start = Date.now();
  let dismissed = false;
  while (Date.now() - start < timeout) {
    let present = false;
    try {
      present = await hasPageMessengerCtaPopup(page);
    } catch {
      present = false;
    }
    if (!present) {
      if (dismissed || Date.now() - start > 350) return dismissed;
      await sleep(120);
      continue;
    }
    let clicked = false;
    for (const frame of framesOf(page)) {
      try {
        const result = await frame.evaluate(inPageClickLucKhac);
        if (result && result.ok) {
          clicked = true;
          break;
        }
      } catch {
        /* cross-origin */
      }
    }
    if (!clicked) {
      const later = page.getByText("Lúc khác", { exact: true }).last();
      if (await visible(later, 400)) {
        try {
          await later.click({ timeout: 1500, force: true });
          clicked = true;
        } catch {
          /* next */
        }
      }
    }
    if (clicked) {
      dismissed = true;
      await sleep(280);
      continue;
    }
    await sleep(160);
  }
  return dismissed;
}

async function dialogHidden(page, timeout = 30000) {
  const heading = page
    .getByText("Cài đặt bài viết", { exact: true })
    .or(page.getByText("Tạo bài viết", { exact: true }))
    .or(page.getByText("Post settings", { exact: true }))
    .or(page.getByText("Cài đặt thước phim", { exact: true }))
    .or(page.getByText("Chỉnh sửa thước phim", { exact: true }))
    .or(page.getByText("Reel settings", { exact: true }));
  try {
    await heading.first().waitFor({ state: "hidden", timeout });
    return true;
  } catch {
    return !(await visible(heading.first(), 400));
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
  if (await visible(page.getByText("Cài đặt thước phim", { exact: true }).first(), 300)) return false;
  if (await visible(page.getByText("Chỉnh sửa thước phim", { exact: true }).first(), 300)) return false;
  if (await visible(page.getByText("Tạo bài viết", { exact: true }).first(), 400)) return false;
  return true;
}

/**
 * @param {import('playwright').Page} page
 * @param {{ hasMedia?: boolean, destinationType?: 'PROFILE'|'PAGE'|'GROUP' }} [opts]
 */
async function publishFromComposer(page, opts = {}) {
  const dest = opts.destinationType || "PAGE";
  if (dest === "PROFILE" || dest === "GROUP") {
    return publishDirectComposer(page, opts);
  }
  return publishPageComposer(page, opts);
}

async function clickDirectPublish(page) {
  const composer = page
    .locator('[role="dialog"], [aria-modal="true"], [role="sheet"]')
    .filter({ hasText: /tạo bài viết|create post|create a post/i })
    .last();
  const layer = (await visible(composer, 800)) ? composer : page;
  const publishBtn = layer
    .getByRole("button", { name: /^Đăng$|^Post$/ })
    .or(layer.locator('[role="button"]').filter({ hasText: /^Đăng$|^Post$/ }))
    .or(layer.getByText(/^Đăng$/, { exact: true }))
    .or(layer.getByText(/^Post$/, { exact: true }));
  if (await visible(publishBtn.last(), 2500)) {
    await safeClick(publishBtn.last());
    return true;
  }
  return clickExactLabel(page, ["Đăng", "Post"]);
}

async function publishDirectComposer(page, opts = {}) {
  const stages = [];
  const mark = (name, ok = true, detail = "") => {
    stages.push({ name, ok, detail });
  };
  const fail = (code, message) => {
    const e = err(code, message);
    e.stages = stages;
    return e;
  };

  if (opts.hasMedia) {
    const preview = await waitMediaPreview(page, 20000);
    mark("MEDIA_PREVIEW_READY", preview, preview ? "ok" : "timeout");
    if (!preview) throw fail("NOT_READY", "Chưa thấy ảnh/video trong composer. Không đăng bài chỉ có chữ.");
  }

  const stage = await detectStage(page);
  mark("COMPOSER_STAGE", true, stage);
  mark("PUBLISH_READY", true, "direct Đăng — không bấm Tiếp");

  const found = await clickDirectPublish(page);
  if (!found) {
    throw fail("UI_CHANGED", "Không thấy nút Đăng trên modal Tạo bài viết (exact «Đăng», không phải «Đăng ẩn danh» / «Đăng ngay»).");
  }
  mark("PUBLISH_BUTTON_FOUND");
  mark("PUBLISH_CLICKED");

  const hidden = await dialogHidden(page, 30000);
  mark("PUBLISH_PROCESSING", hidden, hidden ? "modal đóng" : "modal còn mở");
  if (!hidden) {
    const again = await clickDirectPublish(page);
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

async function publishPageComposer(page, opts = {}) {
  const stages = [];
  const mark = (name, ok = true, detail = "") => {
    stages.push({ name, ok, detail });
  };
  const fail = (code, message) => {
    const e = err(code, message);
    e.stages = stages;
    return e;
  };

  if (opts.hasMedia) {
    const preview = await waitMediaPreview(page, 20000);
    mark("MEDIA_PREVIEW_READY", preview, preview ? "ok" : "timeout");
    if (!preview) throw fail("NOT_READY", "Chưa thấy ảnh/video trong composer. Không đăng bài chỉ có chữ.");
  }

  let stage = await detectStage(page);
  mark("COMPOSER_STAGE", true, stage);

  if (stage !== "POST_SETTINGS" && stage !== "REEL_SETTINGS") {
    const nextOk = await clickComposerNext(page);
    if (!nextOk) throw fail("UI_CHANGED", "Không thấy nút Tiếp trên modal Tạo bài viết.");
    mark("NEXT_CLICKED");
    const skippedOnNext = await dismissPageComposerPrompts(page, 2000);
    if (skippedOnNext) mark("PAGE_CTA_DISMISSED", true, "sau Tiếp");
    const after = await waitAnyStage(page, ["POST_SETTINGS", "REEL_EDITOR", "REEL_SETTINGS"], 20000);
    if (!after) {
      throw fail("UI_CHANGED", "Đã bấm Tiếp nhưng chưa thấy Cài đặt bài viết / Chỉnh sửa thước phim.");
    }
    if (after === "REEL_EDITOR") {
      mark("REEL_EDITOR_OPEN");
      const reelNext = await clickComposerNext(page);
      if (!reelNext) throw fail("UI_CHANGED", "Không thấy nút Tiếp trên Chỉnh sửa thước phim.");
      mark("REEL_NEXT_CLICKED");
      const skippedOnReel = await dismissPageComposerPrompts(page, 2000);
      if (skippedOnReel) mark("PAGE_CTA_DISMISSED", true, "sau Tiếp thước phim");
      const settings = await waitAnyStage(page, ["REEL_SETTINGS", "POST_SETTINGS"], 20000);
      if (!settings) throw fail("UI_CHANGED", "Đã bấm Tiếp trên thước phim nhưng chưa thấy Cài đặt thước phim.");
      mark("POST_SETTINGS_OPEN", true, settings);
    } else {
      mark("POST_SETTINGS_OPEN", true, after);
    }
  } else {
    mark("POST_SETTINGS_OPEN", true, "đã mở sẵn");
  }

  const skippedCta = await dismissPageComposerPrompts(page, 3500);
  if (skippedCta) mark("PAGE_CTA_DISMISSED", true, "Lúc khác");

  mark("PUBLISH_READY");

  let found = await clickExactPublish(page);
  if (!found) {
    await dismissPageComposerPrompts(page, 2000);
    found = await clickExactPublish(page);
  }
  if (!found) {
    throw fail(
      "UI_CHANGED",
      "Không thấy nút Đăng trong footer modal Cài đặt bài viết (cặp Lưu + Đăng, exact «Đăng», không phải «Đăng ngay»).",
    );
  }
  mark("PUBLISH_BUTTON_FOUND");
  mark("PUBLISH_CLICKED");

  const settled = await settlePagePublishAfterClick(page, mark);
  mark("PUBLISH_PROCESSING", settled, settled ? "modal đóng" : "modal còn mở");

  const ok = settled || (await verifyPublished(page));
  if (!ok) throw fail("NEEDS_VERIFICATION", "Đã bấm Đăng nhưng chưa xác nhận bài lên. Không auto-retry.");
  mark("PUBLISH_SUCCESS");
  return { ok: true, stage: "PUBLISHED", stages };
}

async function settlePagePublishAfterClick(page, mark) {
  const start = Date.now();
  let extraClicks = 0;
  await sleep(500);
  while (Date.now() - start < 28000) {
    const dismissed = await dismissPageComposerPrompts(page, 1800);
    if (dismissed) mark("PAGE_CTA_DISMISSED", true, "Lúc khác sau Đăng");

    if (await verifyPublished(page)) return true;

    const popup = await hasPageMessengerCtaPopup(page);
    if (popup) {
      await sleep(200);
      continue;
    }

    const stage = await detectStage(page);
    if ((stage === "POST_SETTINGS" || stage === "REEL_SETTINGS") && extraClicks < 3) {
      const again = await clickExactPublish(page);
      if (again) {
        extraClicks += 1;
        mark("PUBLISH_CLICKED", true, "click lần " + (extraClicks + 1));
        await sleep(600);
        continue;
      }
    }
    await sleep(300);
  }
  return verifyPublished(page);
}

module.exports = {
  publishFromComposer,
  publishDirectComposer,
  publishPageComposer,
  clickDirectPublish,
  dismissPageComposerPrompts,
  hasPageMessengerCtaPopup,
  normalizeLabel,
  isExactPublishName,
  isExactNextName,
  isExactSaveName,
  pickFooterPublish,
  detectStage,
  clickExactLabel,
  clickExactPublish,
  clickFooterPublishLocators,
  resolveDialog,
  inPageClickFooterPublish,
};
