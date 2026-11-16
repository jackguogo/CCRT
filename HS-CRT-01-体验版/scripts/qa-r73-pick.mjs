import { chromium } from "playwright-core";
import Database from "better-sqlite3";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r73";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

// 构造场景：家属账号与患者 2 共用同一手机号 → 登录时应返回候选列表
const db = new Database("/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/data/hscrt01.db");
const restore = () => db.prepare("UPDATE sys_user SET phone='13800000032' WHERE username='FAM-MZ260032'").run();
db.prepare("UPDATE sys_user SET phone='13800000002' WHERE username='FAM-MZ260032'").run();

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("http://localhost:3212/patient", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.fill("#lp", "13800000002");
  await page.click("#lcode");
  await page.waitForTimeout(1200);
  await page.click("#lgo");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/p10-pick.png` });

  const pickCount = await page.locator("#lpick [data-id]").count();
  const pickText = pickCount ? await page.locator("#lpick").innerText() : "(无候选)";

  let entered = false;
  if (pickCount) {
    await page.locator("#lpick [data-id]").first().click();
    await page.waitForTimeout(1800);
    entered = (await page.locator("#pbody").count()) > 0;
    await page.screenshot({ path: `${OUT}/p11-pick-enter.png` });
  }

  console.log("候选数量:", pickCount);
  console.log("候选列表:", pickText.replace(/\n/g, " | "));
  console.log("选择后进入任务页:", entered);
  console.log("错误:", errors.length ? errors.slice(0, 4) : "无");
} finally {
  restore();
  const row = db.prepare("SELECT phone FROM sys_user WHERE username='FAM-MZ260032'").get();
  console.log("数据已恢复，家属账号手机号:", row.phone);
  db.close();
  await browser.close();
}
