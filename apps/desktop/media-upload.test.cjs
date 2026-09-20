"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { acceptLooksImageOnly, acceptLooksVideo, pickVideoInputIndex, detectKind } = require("./media-upload.cjs");

const PHOTO_ACCEPT =
  "image/*,image/heif,image/heic,.tif,.tiff,.jfif,.pjp,.pjpeg,.apng,.heic,.heif,.jpg,.jpeg,.png,.gif,.webp";

const VIDEO_ACCEPT = "video/*,video/mp4,video/x-m4v,video/quicktime,.mp4,.mov,.webm,.m4v";

const BOTH_ACCEPT = `${PHOTO_ACCEPT},${VIDEO_ACCEPT}`;

describe("video vs photo file inputs", () => {
  it("treats Facebook photo picker (tif/jfif/pjp) as image-only", () => {
    assert.equal(acceptLooksImageOnly(PHOTO_ACCEPT), true);
    assert.equal(acceptLooksVideo(PHOTO_ACCEPT), false);
  });

  it("accepts video and combined Ảnh/video inputs", () => {
    assert.equal(acceptLooksVideo(VIDEO_ACCEPT), true);
    assert.equal(acceptLooksImageOnly(VIDEO_ACCEPT), false);
    assert.equal(acceptLooksVideo(BOTH_ACCEPT), true);
    assert.equal(acceptLooksImageOnly(BOTH_ACCEPT), false);
    assert.equal(acceptLooksVideo(""), true);
  });

  it("does not pick the photo-only input when a video input exists", () => {
    const idx = pickVideoInputIndex([
      { index: 0, accept: PHOTO_ACCEPT },
      { index: 1, accept: VIDEO_ACCEPT },
    ]);
    assert.equal(idx, 1);
  });

  it("prefers explicit video accept over empty accept", () => {
    const idx = pickVideoInputIndex([
      { index: 0, accept: "" },
      { index: 1, accept: VIDEO_ACCEPT },
    ]);
    assert.equal(idx, 1);
  });

  it("returns null when every input is photo-only (do not dump mp4 into jpg picker)", () => {
    assert.equal(pickVideoInputIndex([{ index: 0, accept: PHOTO_ACCEPT }]), null);
    assert.equal(pickVideoInputIndex([]), null);
  });

  it("detects mp4 as video", () => {
    assert.equal(detectKind("C:\\\\media\\\\tour.mp4"), "video");
    assert.equal(detectKind("poster.jpg"), "image");
  });
});
