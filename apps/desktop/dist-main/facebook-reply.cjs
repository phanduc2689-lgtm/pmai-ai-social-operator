"use strict";

/**
 * Reply / like on an already-attached Facebook tab.
 * Does not touch composer publish locators in facebook-publish.cjs.
 * Stops on checkpoint or captcha. Does not solve them.
 */

function err(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanAuthor(author) {
  return String(author || "")
    .replace(/\s+/g, " ")
    .replace(/\s+(tác giả|author|top fan|người đóng góp hàng đầu)$/i, "")
    .trim();
}

function isPageAuthor(author, pageName) {
  const left = cleanAuthor(author).toLowerCase();
  const right = cleanAuthor(pageName).toLowerCase();
  if (!left || !right || left.length < 3) return false;
  if (left === right) return true;
  const head = right.split(/[·•|]/)[0].split(/[-–—]/)[0].trim();
  return head.length >= 3 && left === head;
}

function commentId(author, body) {
  const raw = `${cleanAuthor(author)}\n${String(body || "").replace(/\s+/g, " ").trim().slice(0, 180)}`.toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fb-${(hash >>> 0).toString(16)}`;
}

function initials(name) {
  const parts = cleanAuthor(name).split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "F";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function toneOf(name) {
  const raw = cleanAuthor(name);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = (hash + raw.charCodeAt(i)) % 6;
  return hash;
}

function sendViaFor(index) {
  return index % 3 === 2 ? "enter" : "arrow";
}

function humanTypeMs() {
  return 3000 + Math.floor(Math.random() * 2001);
}

function samePost(current, target) {
  try {
    const here = new URL(current);
    const want = new URL(target);
    if (here.pathname === want.pathname) return true;
    const token = want.pathname.split("/").filter(Boolean).pop() || "";
    return token.length > 6 && here.href.includes(token);
  } catch {
    return false;
  }
}

function normalizeScanned(rows, pageName) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const author = cleanAuthor(row && row.author);
    const body = String((row && row.body) || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!author || body.length < 2) continue;
    const id = commentId(author, body);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      author,
      body: body.slice(0, 500),
      liked: Boolean(row && row.liked),
      role: isPageAuthor(author, pageName) ? "author" : "customer",
      timeLabel: String((row && row.timeLabel) || "").slice(0, 40),
      initials: initials(author),
      tone: toneOf(author),
    });
  }
  return out.slice(0, 40);
}

function collectComments() {
  const replyRe = /^(trả lời|phản hồi|reply)$/i;
  const likeRe = /^(thích|like)$/i;
  const unlikeRe = /^(bỏ thích|unlike)$/i;
  const timeRe = /^(\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm)|vừa xong|just now|\d+\s*[smhdw])$/i;
  const skipLine = /^(thích|like|bỏ thích|unlike|trả lời|phản hồi|reply|chia sẻ|share|xem thêm)/i;
  const labelOf = (el) => String(el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim();
  const tidy = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s+(tác giả|author|top fan|người đóng góp hàng đầu)$/i, "")
      .trim();
  const buttons = [...document.querySelectorAll('[role="button"]')];
  const replyButtons = buttons.filter((button) => replyRe.test(labelOf(button)));
  const found = [];
  const seen = new Set();
  for (const button of replyButtons) {
    let node = button.parentElement;
    let best = null;
    let bestLen = Infinity;
    for (let depth = 0; depth < 16 && node; depth += 1) {
      const text = String(node.innerText || "").replace(/\s+/g, " ").trim();
      if (text.length > 12 && text.length < bestLen && text.length < 2200) {
        const replies = [...node.querySelectorAll('[role="button"]')].filter((item) => replyRe.test(labelOf(item)));
        if (replies.length > 0 && replies.length <= 8) {
          best = node;
          bestLen = text.length;
          if (replies.length <= 2 && text.length < 900) break;
        }
      }
      node = node.parentElement;
    }
    if (!best) continue;
    const lines = String(best.innerText || "")
      .split(/\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const author = tidy(lines.find((line) => line.length >= 2 && line.length <= 80 && !skipLine.test(line) && !timeRe.test(line)) || "");
    if (!author) continue;
    const start = lines.findIndex((line) => tidy(line) === author || line.startsWith(author));
    const bodyLines = [];
    let timeLabel = "";
    for (const line of lines.slice(Math.max(0, start) + 1)) {
      if (replyRe.test(line) || likeRe.test(line) || unlikeRe.test(line)) break;
      if (timeRe.test(line)) {
        timeLabel = timeLabel || line;
        continue;
      }
      if (skipLine.test(line)) continue;
      bodyLines.push(line);
    }
    const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
    if (body.length < 2) continue;
    const key = `${author}\n${body.slice(0, 160)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const liked = [...best.querySelectorAll('[role="button"]')].some(
      (item) => unlikeRe.test(labelOf(item)) || item.getAttribute("aria-pressed") === "true",
    );
    found.push({ author, body, liked, timeLabel });
  }
  return found;
}

function assertSafe(page) {
  const url = typeof page.url === "function" ? page.url() : "";
  if (/checkpoint|captcha|two_factor|auth_platform/i.test(url)) {
    throw err("NOT_READY", "Facebook đang checkpoint hoặc captcha. PMAI không vượt. Xử lý trên Chrome rồi chạy lại.");
  }
}

async function ensurePost(page, url) {
  assertSafe(page);
  const target = String(url || "").trim();
  if (!target) return;
  if (samePost(page.url(), target)) return;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(900);
  assertSafe(page);
}

async function openCommentList(page) {
  const count = page.getByText(/\d+\s*(bình luận|comments?)/i).first();
  if (await count.isVisible().catch(() => false)) {
    await count.click({ timeout: 4000 }).catch(() => {});
    await sleep(700);
  }
  for (let i = 0; i < 6; i += 1) {
    const more = page
      .getByRole("button", { name: /xem thêm bình luận|view more comments|xem thêm câu trả lời|view more replies|xem các bình luận trước|xem thêm/i })
      .first();
    if (!(await more.isVisible().catch(() => false))) break;
    await more.click({ timeout: 4000 }).catch(() => {});
    await sleep(650);
  }
}

async function markComment(page, author, body) {
  const needle = String(body || "").replace(/\s+/g, " ").trim().slice(0, 70);
  return page.evaluate(
    ({ authorName, snippet }) => {
      document.querySelectorAll("[data-pmai-target],[data-pmai-reply],[data-pmai-send],[data-pmai-like]").forEach((el) => {
        el.removeAttribute("data-pmai-target");
        el.removeAttribute("data-pmai-reply");
        el.removeAttribute("data-pmai-send");
        el.removeAttribute("data-pmai-like");
      });
      const replyRe = /^(trả lời|phản hồi|reply)$/i;
      const likeRe = /^(thích|like)$/i;
      const labelOf = (el) => String(el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim();
      const wantedAuthor = authorName.replace(/\s+/g, " ").trim().toLowerCase().normalize("NFKC");
      const snippetFold = snippet.toLowerCase().normalize("NFKC");
      const buttons = [...document.querySelectorAll('[role="button"]')].filter((button) => replyRe.test(labelOf(button)));
      let best = null;
      let bestLen = Infinity;
      let bestButton = null;
      for (const button of buttons) {
        let node = button.parentElement;
        for (let depth = 0; depth < 16 && node; depth += 1) {
          const text = String(node.innerText || "").replace(/\s+/g, " ").trim();
          const folded = text.toLowerCase().normalize("NFKC");
          if (folded.includes(wantedAuthor) && folded.includes(snippetFold) && text.length < bestLen && text.length < 2400) {
            best = node;
            bestLen = text.length;
            bestButton = button;
            if (text.length < 900) break;
          }
          node = node.parentElement;
        }
      }
      if (!best) return false;
      best.setAttribute("data-pmai-target", "1");
      if (bestButton) bestButton.setAttribute("data-pmai-reply", "1");
      const like = [...best.querySelectorAll('[role="button"]')].find((button) => likeRe.test(labelOf(button)));
      if (like) like.setAttribute("data-pmai-like", "1");
      best.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    },
    { authorName: cleanAuthor(author), snippet: needle },
  );
}

async function markSend(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-pmai-target='1']") || document.body;
    const box = root.querySelector('[contenteditable="true"]') || document.querySelector('[contenteditable="true"][aria-label*="rả lời" i], [contenteditable="true"][aria-label*="reply" i]');
    const scope = (box && box.parentElement && box.parentElement.parentElement) || root;
    const labelOf = (el) => String(el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    const buttons = [...scope.querySelectorAll('[role="button"], div[aria-label], span[aria-label]')];
    const labeled = buttons.find((button) => /^(bình luận|comment|gửi|send|đăng)$/i.test(labelOf(button)));
    let send = labeled;
    if (!send) {
      send = [...buttons].reverse().find((button) => {
        const label = `${labelOf(button)} ${button.innerText || ""}`;
        if (/thích|like|trả lời|reply|biểu cảm|emoji|sticker|gif|ảnh|photo|camera/i.test(label)) return false;
        const rect = button.getBoundingClientRect();
        return rect.width >= 16 && rect.width <= 72 && rect.height >= 16 && rect.height <= 72;
      });
    }
    if (!send) return false;
    send.setAttribute("data-pmai-send", "1");
    return true;
  });
}

