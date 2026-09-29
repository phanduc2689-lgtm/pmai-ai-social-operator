"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const reply = require("./facebook-reply.cjs");

test("page author is not a customer", () => {
  assert.equal(reply.isPageAuthor("PM Travel", "PM Travel - Fanpage"), true);
  assert.equal(reply.isPageAuthor("PM Travel Tác giả", "PM Travel"), true);
  assert.equal(reply.isPageAuthor("Lan Anh", "PM Travel"), false);
});

test("send via alternates arrow and enter", () => {
  assert.equal(reply.sendViaFor(0), "arrow");
  assert.equal(reply.sendViaFor(1), "arrow");
  assert.equal(reply.sendViaFor(2), "enter");
  assert.equal(reply.sendViaFor(5), "enter");
});

test("comment id is stable and distinct", () => {
  assert.equal(reply.commentId("Lan Anh", "Mùa lá vàng còn đẹp không?"), reply.commentId("Lan Anh", "Mùa lá vàng còn đẹp không?"));
  assert.notEqual(reply.commentId("Lan Anh", "A"), reply.commentId("Mỹ Duyên", "A"));
});

test("normalize marks the page and drops empty rows", () => {
  const rows = reply.normalizeScanned(
    [
      { author: "PM Travel", body: "Câu của page", liked: false },
      { author: "Lan Anh", body: "Mùa lá vàng còn đẹp không?", liked: false, timeLabel: "35 phút" },
      { author: "X", body: " ", liked: false },
    ],
    "PM Travel · Fanpage",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].role, "author");
  assert.equal(rows[1].role, "customer");
  assert.equal(rows[1].author, "Lan Anh");
  assert.match(rows[1].id, /^fb-/);
});

test("same post ignores extra query", () => {
  const post = "https://www.facebook.com/pmtravel.com.vn/posts/pfbid0VFLmQfR5tvu32RzdjwTAPNZcQH33RA6n8";
  assert.equal(reply.samePost(`${post}?comment_id=1`, post), true);
  assert.equal(reply.samePost("https://www.facebook.com/pmtravel.com.vn", post), false);
});

test("typing budget stays inside 3–5s", () => {
  for (let i = 0; i < 30; i += 1) {
    const ms = reply.humanTypeMs();
    assert.ok(ms >= 3000 && ms <= 5000);
  }
});

test("collectComments reads reply buttons", () => {
  const buttons = [];
  const nodes = [];
  function make(role, label, children, lines) {
    const node = {
      role,
      label,
      children,
      parentElement: null,
      getAttribute(name) {
        if (name === "role") return role || null;
        if (name === "aria-label") return label || null;
        if (name === "aria-pressed") return null;
        return null;
      },
      get innerText() {
        if (lines) return lines.join("\n");
        return [label, ...children.map((child) => child.innerText)].filter(Boolean).join("\n");
      },
      querySelectorAll(selector) {
        if (selector !== '[role="button"]') return [];
        const found = [];
        const walk = (current) => {
          if (current.role === "button") found.push(current);
          for (const child of current.children || []) walk(child);
        };
        walk(node);
        return found;
      },
    };
    for (const child of children || []) child.parentElement = node;
    nodes.push(node);
    if (role === "button") buttons.push(node);
    return node;
  }
  const replyBtn = make("button", "Trả lời", [], null);
  const likeBtn = make("button", "Thích", [], null);
  const comment = make(null, null, [replyBtn, likeBtn], ["Lan Anh", "Mùa lá vàng còn đẹp không?", "35 phút", "Thích", "Trả lời"]);
  const root = make(null, null, [comment], null);
  global.document = {
    querySelectorAll(selector) {
      if (selector !== '[role="button"]') return [];
      return buttons;
    },
  };
  const found = reply.collectComments();
  delete global.document;
  assert.equal(found.length, 1);
  assert.equal(found[0].author, "Lan Anh");
  assert.match(found[0].body, /Mùa lá vàng/);
  assert.equal(found[0].timeLabel, "35 phút");
  assert.equal(root.children.length, 1);
});
