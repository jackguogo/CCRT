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
await page.click('.el-dialog:visible .el-table__body tbody tr:has-text("杨建国")');
await page.waitForSelector(".lb-pagehead .ph-t:has-text('训练方案')", { timeout: 15000 });
await page.waitForTimeout(1500);

const probe = () => page.evaluate(() => ({
  wrappers: [...document.querySelectorAll(".lb-card .el-select__wrapper")].map(w => w.className.includes("is-disabled")),
  add: [...document.querySelectorAll(".lb-card button")].filter(b => b.innerText.trim() === "加入").map(b => b.disabled),
  btns: [...document.querySelectorAll(".lb-card button")].filter(b => /生成|推送/.test(b.innerText)).map(b => b.innerText.trim() + (b.disabled ? "(禁用)" : "")),
}));

console.log("生成前:", JSON.stringify(await probe()));
await page.click('.lb-card button:has-text("生成训练方案")');
await page.waitForTimeout(1800);
console.log("生成后:", JSON.stringify(await probe()));

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
