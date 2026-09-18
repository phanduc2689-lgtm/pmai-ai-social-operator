import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { listChromeProfiles, pickLoggedInChromeProfile } from "./chrome-profiles.ts";

describe("chrome profiles", () => {
  it("prefers facebook-likely unlocked profile", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pmai-chrome-"));
    fs.mkdirSync(path.join(dir, "Default"));
    fs.mkdirSync(path.join(dir, "Profile 1", "Network"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "Local State"),
      JSON.stringify({
        profile: { info_cache: { Default: { name: "Work" }, "Profile 1": { name: "PM Travel" } } },
      }),
    );
    fs.writeFileSync(path.join(dir, "Profile 1", "Network", "Cookies"), Buffer.from("xxxx.facebook.comyyyy"));
    const list = listChromeProfiles(dir);
    assert.equal(list[0].displayName, "PM Travel");
    assert.equal(list[0].facebookLikely, true);
    const pick = pickLoggedInChromeProfile(list);
    assert.equal(pick?.directory, "Profile 1");
  });

  it("does not copy cookie bytes into the returned object", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pmai-chrome-"));
    fs.mkdirSync(path.join(dir, "Default", "Network"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Default", "Network", "Cookies"), Buffer.from("c_user=SECRETVALUE.facebook.com"));
    const list = listChromeProfiles(dir);
    assert.equal(JSON.stringify(list).includes("SECRETVALUE"), false);
  });
});
