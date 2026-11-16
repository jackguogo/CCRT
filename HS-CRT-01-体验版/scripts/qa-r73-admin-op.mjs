import { chromium } from "playwright-core";

const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await page.fill('input[placeholder="管理员账号"]', "admin");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-aside", { timeout: 15000 });
await page.waitForTimeout(1000);

const log = (s) => console.log("· " + s);

// 1. 字典：新增
await page.click('.el-menu-item:has-text("字典管理")');
await page.waitForTimeout(800);
await page.click('button:has-text("新增字典项")');
await page.waitForTimeout(500);
await page.fill('.el-dialog input[placeholder="如 神经内科"]', "测试科室X");
await page.click('.el-dialog button:has-text("保存")');
await page.waitForTimeout(900);
const hasNew = await page.locator('.el-table__row:has-text("测试科室X")').count();
log("字典新增：" + (hasNew ? "通过" : "失败"));

// 2. 字典：停用
const row = page.locator('.el-table__row:has-text("测试科室X")');
await row.locator('button:has-text("停用")').click();
await page.waitForTimeout(800);
const stopped = await row.locator('.el-tag:has-text("停用")').count();
log("字典停用：" + (stopped ? "通过" : "失败"));

// 3. 字典：删除
await page.locator('.el-table__row:has-text("测试科室X")').locator('button:has-text("删除")').click();
await page.waitForTimeout(400);
await page.click('.el-message-box button:has-text("确定")');
await page.waitForTimeout(900);
const gone = await page.locator('.el-table__row:has-text("测试科室X")').count();
log("字典删除：" + (!gone ? "通过" : "失败"));

// 4. 医生管理：筛选
await page.click('.el-menu-item:has-text("医生管理")');
await page.waitForTimeout(800);
await page.fill('input[placeholder="姓名 / 账号 / 电话"]', "张");
await page.click('button:has-text("查询")');
await page.waitForTimeout(800);
const docRows = await page.locator('.el-table__row').count();
log("医生筛选：" + (docRows === 1 ? "通过（1 条）" : "失败（" + docRows + " 条）"));

// 5. 患者管理：停用再启用
await page.click('.el-menu-item:has-text("患者管理")');
await page.waitForTimeout(900);
const before = await page.locator('.el-table__row').count();
const firstRow = page.locator('.el-table__row').first();
await firstRow.locator('button:has-text("停用")').click();
await page.waitForTimeout(400);
await page.click('.el-message-box button:has-text("确定")');
await page.waitForTimeout(900);
const afterTag = await page.locator('.el-table__row').first().locator('.el-tag:has-text("停用")').count();
log("患者停用：" + (afterTag ? "通过" : "失败") + "（" + before + " 行）");
await page.locator('.el-table__row').first().locator('button:has-text("启用")').click();
await page.waitForTimeout(400);
await page.click('.el-message-box button:has-text("确定")');
await page.waitForTimeout(900);
const backTag = await page.locator('.el-table__row').first().locator('.el-tag:has-text("正常")').count();
log("患者启用：" + (backTag ? "通过" : "失败"));

// 6. 评估数据：时间筛选
await page.click('.el-menu-item:has-text("评估数据")');
await page.waitForTimeout(900);
const totalAll = await page.locator('.hint:has-text("共")').innerText();
await page.click('button:has-text("近 7 天")');
await page.waitForTimeout(900);
const total7 = await page.locator('.hint:has-text("共")').innerText();
log("时间筛选：全部 " + totalAll + " → 近 7 天 " + total7);

console.log("错误:", errors.length ? errors.slice(0, 5) : "无");
await browser.close();
