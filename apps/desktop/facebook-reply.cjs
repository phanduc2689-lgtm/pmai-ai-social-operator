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

module.exports = { cleanAuthor, isPageAuthor, isJunkComment, commentId, normalizeScanned, samePost, humanTypeMs, sendViaFor };
