import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForSelector(".el-table__row", { timeout: 10000 });
await page.click('.el-radio-button:has-text("审核中")');
await page.waitForTimeout(700);
await page.click('.el-table__body-wrapper .el-table__row button:has-text("审核评估")');
await page.waitForSelector(".rv-foot", { timeout: 15000 });
await page.waitForTimeout(1000);

// 底部「保存评分」应能独立工作
await page.click('.rv-foot button:has-text("保存评分")');
await page.waitForTimeout(1500);
const savedMsg = await page.$$eval(".el-message", (els) => els.map((e) => e.innerText.trim())).catch(() => []);

// 底部「完成审核并生成报告」→ 应弹出确认框
await page.click('.rv-foot button:has-text("完成审核并生成报告")');
await page.waitForTimeout(1200);
const confirmBox = await page.$(".el-message-box");
const confirmText = confirmBox ? await confirmBox.innerText() : null;

// 取消，不改变数据
if (confirmBox) {
  await page.click(".el-message-box__btns button:not(.el-button--primary)").catch(() => {});
  await page.waitForTimeout(600);
}
const stillReview = await page.$(".rv-foot");

// 校验状态未被改动
const statusAfter = await page.evaluate(async () => {
  const r = await fetch("/api/v1/assessments?status=审核中", { headers: { Authorization: "Bearer " + localStorage.getItem("hs_tk") } });
  const j = await r.json();
  return (j.data || []).length;
});

console.log(JSON.stringify({ savedMsg, confirmText, stillOnReviewPage: !!stillReview, reviewingCount: statusAfter, errors }, null, 2));
await browser.close();
