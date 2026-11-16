import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r26";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForSelector(".el-table__row", { timeout: 10000 });
await page.click('.el-radio-button:has-text("审核中")');
await page.waitForTimeout(800);
await page.click('.el-table__body-wrapper .el-table__row button:has-text("审核评估")');
await page.waitForSelector(".rv-card", { timeout: 15000 });
await page.waitForTimeout(1200);

// 滚到第一处口述文本
await page.evaluate(() => {
  const el = document.querySelector(".rec-speech");
  if (el) el.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/06-review-speech.png` });

// 再往下滚，展示更多口述题
await page.evaluate(() => window.scrollBy(0, 340));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/09-review-speech2.png` });

console.log("done");
await browser.close();
