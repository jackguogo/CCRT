import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r73";
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
await page.screenshot({ path: `${OUT}/a1-dashboard.png` });

const menu = async (name, file) => {
  await page.click(`.el-menu-item:has-text("${name}")`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${file}` });
  return page.locator(".lb-main").innerText();
};

const t1 = await menu("医生管理", "a2-doctors.png");
const t2 = await menu("患者管理", "a3-patients.png");
const t3 = await menu("评估数据", "a4-assess.png");
const t4 = await menu("训练记录", "a5-train.png");
const t5 = await menu("基础设置", "a6-settings.png");
const t6 = await menu("角色管理", "a7-roles.png");
const t7 = await menu("字典管理", "a8-dict.png");

// 项目配置：三个 tab + 参数弹窗
await page.click('.el-menu-item:has-text("项目配置")');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/a9-catalog-scale.png` });
const scaleRows = await page.locator(".el-table__body tr").count();
const scaleText = await page.locator(".lb-main").innerText();

await page.click('.el-tabs__item:has-text("范式评估")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/a10-catalog-paradigm.png` });
const paraRows = await page.locator(".el-table__body tr").count();

await page.click('.el-tabs__item:has-text("训练方案")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/a11-catalog-training.png` });
const trainRows = await page.locator(".el-table__body tr").count();

// 打开第一行参数弹窗
await page.locator(".el-table__body tr").first().locator("button:has-text('参数')").click();
await page.waitForTimeout(900);
const dlgVisible = await page.locator(".el-dialog:visible").count();
await page.screenshot({ path: `${OUT}/a12-catalog-params.png` });
const dlgText = dlgVisible ? await page.locator(".el-dialog:visible").first().innerText() : "";
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

console.log("医生管理:", t1.split("\n").slice(0, 6).join(" | "));
console.log("患者管理:", t2.split("\n").slice(0, 6).join(" | "));
console.log("评估数据:", t3.split("\n").slice(0, 8).join(" | "));
console.log("训练记录:", t4.split("\n").slice(0, 8).join(" | "));
console.log("基础设置:", t5.split("\n").slice(0, 4).join(" | "));
console.log("角色管理:", t6.split("\n").slice(0, 6).join(" | "));
console.log("字典管理:", t7.split("\n").slice(0, 8).join(" | "));
console.log("量表评估行数:", scaleRows, "|", scaleText.split("\n").slice(0, 10).join(" / "));
console.log("范式评估行数:", paraRows);
console.log("训练方案行数:", trainRows);
console.log("参数弹窗:", dlgVisible ? dlgText.replace(/\n/g, " | ") : "未打开");
console.log("错误:", errors.length ? errors.slice(0, 6) : "无");
await browser.close();
