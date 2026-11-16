/**
 * 第 59 轮截图：评分页指导语 + 客观操作 + 分档评分；施测页主试提示
 * 说明：继续评估以新窗口打开 /doctor?run=<id>，需捕获 popup；过程中可能弹出 el-message-box 确认框。
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r59";
const PATIENT = process.env.PATIENT || "孙玉兰";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1180 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder*="账号"], input[placeholder*="用户名"]', "doctor");
await page.fill('input[type="password"]', "hs123456");
await page.keyboard.press("Enter");
await page.waitForTimeout(1800);

const shot = async (p, n) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("✓", n); };
const dismiss = async (p) => {
  const box = p.locator('.el-message-box:visible').first();
  if (await box.count()) {
    const cancel = box.locator('button:visible', { hasText: /稍后|取消|关闭/ }).first();
    if (await cancel.count()) await cancel.click();
    else await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
    return true;
  }
  return false;
};

await page.click('text=评估功能');
await page.waitForTimeout(1200);

const row = page.locator('tr:visible', { hasText: PATIENT }).first();
const [pop] = await Promise.all([
  ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null),
  row.locator('button:visible', { hasText: "继续评估" }).first().click(),
]);
const run = pop || page;
run.on("pageerror", (e) => errs.push("popup pageerror: " + e.message));
await run.waitForLoadState("networkidle").catch(() => {});
await run.setViewportSize({ width: 1400, height: 1120 });
await run.waitForTimeout(2200);
await shot(run, "01-run-cards");

/* MMSE 施测页 + 主试提示 */
const card = run.locator('.item-card:visible', { hasText: "MMSE" }).first();
const startBtn = card.locator('button:visible', { hasText: /开始评估|继续评估/ }).first();
if (await startBtn.count()) {
  await startBtn.click();
  await run.waitForTimeout(1600);
  await dismiss(run);
  await shot(run, "02-quiz-plain");
  const tip = run.locator('.quiz-tipbtn:visible').first();
  if (await tip.count()) { await tip.click(); await run.waitForTimeout(600); await shot(run, "03-quiz-tip"); }
  await run.locator('.quiz-quit:visible').first().click();
  await run.waitForTimeout(700);
  // 结束施测/自动衔接下一项都可能弹确认框；直接刷新回到执行页，避免遮罩残留
  await run.keyboard.press("Escape");
  await run.waitForTimeout(400);
  await run.reload({ waitUntil: "networkidle" });
  await run.waitForTimeout(2400);
} else {
  console.log("! MMSE 无开始按钮（可能已施测完成）");
}

/* 评分页 */
const revBtn = run.locator('button:visible', { hasText: "评分并提交" }).first();
if (await revBtn.count()) {
  await revBtn.click();
  await run.waitForTimeout(2200);
  await dismiss(run);
  await shot(run, "04-review-top");
  /* 评分页的滚动容器是 .el-main.lb-main（overflow:auto），不是 window：
     window.scrollTo 无效、scrollIntoView 对已部分可见的行也不滚动，都会拍出重复图。
     直接设容器 scrollTop 才能拿到不同位置的画面。 */
  const scrollMain = async (y) => {
    await run.evaluate((y) => {
      const el = document.querySelector(".el-main") || document.scrollingElement;
      if (el) el.scrollTop = y;
    }, y);
    await run.waitForTimeout(350);
  };
  await scrollMain(760);
  await shot(run, "05-review-items");
  /* 点一个与当前分不同的档位，才能拍出「选中态」；点已选中的档画面不会变化。
     选滚动后可见的第 3 行，保证选中变化出现在截图里。 */
  const picked = await run.evaluate(() => {
    const rows = [...document.querySelectorAll('.rv-row')].filter(r => r.querySelector('.rv-band'));
    const row = rows[2] || rows[0];
    if (!row) return null;
    const cur = Number((row.querySelector('.rv-score b') || {}).textContent || -1);
    const btns = [...row.querySelectorAll('.rv-band')];
    const t = btns.find(b => Number(b.querySelector('.rv-band-v').textContent) !== cur) || btns[0];
    if (!t) return null;
    t.click();
    return { from: cur, to: Number(t.querySelector('.rv-band-v').textContent) };
  });
  if (picked) console.log(`· 分档选中态：${picked.from} → ${picked.to}`);
  await run.waitForTimeout(400);
  await scrollMain(760);
  await shot(run, "06-review-bands");
  /* 长分档（>8 档，如 ADAS A06 的 13 档）走「分值按钮 + 选中档判据单行」降级形态；
     当前记录若没有长分档题则不写重复图。 */
  const longTop = await run.evaluate(() => {
    const el = [...document.querySelectorAll('.rv-band-wrap')].find(w => w.querySelectorAll('.rv-band').length > 8);
    if (!el) return null;
    const main = document.querySelector(".el-main");
    const r = el.getBoundingClientRect(), m = main ? main.getBoundingClientRect() : { top: 0 };
    return Math.max(0, el.offsetTop - 220);
  });
  if (longTop !== null) { await scrollMain(longTop); await shot(run, "07-review-longbands"); }
  else console.log("· 跳过 07-review-longbands（当前记录无 >8 档题目）");
} else {
  console.log("! 未找到「评分并提交」");
}

console.log("\n控制台错误:", errs.length ? errs.slice(0, 5) : "none");
await browser.close();
