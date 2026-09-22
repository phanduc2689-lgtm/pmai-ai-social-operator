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
  const nodes = [...document.querySelectorAll("h1,h2,h3,h4,span,div,button,[role='button'],[role='heading']")];
  for (const el of nodes) {
    const t = norm(el.innerText || el.textContent);
    if (t === "Chat trực tiếp với khách hàng" || t === "Chat with customers") {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return true;
    }
  }
  let later = false;
  let add = false;
  for (const el of nodes) {
    const t = norm(el.innerText || el.textContent);
    if (t === "Lúc khác" || t === "Later" || t === "Not now") later = true;
    if (t === "Thêm nút" || t === "Add button") add = true;
  }
  return later && add;
}

async function mouseClickBox(page, loc) {
  try {
    if (!(await loc.isVisible({ timeout: 400 }))) return false;
    const box = await loc.boundingBox();
    if (!box || box.width < 6 || box.height < 6) return false;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 30 });
    return true;
  } catch {
    return false;
  }
}

function messengerPopupLocator(page) {
  const title = page.getByText("Chat trực tiếp với khách hàng", { exact: true });
  return page
    .locator('[role="dialog"], [aria-modal="true"], [role="alertdialog"], div')
    .filter({ has: title })
    .filter({ has: page.getByText("Lúc khác", { exact: true }).or(page.getByText("Thêm nút", { exact: true })) })
    .last();
}

async function hasPageMessengerCtaPopup(page) {
  for (const frame of framesOf(page)) {
    try {
      if (await frame.evaluate(inPageHasMessengerCta)) return true;
    } catch {
      /* cross-origin */
    }
  }
  return visible(page.getByText("Chat trực tiếp với khách hàng", { exact: true }).first(), 250);
}

/**
 * Fanpage: get past «Chat trực tiếp với khách hàng».
 * Real mouse click on Lúc khác (React ignores DOM .click()). Then X, Escape.
 * Only returns true when the popup is actually gone.
 */
