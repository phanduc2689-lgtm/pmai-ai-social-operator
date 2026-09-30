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

function isJunkComment(author, body) {
  const ui =
    /^(gửi tin nhắn|nhắn tin|message|inbox|chung|công khai|public|ẩn|ẩn bình luận|hide|bỏ ẩn|thích|like|bỏ thích|unlike|trả lời|phản hồi|reply|chia sẻ|share|xem thêm|xem bản dịch|theo dõi|follow)$/i;
  if (ui.test(String(author || "").trim())) return true;
  const words = String(body || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.length <= 4 && words.every((word) => ui.test(word));
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
    if (!author || body.length < 2 || isJunkComment(author, body)) continue;
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
  const replyRe = /^(trả lời|phản hồi|reply)\b/i;
  const likeRe = /^(thích|like|bỏ thích|unlike)\b/i;
  const timeLineRe = /^(\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm)|vừa xong|just now|\d+\s*[smhdw])$/i;
  const timeRe = /(\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm)|vừa xong|just now|\d+\s*[smhdw])/i;
  const nameTimeRe = /^(.{2,80}?)\s*[·•|–—-]\s*(\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm)|vừa xong)$/i;
  const skipLine =
    /^(thích|like|bỏ thích|unlike|trả lời|phản hồi|reply|chia sẻ|share|xem thêm|gửi tin nhắn|nhắn tin|message|chung|công khai|public|ẩn|hide|bỏ ẩn|xem bản dịch|theo dõi|follow|tác giả|author)\b/i;
  const labelOf = (el) => String(el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim();
  const tidy = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s+(tác giả|author|top fan|người đóng góp hàng đầu)$/i, "")
      .trim();
  const root = typeof document.querySelector === "function" ? document.querySelector('[role="dialog"]') || document : document;
  const buttons = [...root.querySelectorAll('[role="button"]')];
  const replyButtons = buttons.filter((button) => replyRe.test(labelOf(button)));
  const found = [];
  const seen = new Set();
  for (const button of replyButtons) {
    let node = button.parentElement;
    let best = null;
    let bestLen = Infinity;
    for (let depth = 0; depth < 16 && node; depth += 1) {
      const raw = String(node.innerText || "");
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length > 12 && text.length < bestLen && text.length < 2200 && timeRe.test(raw)) {
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
    let author = "";
    let timeLabel = "";
    const bodyLines = [];
    for (const line of lines) {
      const named = line.match(nameTimeRe);
      if (named && !author) {
        author = tidy(named[1]);
        timeLabel = named[2];
        continue;
      }
      if (!author) {
        if (line.length >= 2 && line.length <= 80 && !skipLine.test(line) && !timeLineRe.test(line)) author = tidy(line);
        continue;
      }
      if (replyRe.test(line) || likeRe.test(line)) break;
      if (timeLineRe.test(line)) {
        timeLabel = timeLabel || line;
        continue;
      }
      if (skipLine.test(line)) continue;
      bodyLines.push(line);
    }
    const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
    if (!author || body.length < 2) continue;
    const key = `${author}\n${body.slice(0, 160)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const liked = [...best.querySelectorAll('[role="button"]')].some(
      (item) => (likeRe.test(labelOf(item)) && /bỏ thích|unlike/i.test(labelOf(item))) || item.getAttribute("aria-pressed") === "true",
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

async function scrollCommentPane(page) {
  for (let i = 0; i < 8; i += 1) {
    const moved = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') || document.body;
      let scroller = null;
      let best = 0;
      for (const el of [dialog, ...dialog.querySelectorAll("div")]) {
        const delta = el.scrollHeight - el.clientHeight;
        if (delta > best && el.clientHeight > 140) {
          best = delta;
          scroller = el;
        }
      }
      if (!scroller) {
        window.scrollBy(0, 640);
        return false;
      }
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(scroller.scrollHeight, before + Math.max(480, scroller.clientHeight * 0.85));
      return scroller.scrollTop > before + 12;
    });
    await sleep(420);
    if (!moved && i > 1) break;
  }
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
      const replyRe = /^(trả lời|phản hồi|reply)\b/i;
      const likeRe = /^(thích|like)\b/i;
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
    const box = document.querySelector("[data-pmai-editor='1']") || document.querySelector("[data-pmai-target='1'] [contenteditable='true']");
    const root = (box && box.closest("form")) || (box && box.parentElement && box.parentElement.parentElement) || document.querySelector("[data-pmai-target='1']") || document.body;
    const labelOf = (el) => String(el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    const buttons = [...root.querySelectorAll('[role="button"], div[aria-label], span[aria-label]')];
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

async function clickMarkedReply(page) {
  const clicked = await page.evaluate(() => {
    const button = document.querySelector("[data-pmai-reply='1']");
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
    return true;
  });
  if (clicked) return;
  await page.locator("[data-pmai-reply='1']").first().click({ timeout: 6000, force: true });
}

async function markEditor(page) {
  return page.evaluate(() => {
    document.querySelectorAll("[data-pmai-editor]").forEach((el) => el.removeAttribute("data-pmai-editor"));
    const target = document.querySelector("[data-pmai-target='1']");
    const origin = target ? target.getBoundingClientRect().bottom : 0;
    const nodes = [...document.querySelectorAll('[contenteditable="true"], [role="textbox"]')];
    let best = null;
    let bestScore = Infinity;
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 8) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-placeholder") || ""}`;
      const mainComposer = /bình luận dưới tên|viết bình luận|write a comment|comment as /i.test(label) && !/trả lời|reply/i.test(label);
      if (mainComposer) continue;
      const replyBox = /trả lời|reply|bình luận|comment|viết|write/i.test(label) || el.getAttribute("contenteditable") === "true";
      if (!replyBox) continue;
      const dy = rect.top - origin;
      const replyBias = /trả lời|reply/i.test(label) ? -40 : 0;
      const score = dy >= -30 && dy < 460 ? dy + replyBias : 2000 + Math.abs(dy);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) return false;
    best.setAttribute("data-pmai-editor", "1");
    best.focus();
    return true;
  });
}

async function editorLocator(page) {
  for (let i = 0; i < 8; i += 1) {
    if (await markEditor(page)) {
      const marked = page.locator("[data-pmai-editor='1']").last();
      if (await marked.count().catch(() => 0)) return marked;
    }
    await sleep(350);
  }
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
  await scrollCommentPane(page);
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
    await scrollCommentPane(page);
    marked = await markComment(page, author, body);
  }
  if (!marked) throw err("UI_CHANGED", `Không thấy comment của ${author} trên Chrome. Mở đúng bài, kéo comment hiện ra, rồi tải lại.`);
  const reply = page.locator("[data-pmai-reply='1']").first();
  if (!(await reply.count().catch(() => 0))) throw err("UI_CHANGED", `Không thấy nút Trả lời trên comment của ${author}.`);
  await clickMarkedReply(page);
  await sleep(500);
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
  isJunkComment,
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
