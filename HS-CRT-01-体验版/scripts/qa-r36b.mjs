import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1200);
await page.click('#sec-train-list button:has-text("选择患者配置训练方案")');
await page.waitForTimeout(1200);
await page.click('.el-dialog__wrapper:not([style*=none]) .el-table__body tbody tr:has-text("杨建国")');
await page.waitForSelector(".lb-pagehead .ph-t:has-text('训练方案')", { timeout: 15000 });
await page.waitForTimeout(1500);

const before = await page.evaluate(() => ({
  add: [...document.querySelectorAll(".lb-card button")].filter(b => b.innerText.trim() === "加入").map(b => b.disabled),
  selects: [...document.querySelectorAll(".lb-card .el-select")].length,
  selDisabled: [...document.querySelectorAll(".lb-card .el-select")].map(s => s.className.includes("is-disabled")),
}));
console.log("生成前 加入按钮 disabled:", JSON.stringify(before.add), "| 下拉禁用:", JSON.stringify(before.selDisabled));

await page.click('.lb-card button:has-text("生成训练方案")');
await page.waitForTimeout(1800);

const after = await page.evaluate(() => ({
  add: [...document.querySelectorAll(".lb-card button")].filter(b => b.innerText.trim() === "加入").map(b => b.disabled),
  selDisabled: [...document.querySelectorAll(".lb-card .el-select")].map(s => s.className.includes("is-disabled")),
  swDisabled: [...document.querySelectorAll(".lb-card .el-switch")].map(s => s.className.includes("is-disabled")),
  btns: [...document.querySelectorAll(".lb-card button")].filter(b => /生成|推送/.test(b.innerText)).map(b => b.innerText.trim() + (b.disabled ? "(禁用)" : "")),
}));
console.log("生成后 加入按钮 disabled:", JSON.stringify(after.add), "| 下拉禁用:", JSON.stringify(after.selDisabled), "| 开关禁用:", JSON.stringify(after.swDisabled));
console.log("按钮:", JSON.stringify(after.btns));

// 生成后弹窗不应再列出杨建国（已有待推送方案）
await page.click('.lb-pagehead .ph-a button:has-text("返回")');
await page.waitForTimeout(1200);
await page.click('#sec-train-list button:has-text("选择患者配置训练方案")');
await page.waitForTimeout(1200);
const names = await page.evaluate(() => [...document.querySelectorAll(".el-dialog__wrapper:not([style*=none]) .el-table__body tbody tr")].map(tr => tr.querySelectorAll("td")[1]?.innerText.trim()));
console.log("弹窗患者:", JSON.stringify(names), "| 含杨建国:", names.includes("杨建国"));

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
