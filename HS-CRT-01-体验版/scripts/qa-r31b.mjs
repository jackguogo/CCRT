import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const R = {}, errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.waitForTimeout(1000);

// 工作台 → 登记患者
await page.click('.lb-banner .bt button:has-text("登记患者")');
await page.waitForTimeout(1000);
R.regDialog = await page.$$eval(".el-dialog__title", (els) => els.map((e) => e.innerText.trim()));
R.regFields = await page.$$eval(".el-dialog .el-form-item__label", (els) => els.map((e) => e.innerText.trim()));
await page.screenshot({ path: "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r31/03-reg-dialog.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(700);

// 工作台 → 方案管理
await page.click('.lb-banner .bt button:has-text("方案管理")');
await page.waitForTimeout(1200);
R.afterPlan = await page.$eval(".lb-pagehead .ph-t, .sec-bar-t", (e) => e.innerText.trim()).catch(() => null);

// 回工作台 → 查看全部
await page.click('.lb-aside .el-menu-item:has-text("工作台")');
await page.waitForTimeout(1000);
await page.click('.lb-card .head button:has-text("查看全部")');
await page.waitForTimeout(1200);
R.afterViewAll = {
  hasQueryCard: !!(await page.$(".query-card")),
  listTitle: await page.$eval(".list-card .head .t", (e) => e.innerText.trim()).catch(() => null),
  rows: await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (t) => t.length),
};

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
