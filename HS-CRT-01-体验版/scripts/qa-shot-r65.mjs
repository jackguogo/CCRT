/**
 * 第 65 轮截图：三态数据在页面上的呈现
 * 1 评估情况表（含已作废）  2 训练情况表  3 患者详情·刘志远（刚生成未训练）
 * 4 数据记录·训练明细      5 方案管理
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r65";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder*="账号"], input[placeholder*="用户名"]', "doctor");
await page.fill('input[type="password"]', "hs123456");
await page.keyboard.press("Enter");
await page.waitForTimeout(1800);

const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("✓", name); };

/* 1. 评估情况表 */
await page.click('text=评估功能');
await page.waitForTimeout(1200);
await shot("01-assess-list");

/* 2. 训练情况表 */
await page.click('text=训练功能');
await page.waitForTimeout(1200);
await shot("02-train-list");
// 已完成 tab
const doneTab = page.locator('.el-tabs__item:visible', { hasText: "已完成" }).first();
if (await doneTab.count()) { await doneTab.click(); await shot("03-train-done"); }

/* 3. 患者详情 · 刘志远（刚生成未训练） */
await page.click('text=患者信息');
await page.waitForTimeout(1000);
await page.fill('input[placeholder="姓名 / 门诊号 / 手机号"]', "刘志远");
await page.keyboard.press("Enter");
await page.waitForTimeout(1000);
await shot("04-patient-search");
const detail = page.locator('button:visible', { hasText: "详情" }).first();
if (await detail.count()) { await detail.click(); await page.waitForTimeout(1500); await shot("05-patient-detail-liu"); }

/* 4. 数据记录 · 训练明细（李文秀） */
await page.click('text=数据记录');
await page.waitForTimeout(1200);
await shot("06-records-assess");

/* 5. 方案管理 */
await page.click('text=方案管理');
await page.waitForTimeout(1200);
await shot("07-plan-lib");

await browser.close();
