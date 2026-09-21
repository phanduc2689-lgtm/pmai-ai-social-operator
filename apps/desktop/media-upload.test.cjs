"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  acceptLooksImageOnly,
  acceptLooksVideo,
  pickVideoInputIndex,
  pickImageInputIndex,
  detectKind,
  inspectComposerMediaPreview,
} = require("./media-upload.cjs");

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

  it("picks the dialog photo input, not a video-only input", () => {
    assert.equal(
      pickImageInputIndex([
        { index: 0, accept: VIDEO_ACCEPT },
        { index: 1, accept: PHOTO_ACCEPT },
      ]),
      1,
    );
    assert.equal(pickImageInputIndex([{ index: 0, accept: PHOTO_ACCEPT }]), 0);
  });
});

async function withChromium(fn) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    return;
  }
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

describe("composer media preview", () => {
  it("ignores 40px avatars and requires a large attached image", async () => {
    await withChromium(async (browser) => {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><body>
  <div role="dialog" aria-modal="true">
    <h2>Tạo bài viết</h2>
    <img alt="avatar" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="40" height="40" style="width:40px;height:40px">
  </div>
</body></html>`);
      assert.equal(await page.evaluate(inspectComposerMediaPreview), false);

      await page.setContent(`<!doctype html>
<html lang="vi"><body>
  <div role="dialog" aria-modal="true">
    <h2>Tạo bài viết</h2>
    <img alt="avatar" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="40" height="40" style="width:40px;height:40px">
    <img alt="preview" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="240" height="180" style="width:240px;height:180px">
  </div>
</body></html>`);
      assert.equal(await page.evaluate(inspectComposerMediaPreview), true);
    });
  });
});
