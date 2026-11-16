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
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/a0-login.png` });
await page.fill('input[placeholder="管理员账号"]', "admin");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-aside", { timeout: 15000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/a1-doctors.png` });

const menu = async (name, file) => {
  await page.click(`.el-menu-item:has-text("${name}")`);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${OUT}/${file}` });
  return page.locator(".lb-main").innerText();
};

const t1 = await menu("患者管理", "a2-patients.png");
const t2 = await menu("评估数据", "a3-assess.png");
const t3 = await menu("训练记录", "a4-train.png");
const t4 = await menu("用户管理", "a5-accounts.png");
const t5 = await menu("角色管理", "a6-roles.png");
const t6 = await menu("项目配置", "a7-catalog.png");
const t7 = await menu("字典管理", "a8-dict.png");

console.log("患者管理:", t1.split("\n").slice(0, 8).join(" | "));
console.log("评估数据:", t2.split("\n").slice(0, 8).join(" | "));
console.log("训练记录:", t3.split("\n").slice(0, 8).join(" | "));
console.log("用户管理:", t4.split("\n").slice(0, 8).join(" | "));
console.log("角色管理:", t5.split("\n").slice(0, 8).join(" | "));
console.log("项目配置:", t6.split("\n").slice(0, 6).join(" | "));
console.log("字典管理:", t7.split("\n").slice(0, 6).join(" | "));
console.log("错误:", errors.length ? errors.slice(0, 8) : "无");
await browser.close();
