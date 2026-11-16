import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r74";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await page.fill('input[placeholder="管理员账号"]', "admin");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-aside", { timeout: 15000 });
await page.waitForTimeout(1500);

// 1. 医生新增弹窗
await page.click('button:has-text("新增账号")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/b1-doctor-dialog.png` });
const dlgText = await page.locator(".el-dialog:visible").first().innerText();
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 2. 角色编辑弹窗
await page.click('.el-menu-item:has-text("角色管理")');
await page.waitForTimeout(1200);
await page.locator('.el-table__body tr:has-text("医生")').first().locator("button:has-text('编辑')").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/b2-role-dialog.png` });
const treeChecked = await page.locator(".el-tree .el-checkbox.is-checked").count();
const roleText = await page.locator(".el-dialog:visible").first().innerText();
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 3. 评估明细弹窗
await page.click('.el-menu-item:has-text("评估数据")');
await page.waitForTimeout(1400);
await page.locator(".el-table__body tr").first().locator("button:has-text('查看')").click();
await page.waitForTimeout(1300);
await page.screenshot({ path: `${OUT}/b3-assess-dialog.png` });
const assessText = await page.locator(".el-dialog:visible").first().innerText();
await page.keyboard.press("Escape");

console.log("新增账号弹窗:", dlgText.replace(/\n/g, " | ").slice(0, 260));
console.log("角色弹窗:", roleText.replace(/\n/g, " | ").slice(0, 200));
console.log("权限树已勾选节点数:", treeChecked);
console.log("评估明细弹窗:", assessText.replace(/\n/g, " | ").slice(0, 300));
console.log("错误:", errors.length ? errors.slice(0, 5) : "无");
await browser.close();
