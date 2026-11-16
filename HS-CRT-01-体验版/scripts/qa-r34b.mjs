import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const B = "http://localhost:3211";
const errors = [];

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(B + "/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

const dlgTitle = async () => page.evaluate(() => {
  const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
  return d ? d.querySelector(".el-dialog__title")?.innerText.trim() : null;
});
const closeDlg = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(500); };

// 1. 工作台「发起评估」→ 应走 assess 模式
await page.click('.lb-banner button:has-text("发起评估")');
await page.waitForTimeout(1000);
console.log("工作台发起评估弹窗:", await dlgTitle());
await closeDlg();

// 2. 评估功能「选择患者发起评估」→ assess 模式
await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForTimeout(1000);
await page.click('#sec-assess-list button:has-text("选择患者发起评估")');
await page.waitForTimeout(1000);
console.log("评估功能弹窗:", await dlgTitle());
await closeDlg();

// 3. 训练功能 → train 模式
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1000);
await page.click('#sec-train-list button:has-text("选择患者配置训练方案")');
await page.waitForTimeout(1000);
console.log("训练功能弹窗:", await dlgTitle());
const trainRows = await page.evaluate(() => {
  const d = [...document.querySelectorAll(".el-dialog")].find(x => x.offsetParent !== null);
  return d ? d.querySelectorAll(".el-table__body tbody tr").length : 0;
});
console.log("训练模式可选患者行数:", trainRows, "(assess 模式会排除进行中/审核中)");

// 4. 分页翻页
await closeDlg();
await page.click('.list-card .el-pager li:has-text("2")');
await page.waitForTimeout(700);
const p2 = await page.evaluate(() => {
  const tr = document.querySelector(".list-card .el-table__body tbody tr");
  return tr ? [...tr.querySelectorAll("td")].slice(0, 2).map(td => td.innerText.trim()) : null;
});
console.log("第2页首行(序号/姓名):", JSON.stringify(p2));

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
