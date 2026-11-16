import { chromium } from "playwright-core";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r73";
const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.waitForTimeout(1200);

await page.click('.el-menu-item:has-text("患者信息")');
await page.waitForTimeout(900);
await page.locator('button:has-text("详情")').first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/d1-detail.png` });

// 登录码
await page.click('button:has-text("登录码")');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/d2-ticket.png` });
const qrSvg = await page.locator("#tkQr svg").count();
const ticketText = await page.locator(".el-dialog:visible").innerText();
await page.locator('.el-dialog:visible button:has-text("关闭")').click();
await page.waitForTimeout(600);

// 家属账号
await page.click('button:has-text("家属账号")');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/d3-family.png` });
const famEmpty = await page.locator(".el-dialog:visible").innerText();

console.log("二维码 SVG 节点:", qrSvg);
console.log("登录码弹窗:", ticketText.split("\n").slice(0, 5).join(" | "));
console.log("家属弹窗:", famEmpty.split("\n").slice(0, 6).join(" | "));
console.log("错误:", errors.length ? errors.slice(0, 5) : "无");
await browser.close();
