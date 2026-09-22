"use strict";

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(min, max) {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

async function extractVisiblePosts(page) {
  return page.evaluate(() => {
    const blocks = [...document.querySelectorAll('[role="article"], div[aria-posinset]')];
    const out = [];
    const seen = new Set();
    for (const el of blocks) {
      const r = el.getBoundingClientRect();
      if (r.height < 80 || r.width < 200) continue;
      const raw = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (raw.length < 20) continue;
      const skipUi =
        /bạn viết gì đi|write something|create a public post|suggested for you|gợi ý cho bạn/i.test(raw) &&
        raw.length < 80;
      if (skipUi) continue;
      const link = el.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]');
      const href = link ? String(link.href || "") : "";
      const authorEl = el.querySelector('h2 a, h3 a, strong a, a[role="link"]');
      const author = authorEl ? String(authorEl.textContent || "").trim() : "";
      const key = (href || raw).slice(0, 220);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        author: author.slice(0, 80),
        text: raw.slice(0, 1600),
        permalink: href || null,
      });
    }
    return out;
  });
}

async function scrapeGroupFeed(page, opts = {}) {
  if (!page) throw err("NOT_READY", "Browser chưa launch");
  const url = String(opts.url || "");
  if (url && !/facebook\.com\/groups\//i.test(url)) {
    throw err("SCHEMA_INVALID", "URL phải là facebook.com/groups/…");
  }
  if (url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(1800);
  }
  const current = typeof page.url === "function" ? String(page.url() || "") : "";
  if (!/facebook\.com\/groups\//i.test(current) && !/facebook\.com\/groups\//i.test(url)) {
    throw err("ACCOUNT_MISMATCH", "Không đứng trong group.");
  }
  const login = await page.getByText(/log in|đăng nhập/i).first().isVisible().catch(() => false);
  if (login && /\/login/i.test(current)) throw err("AUTH_LOGOUT", "Đã đăng xuất.");
  const captcha = await page.getByText(/security check|checkpoint/i).first().isVisible().catch(() => false);
  if (captcha) throw err("CHECKPOINT", "Checkpoint / CAPTCHA — xử lý tay.");

  const maxScrolls = Math.min(20, Math.max(1, Number(opts.maxScrolls) || 8));
  const maxPosts = Math.min(80, Math.max(1, Number(opts.maxPosts) || 30));
  const bag = new Map();
  for (let i = 0; i < maxScrolls && bag.size < maxPosts; i++) {
    const batch = await extractVisiblePosts(page);
    for (const p of batch) {
      const key = (p.permalink || p.text).slice(0, 220);
      if (!bag.has(key)) bag.set(key, p);
    }
    await page.mouse.wheel(0, jitter(900, 1600));
    await sleep(jitter(900, 1600));
  }
  return [...bag.values()].slice(0, maxPosts);
}

async function typeLikeHuman(page, text) {
  const s = String(text || "");
  if (!s) return;
  try {
    await page.keyboard.type(s, { delay: jitter(28, 62) });
  } catch {
    await page.keyboard.insertText(s);
  }
}

async function commentOnVisiblePost(page, opts = {}) {
  if (!page) throw err("NOT_READY", "Browser chưa launch");
  const snippet = String(opts.snippet || "").slice(0, 48);
  const text = String(opts.text || "").trim();
  if (!text) throw err("SCHEMA_INVALID", "Thiếu nội dung comment.");
  if (opts.permalink) {
    const here = String(page.url() || "");
    if (here && !here.includes("facebook.com")) {
      await page.goto(opts.permalink, { waitUntil: "domcontentloaded", timeout: 45000 });
      await sleep(1200);
    } else if (opts.permalink && !here.startsWith(String(opts.permalink).slice(0, 40))) {
      await page.goto(opts.permalink, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
      await sleep(1000);
    }
  }

  const boxes = [
    page.getByPlaceholder(/viết bình luận|write a comment|viết cảm nghĩ/i).last(),
    page.getByLabel(/viết bình luận|write a comment/i).last(),
    page.locator('[aria-label*="Viết bình luận" i], [aria-label*="Write a comment" i], [aria-placeholder*="Viết bình luận" i]').last(),
    page.locator('[role="article"] [contenteditable="true"]').last(),
    page.locator('[contenteditable="true"]').last(),
  ];

  let box = null;
  const start = Date.now();
  while (Date.now() - start < 8000) {
    for (const loc of boxes) {
      try {
        if (await loc.isVisible({ timeout: 150 })) {
          box = loc;
          break;
        }
      } catch {
        /* next */
      }
    }
    if (box) break;
    await sleep(200);
  }
  if (!box) {
    throw err("UI_CHANGED", snippet ? `Không thấy ô bình luận gần bài «${snippet}…».` : "Không thấy ô bình luận.");
  }
  try {
    await box.click({ timeout: 4000 });
  } catch {
    await box.click({ timeout: 4000, force: true });
  }
  await sleep(jitter(250, 500));
  await typeLikeHuman(page, text);
  let submitted = false;
  if (opts.submit) {
    await sleep(jitter(400, 900));
    const send = page.getByRole("button", { name: /gửi|send|đăng/i }).last();
    if (await send.isVisible().catch(() => false)) {
      try {
        await send.click({ timeout: 3000 });
        submitted = true;
      } catch {
        await page.keyboard.press("Enter");
        submitted = true;
      }
    } else {
      await page.keyboard.press("Enter");
      submitted = true;
    }
  }
  return { ok: true, typed: true, submitted };
}

module.exports = {
  scrapeGroupFeed,
  commentOnVisiblePost,
  extractVisiblePosts,
};
