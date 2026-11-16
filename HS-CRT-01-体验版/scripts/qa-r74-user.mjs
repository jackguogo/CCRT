/**
 * 第 74 轮：医生端侧栏账号区（点击头像弹出「退出登录」）
 * 校验：
 *   1) 侧栏不再有「...」按钮
 *   2) 点头像弹出菜单，且只含「退出登录」
 *   3) 点姓名区同样弹出（整块可点）
 *   4) 菜单出现位置在侧栏上方（placement top）
 *   5) 点「退出登录」回到登录页
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r74";
fs.mkdirSync(OUT, { recursive: true });

const bad = [];
const ok = (t, c, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`);
  if (!c) bad.push(t);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));

try {
  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForSelector(".lb-banner");
  await page.waitForTimeout(500);

  /* 1. 「...」按钮已移除 */
  ok("侧栏无「...」按钮", (await page.locator(".lb-user .u-more").count()) === 0);

  /* 2. 点头像弹菜单 */
  const av = page.locator(".lb-user .el-avatar").first();
  ok("头像存在", (await av.count()) === 1);
  await av.click();
  await page.waitForTimeout(450);
  const items = await page.locator(".el-dropdown-menu:visible .el-dropdown-menu__item").allInnerTexts();
  ok("点「头像」弹出菜单", items.length > 0, JSON.stringify(items.map(s => s.trim())));
  ok("菜单只含「退出登录」", items.length === 1 && items[0].trim() === "退出登录");

  /* 3. 弹层在侧栏上方 */
  const pos = await page.evaluate(() => {
    const m = document.querySelector(".el-dropdown-menu");
    const u = document.querySelector(".lb-user");
    if (!m || !u) return null;
    const mr = m.getBoundingClientRect(), ur = u.getBoundingClientRect();
    return { mTop: Math.round(mr.top), mBottom: Math.round(mr.bottom), uTop: Math.round(ur.top) };
  });
  ok("弹层显示在账号区上方", pos && pos.mBottom <= pos.uTop + 8, JSON.stringify(pos));
  await page.screenshot({ path: `${OUT}/01-avatar-menu.png`, clip: { x: 0, y: 560, width: 420, height: 340 } });

  /* 4. 点姓名区也能弹出 */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  await page.locator(".lb-user .u .n").first().click();
  await page.waitForTimeout(450);
  const items2 = await page.locator(".el-dropdown-menu:visible .el-dropdown-menu__item").allInnerTexts();
  ok("点姓名区同样弹出", items2.length === 1, JSON.stringify(items2.map(s => s.trim())));

  /* 5. 退出登录 */
  await page.locator(".el-dropdown-menu:visible .el-dropdown-menu__item").first().click();
  await page.waitForTimeout(500);
  const box = page.locator(".el-message-box:visible").first();
  ok("弹出退出确认", (await box.count()) === 1);
  await page.locator(".el-message-box:visible button:has-text('确定')").first().click();
  await page.waitForTimeout(700);
  ok("退出后回到登录页", (await page.locator(".lg-book").count()) === 1);
  ok("token 已清除", (await page.evaluate(() => localStorage.getItem("hs_tk"))) === null);

  ok("无页面报错", errs.length === 0, errs.join(" | "));
} catch (e) {
  console.log("✗ 脚本异常", e.message);
  bad.push("脚本异常");
} finally {
  await browser.close();
}

console.log(bad.length ? `\n${bad.length} 项未通过：${bad.join("、")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
