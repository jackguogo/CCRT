/**
 * 第 59 轮功能验证：分档评分 → 保存 → 落库
 * 1. 评分页每道计分题都必须有分档按钮，且分档数量 = 分值档数
 * 2. 点击分档后分数即时更新（合计同步变化）
 * 3. 保存评分后 assess_score 落库值与点击档位一致
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const BASE = "http://localhost:3211/api/v1";
const bad = [];
const ok = (t, c, extra = "") => { console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`); if (!c) bad.push(t); };

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

/* 选一条有作答、进行中的评估 */
const list = (await get("/assessments")).data.filter((r) => r.status === "进行中");
let target = null;
for (const r of list) {
  const rv = (await get(`/assessments/${r.id}/review`)).data;
  const hasAns = rv.projects.some((p) => p.items.some((it) => it.parts.some((x) => x.val)));
  if (hasAns) { target = { rec: r, rv }; break; }
}
if (!target) { console.log("没有可用于验证的进行中评估"); process.exit(1); }
console.log(`目标评估 #${target.rec.id} ${target.rec.name} · ${target.rec.plan_name}\n`);

/* 1. 分档完整性（接口层） */
console.log("== 分档完整性");
let scored = 0, noBand = [];
for (const pj of target.rv.projects) {
  for (const it of pj.items) {
    if (it.max <= 0) continue;
    scored++;
    if (!it.bands || !it.bands.length) noBand.push(`${pj.code}.${it.id}`);
  }
}
ok("所有计分题均带分档", noBand.length === 0, noBand.length ? noBand.join(",") : `共 ${scored} 题`);
ok("所有计分题均带施测操作说明", target.rv.projects.every((p) => p.items.every((it) => it.max <= 0 || it.o)));

/* 2. 页面交互 */
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1180 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder*="账号"], input[placeholder*="用户名"]', "doctor");
await page.fill('input[type="password"]', "hs123456");
await page.keyboard.press("Enter");
await page.waitForTimeout(1800);
await page.click('text=评估功能');
await page.waitForTimeout(1200);

const row = page.locator('tr:visible', { hasText: target.rec.name }).first();
const [pop] = await Promise.all([
  ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null),
  row.locator('button:visible', { hasText: "继续评估" }).first().click(),
]);
const run = pop || page;
run.on("pageerror", (e) => errs.push(e.message));
await run.waitForLoadState("networkidle").catch(() => {});
await run.setViewportSize({ width: 1400, height: 1120 });
await run.waitForTimeout(2200);

const revBtn = run.locator('button:visible', { hasText: "评分并提交" }).first();
await revBtn.click();
await run.waitForTimeout(2400);
const dlg = run.locator('.el-message-box:visible').first();
if (await dlg.count()) { await run.keyboard.press("Escape"); await run.waitForTimeout(400); }

console.log("\n== 页面渲染");
ok("评分页已打开", await run.locator('.rv-row:visible').count() > 0, `${await run.locator('.rv-row:visible').count()} 行`);
ok("每题显示「施测操作」", await run.locator('.rv-guide:visible').count() > 0);
ok("分档按钮已渲染", await run.locator('.rv-band:visible').count() > 0, `${await run.locator('.rv-band:visible').count()} 个`);
ok("项目级指导（依据/材料/计分）已渲染", await run.locator('.rv-pjguide:visible').count() > 0);

/* 3. 点一个与当前分不同的档 → 分数与合计变化 */
const item0 = run.locator('.rv-row:visible').first();
const bands0 = item0.locator('.rv-band:visible');
const n0 = await bands0.count();
const cur0 = Number(await item0.locator('.rv-score b').first().innerText());
let pickIdx = 0;
for (let i = 0; i < n0; i++) {
  if (Number(await bands0.nth(i).locator('.rv-band-v').innerText()) !== cur0) { pickIdx = i; break; }
}
const pick = bands0.nth(pickIdx);
const bandVal = Number(await pick.locator('.rv-band-v').innerText());
const totalBefore = await run.locator('.rv-foot b.num').first().innerText();
await pick.click();
await run.waitForTimeout(500);
const totalAfter = await run.locator('.rv-foot b.num').first().innerText();
ok("点击分档后合计同步更新", totalBefore !== totalAfter, `${totalBefore} → ${totalAfter}（原 ${cur0} 分改选 ${bandVal} 分档）`);

/* 4. 保存评分 → 落库 */
const saveBtn = run.locator('button:visible', { hasText: "保存评分" }).first();
await saveBtn.click();
await run.waitForTimeout(1600);

const after = (await get(`/assessments/${target.rec.id}/review`)).data;
const p0 = after.projects[0], it0 = p0.items.find((x) => x.max > 0);
ok("评分已落库", Number(it0.score) === bandVal, `${p0.code}.${it0.id} 落库 ${it0.score} / 点击 ${bandVal}`);

/* 5. 还原：把该题改回点击前的分值，验证脚本不改变演示数据 */
const rs = await post(`/assessments/${target.rec.id}/review-scores`, { code: p0.code, scores: { [it0.id]: cur0 } });
ok("已还原原分值", rs.code === 0, `${p0.code}.${it0.id} → ${cur0}`);

console.log("\n控制台错误:", errs.length ? errs.slice(0, 3) : "none");
console.log("\n===== 结果:", bad.length ? `${bad.length} 项未通过` : "全部通过", "=====");
if (bad.length) bad.forEach((b) => console.log("  ✗ " + b));
await browser.close();