async function editorLocator(page) {
  const inside = page.locator("[data-pmai-target='1'] [contenteditable='true']");
  if (await inside.count().catch(() => 0)) return inside.last();
  const labeled = page.locator(
    '[contenteditable="true"][aria-label*="rả lời" i], [contenteditable="true"][aria-label*="reply" i], [role="textbox"][aria-label*="rả lời" i], [role="textbox"][aria-label*="reply" i]',
  );
  if (await labeled.count().catch(() => 0)) return labeled.last();
  return null;
}

async function typeHuman(page, text) {
  const chars = Array.from(String(text || ""));
  const total = chars.length === 0 ? 0 : humanTypeMs();
  const weights = chars.map((ch, index) => {
    if (ch === " ") return 2.2;
    if (",.!?".includes(ch)) return 1.6;
    return 0.7 + ((index * 13) % 8) / 10;
  });
  const sum = weights.reduce((totalWeight, weight) => totalWeight + weight, 0) || 1;
  for (let i = 0; i < chars.length; i += 1) {
    await page.keyboard.insertText(chars[i]);
    await sleep((weights[i] / sum) * total);
  }
  return total;
}

async function scanPost(page, payload = {}) {
  await ensurePost(page, payload.url);
  await openCommentList(page);
  const raw = await page.evaluate(collectComments);
  const comments = normalizeScanned(raw, payload.pageName || "");
  return { comments, pageUrl: page.url(), count: comments.length };
}

