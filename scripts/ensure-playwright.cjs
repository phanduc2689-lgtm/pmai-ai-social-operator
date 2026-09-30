"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const report = path.join(root, "node_modules", "playwright", "lib", "cli", "reportActions.js");

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

if (!fs.existsSync(report)) {
  fail(2, "Thieu Playwright. Se cai lai.");
}

const text = fs.readFileSync(report, "utf8");
if (!text.includes("use strict") || text.includes("declare function")) {
  fail(2, "File Playwright bi hong (reportActions.js). Se cai lai, khong chay npx playwright.");
}

try {
  require(path.join(root, "node_modules", "playwright"));
} catch (error) {
  fail(2, `Khong nap duoc Playwright: ${error && error.message ? error.message : error}`);
}

console.log("Playwright OK. PMAI dung Google Chrome da cai tren may, khong tai Chrome cua Playwright.");