async function dismissPageComposerPrompts(page, timeout = 6000) {
  const start = Date.now();
  if (!(await hasPageMessengerCtaPopup(page))) return false;

  const tryPass = async () => {
    const pop = messengerPopupLocator(page);
    const laterLocs = [
      pop.getByRole("button", { name: /^Lúc khác$|^Later$|^Not now$/ }),
      pop.locator('[role="button"]').filter({ hasText: /^Lúc khác$|^Later$/ }),
      pop.getByText("Lúc khác", { exact: true }),
      page.getByRole("button", { name: /^Lúc khác$/ }),
      page.getByText("Lúc khác", { exact: true }),
    ];
    for (const loc of laterLocs) {
      if (await mouseClickBox(page, loc.last())) {
        await sleep(350);
        if (!(await hasPageMessengerCtaPopup(page))) return true;
      }
      try {
        if (await loc.last().isVisible({ timeout: 200 })) {
          await loc.last().click({ force: true, timeout: 1200 });
          await sleep(350);
          if (!(await hasPageMessengerCtaPopup(page))) return true;
        }
      } catch {
        /* next */
      }
    }

    const closers = [
      pop.locator('[aria-label="Đóng"], [aria-label="Close"], [aria-label="Đóng cửa sổ"]').first(),
      pop.getByRole("button", { name: /^Đóng$|^Close$/ }),
      page.locator('[aria-label="Đóng"]').last(),
    ];
    for (const loc of closers) {
      if (await mouseClickBox(page, loc)) {
        await sleep(350);
        if (!(await hasPageMessengerCtaPopup(page))) return true;
      }
    }

    try {
      await page.keyboard.press("Escape");
      await sleep(350);
      if (!(await hasPageMessengerCtaPopup(page))) return true;
    } catch {
      /* ignore */
    }

    const addBtn = pop.getByText("Thêm nút", { exact: true }).or(page.getByText("Thêm nút", { exact: true }));
    if (await mouseClickBox(page, addBtn.last())) {
      await sleep(400);
      if (!(await hasPageMessengerCtaPopup(page))) return true;
    }
    return false;
  };

  while (Date.now() - start < timeout) {
    if (!(await hasPageMessengerCtaPopup(page))) return true;
    await tryPass();
    if (!(await hasPageMessengerCtaPopup(page))) return true;
    await sleep(250);
  }
  return !(await hasPageMessengerCtaPopup(page));
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

function reelPauseMs(opts) {
  if (typeof opts.humanPauseMs === "number") return Math.max(0, opts.humanPauseMs);
  return 15000 + Math.floor(Math.random() * 5000);
}

async function humanPause(page, mark, ms, reason) {
  if (!ms) return;
  mark("HUMAN_PAUSE", true, `${Math.round(ms / 1000)}s · ${reason}`);
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await hasPageMessengerCtaPopup(page)) {
      const gone = await dismissPageComposerPrompts(page, 8000);
      if (gone) mark("PAGE_CTA_DISMISSED", true, reason);
    }
    const left = ms - (Date.now() - start);
    if (left <= 0) break;
    await sleep(Math.min(400, left));
  }
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
  let reelFlow = Boolean(opts.hasVideo);
  const pauseMs = () => (reelFlow ? reelPauseMs(opts) : 0);

  if (opts.hasMedia) {
    const preview = await waitMediaPreview(page, 20000);
    mark("MEDIA_PREVIEW_READY", preview, preview ? "ok" : "timeout");
    if (!preview) throw fail("NOT_READY", "Chưa thấy ảnh/video trong composer. Không đăng bài chỉ có chữ.");
  }

  let stage = await detectStage(page);
  mark("COMPOSER_STAGE", true, stage);
  if (stage === "REEL_EDITOR" || stage === "REEL_SETTINGS") reelFlow = true;

  if (stage !== "POST_SETTINGS" && stage !== "REEL_SETTINGS") {
    const nextOk = await clickComposerNext(page);
    if (!nextOk) throw fail("UI_CHANGED", "Không thấy nút Tiếp trên modal Tạo bài viết.");
    mark("NEXT_CLICKED");
    await humanPause(page, mark, pauseMs(), "sau Tiếp");
    const skippedOnNext = await dismissPageComposerPrompts(page, reelFlow ? 8000 : 2000);
    if (skippedOnNext) mark("PAGE_CTA_DISMISSED", true, "sau Tiếp");
    const after = await waitAnyStage(page, ["POST_SETTINGS", "REEL_EDITOR", "REEL_SETTINGS"], 20000);
    if (!after) {
      throw fail("UI_CHANGED", "Đã bấm Tiếp nhưng chưa thấy Cài đặt bài viết / Chỉnh sửa thước phim.");
    }
    if (after === "REEL_EDITOR" || after === "REEL_SETTINGS") reelFlow = true;
    if (after === "REEL_EDITOR") {
      mark("REEL_EDITOR_OPEN");
      await humanPause(page, mark, pauseMs(), "Chỉnh sửa thước phim");
      const reelNext = await clickComposerNext(page);
      if (!reelNext) throw fail("UI_CHANGED", "Không thấy nút Tiếp trên Chỉnh sửa thước phim.");
      mark("REEL_NEXT_CLICKED");
      await humanPause(page, mark, pauseMs(), "sau Tiếp thước phim");
      const skippedOnReel = await dismissPageComposerPrompts(page, 8000);
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

  if (reelFlow) await humanPause(page, mark, pauseMs(), "Cài đặt thước phim");
  const skippedCta = await dismissPageComposerPrompts(page, reelFlow ? 8000 : 3500);
  if (skippedCta) mark("PAGE_CTA_DISMISSED", true, "Lúc khác");

  mark("PUBLISH_READY");

  let found = await clickExactPublish(page);
  if (!found) {
    await dismissPageComposerPrompts(page, reelFlow ? 8000 : 2000);
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

  const settled = await settlePagePublishAfterClick(page, mark, { reel: reelFlow, humanPauseMs: pauseMs() });
  mark("PUBLISH_PROCESSING", settled, settled ? "modal đóng" : "modal còn mở");

  const ok = settled || (await verifyPublished(page));
  if (!ok) throw fail("NEEDS_VERIFICATION", "Đã bấm Đăng nhưng chưa xác nhận bài lên. Không auto-retry.");
  mark("PUBLISH_SUCCESS");
  return { ok: true, stage: "PUBLISHED", stages };
}

async function settlePagePublishAfterClick(page, mark, opts = {}) {
  const reel = Boolean(opts.reel);
  const pause = reel ? (typeof opts.humanPauseMs === "number" ? opts.humanPauseMs : reelPauseMs(opts)) : 0;
  let dismissedOnce = false;

  if (reel) {
    await humanPause(page, mark, pause, "sau Đăng thước phim");
    if (await hasPageMessengerCtaPopup(page)) {
      const gone = await dismissPageComposerPrompts(page, 8000);
      if (gone && !dismissedOnce) {
        mark("PAGE_CTA_DISMISSED", true, "Lúc khác sau Đăng");
        dismissedOnce = true;
      }
    }
    if (await verifyPublished(page)) return true;
    await humanPause(page, mark, pause, "chờ popup thước phim");
    if (await hasPageMessengerCtaPopup(page)) {
      const gone = await dismissPageComposerPrompts(page, 8000);
      if (gone && !dismissedOnce) {
        mark("PAGE_CTA_DISMISSED", true, "Lúc khác sau Đăng");
        dismissedOnce = true;
      }
    }
    if (await verifyPublished(page)) return true;
    if (!(await hasPageMessengerCtaPopup(page))) {
      const again = await clickExactPublish(page);
      if (again) mark("PUBLISH_CLICKED", true, "click lần 2");
    } else {
      const gone = await dismissPageComposerPrompts(page, 8000);
      if (gone && !dismissedOnce) {
        mark("PAGE_CTA_DISMISSED", true, "Lúc khác sau Đăng");
        dismissedOnce = true;
      }
      const again = await clickExactPublish(page);
      if (again) mark("PUBLISH_CLICKED", true, "click lần 2");
    }
    await humanPause(page, mark, pause, "chờ bài thước phim lên");
    return verifyPublished(page);
  }

  const start = Date.now();
  let extraClicks = 0;
  await sleep(400);
  while (Date.now() - start < 28000) {
    if (await hasPageMessengerCtaPopup(page)) {
      const gone = await dismissPageComposerPrompts(page, 5000);
      if (gone && !dismissedOnce) {
        mark("PAGE_CTA_DISMISSED", true, "Lúc khác sau Đăng");
        dismissedOnce = true;
      }
      if (await hasPageMessengerCtaPopup(page)) {
        await sleep(250);
        continue;
      }
    }

    if (await verifyPublished(page)) return true;

    const stage = await detectStage(page);
    if ((stage === "POST_SETTINGS" || stage === "REEL_SETTINGS") && extraClicks < 3) {
      const again = await clickExactPublish(page);
      if (again) {
        extraClicks += 1;
        mark("PUBLISH_CLICKED", true, "click lần " + (extraClicks + 1));
        await sleep(700);
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