async function replyToComment(page, payload = {}) {
  await ensurePost(page, payload.url);
  assertSafe(page);
  const author = cleanAuthor(payload.author);
  const body = String(payload.body || "");
  const text = String(payload.text || "").trim();
  if (!author || !body || !text) throw err("NOT_READY", "Thiếu comment hoặc câu trả lời.");
  let marked = await markComment(page, author, body);
  if (!marked) {
    await openCommentList(page);
    marked = await markComment(page, author, body);
  }
  if (!marked) throw err("UI_CHANGED", `Không thấy comment của ${author} trên Chrome. Mở đúng bài, kéo comment hiện ra, rồi tải lại.`);
  const reply = page.locator("[data-pmai-reply='1']").first();
  await reply.click({ timeout: 6000 });
  await sleep(450);
  const editor = await editorLocator(page);
  if (!editor) throw err("UI_CHANGED", "Đã bấm Trả lời nhưng không thấy ô gõ.");
  await editor.click({ timeout: 5000 });
  await sleep(180);
  const typedMs = await typeHuman(page, text);
  const via = payload.via === "enter" ? "enter" : "arrow";
  let used = via;
  if (via === "arrow") {
    const found = await markSend(page);
    const send = page.locator("[data-pmai-send='1']").first();
    if (found && (await send.isVisible().catch(() => false))) {
      await send.click({ timeout: 4000 }).catch(async () => {
        await page.keyboard.press("Enter");
        used = "enter";
      });
    } else {
      await page.keyboard.press("Enter");
      used = "enter";
    }
  } else {
    await page.keyboard.press("Enter");
  }
  await sleep(500);
  const leftover = await editor.innerText().catch(() => "");
  if (leftover && text.slice(0, 24) && leftover.includes(text.slice(0, 24))) {
    await page.keyboard.press("Enter");
    used = "enter";
    await sleep(400);
  }
  let liked = false;
  if (payload.likeAfter) {
    liked = await clickLike(page, author, body);
  }
  return { via: used, typedMs, liked, author };
}

async function clickLike(page, author, body) {
  const marked = await markComment(page, author, body);
  if (!marked) return false;
  const like = page.locator("[data-pmai-like='1']").first();
  if (!(await like.count().catch(() => 0))) return false;
  if (!(await like.isVisible().catch(() => false))) return false;
  await like.click({ timeout: 4000 });
  await sleep(250);
  return true;
}

async function likeComments(page, payload = {}) {
  await ensurePost(page, payload.url);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const results = [];
  for (const target of targets) {
    assertSafe(page);
    const ok = await clickLike(page, target.author, target.body);
    results.push({
      id: target.id || commentId(target.author, target.body),
      ok,
      detail: ok ? "Đã thích trên Chrome" : "Không thấy nút Thích hoặc đã thích",
    });
    await sleep(800 + Math.floor(Math.random() * 401));
  }
  return { results };
}

module.exports = {
  cleanAuthor,
  isPageAuthor,
  commentId,
  initials,
  sendViaFor,
  humanTypeMs,
  samePost,
  normalizeScanned,
  collectComments,
  scanPost,
  replyToComment,
  likeComments,
};
