"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { isComposerCue } = require("./playwright-adapter.cjs");

describe("composer cues", () => {
  it("matches profile, page, group, and English placeholders", () => {
    assert.equal(isComposerCue("Bạn đang nghĩ gì?"), true);
    assert.equal(isComposerCue("Bạn viết gì đi..."), true);
    assert.equal(isComposerCue("Write something..."), true);
    assert.equal(isComposerCue("What's on your mind?"), true);
    assert.equal(isComposerCue("Create a public post"), true);
    assert.equal(isComposerCue("Tạo bài viết công khai..."), true);
    assert.equal(isComposerCue("Start a discussion"), true);
  });

  it("does not treat sidebar Create group or anonymous toggle as composer", () => {
    assert.equal(isComposerCue("Tạo nhóm mới"), false);
    assert.equal(isComposerCue("Đăng ẩn danh"), false);
    assert.equal(isComposerCue("Create new group"), false);
  });

  it("does not use cover bubble «Chia sẻ suy nghĩ» as the profile composer", () => {
    assert.equal(isComposerCue("Chia sẻ suy nghĩ..."), false);
    assert.equal(isComposerCue("Share your thoughts"), false);
    assert.equal(isComposerCue("Bạn đang nghĩ gì?"), true);
    assert.equal(isComposerCue("Bạn viết gì đi..."), true);
  });
});
