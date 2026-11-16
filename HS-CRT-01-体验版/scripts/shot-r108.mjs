/**
 * 第 108 轮核对：伦敦塔测验（TOL）—— 题库步数、移珠交互、四项指标、连续 3 题停止
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 ~/.nvm/versions/node/v20.19.6/bin/node server/index.js
 * 再跑：node scripts/shot-r108.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const { TOL_CFG, TOL_ITEMS } = require("../server/tol-data.js");
const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r108");
fs.mkdirSync(SHOT, { recursive: true });

const bad = [];
const ok = (t, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${t}${e ? "  " + e : ""}`); if (!c) bad.push(t); };
const flat = (s) => (s || "").replace(/\s+/g, " ").trim();

/* ---------- 1. 状态空间 BFS：独立复算每题最少步数，并与 tol-data 的 min 比对 ---------- */
const CAPS = TOL_CFG.pegs.map((p) => p.cap);
const keyOf = (s) => s.map((p) => p.join(",")).join("|");
const allStates = [];
(function gen(i, cur) {
  if (i === TOL_CFG.beads.length) {
    const s = [[], [], []];
    cur.forEach((p, b) => s[p].push(b));
    allStates.push(s);
    return;
  }
  for (let p = 0; p < CAPS.length; p++) {
    if (cur.filter((x) => x === p).length >= CAPS[p]) continue;
    cur.push(p); gen(i + 1, cur); cur.pop();
  }
})(0, []);
const idxOf = new Map(allStates.map((s, i) => [keyOf(s), i]));
const adj = allStates.map((s) => {
  const out = [];
  for (let i = 0; i < CAPS.length; i++) {
    if (!s[i].length) continue;
    for (let j = 0; j < CAPS.length; j++) {
      if (i === j || s[j].length >= CAPS[j]) continue;
      const t = s.map((p) => p.slice());
      t[j].push(t[i].pop());
      out.push(idxOf.get(keyOf(t)));
    }
  }
  return out;
});
function bfsPath(start, goal) {
  const si = idxOf.get(keyOf(start)), gi = idxOf.get(keyOf(goal));
  const prev = new Array(allStates.length).fill(-2);
  prev[si] = -1;
  const q = [si];
  while (q.length) {
    const u = q.shift();
    if (u === gi) break;
    for (const v of adj[u]) if (prev[v] === -2) { prev[v] = u; q.push(v); }
  }
  if (prev[gi] === -2) return null;
  const path = [];
  for (let v = gi; v !== -1; v = prev[v]) path.push(allStates[v]);
  path.reverse();
  /* 相邻两态求"从哪根柱到哪根柱" */
  const moves = [];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    let from = -1, to = -1;
    for (let i = 0; i < CAPS.length; i++) {
      if (b[i].length === a[i].length + 1) to = i;
      if (a[i].length === b[i].length + 1) from = i;
    }
    moves.push([from, to]);
  }
  return moves;
}
console.log("== 题库校验（BFS 复算） ==");
for (const it of TOL_ITEMS) {
  const p = bfsPath(it.start, it.goal);
  ok(`${it.id} 最少步数 ${it.min}`, p && p.length === it.min, p ? "复算 " + p.length : "不可达");
}
ok("正式题 10 道、练习 2 道", TOL_ITEMS.filter((x) => !x.prac).length === 10 && TOL_ITEMS.filter((x) => x.prac).length === 2);
ok("正式题最少步数覆盖 3–7", (() => {
  const s = new Set(TOL_ITEMS.filter((x) => !x.prac).map((x) => x.min));
  return [3, 4, 5, 6, 7].every((d) => s.has(d));
})());

/* ---------- 2. 建临时评估 ---------- */
const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json()).then((j) => j.data);
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

const pats = (await get("/patients")).list || (await get("/patients"));
const running = new Set(((await get("/assessments")) || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const mk = await post("/assessments", {
  patientId: target.id, planName: "TOL 施测核对（临时）", planId: 0,
  items: [{ type: "paradigm", code: "TOL", name: "伦敦塔测验（TOL）" }], mode: "doctor",
});
ok("创建临时评估", mk.code === 0, mk.message || "");
const rid = mk.data.recordId;

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript((tk) => { try { localStorage.setItem("hs_tk", tk); } catch (e) { } }, TK);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));
await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(1200);

/* ---------- 3. 初始界面 ---------- */
const tag = async () => flat(await page.locator(".tol-tag").innerText());
const tip = async () => flat(await page.locator(".tol-tip").innerText());
const moves = async () => Number(flat(await page.locator(".tol-mv").innerText()).replace(/\D/g, ""));
const pegCount = (sel) => page.locator(`${sel} .tol-peg`).count();
const beadCounts = (sel) => page.locator(`${sel} .tol-peg`).evaluateAll(
  (els) => els.map((e) => e.querySelectorAll(".tol-bead").length));

ok("首屏为练习 1 / 2", await tag() === "练习 1 / 2", await tag());
ok("左盘 3 根柱子", (await pegCount(".tol-pane:not(.goal)")) === 3);
ok("右盘 3 根柱子", (await pegCount(".tol-pane.goal")) === 3);
ok("左盘起始 3 珠全在 A 柱", JSON.stringify(await beadCounts(".tol-pane:not(.goal)")) === "[3,0,0]",
  JSON.stringify(await beadCounts(".tol-pane:not(.goal)")));
ok("右盘目标为 A2 + B1", JSON.stringify(await beadCounts(".tol-pane.goal")) === "[2,1,0]",
  JSON.stringify(await beadCounts(".tol-pane.goal")));
const colH = await page.locator(".tol-pane:not(.goal) .tol-rod").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
ok("三根柱子长度不同", new Set(colH).size === 3, JSON.stringify(colH));
ok("右侧本题评分显示 0 / 10", /0\s*\/\s*10/.test(flat(await page.locator(".qx-panel .qx-score-hd").innerText())),
  flat(await page.locator(".qx-panel .qx-score-hd").innerText()));
const asideTxt = flat(await page.locator(".qx-panel").innerText());
ok("右侧列出四项主要指标",
  ["总正确数", "总步数", "总计划时间", "总执行时间"].every((k) => asideTxt.includes(k)), asideTxt.slice(0, 80));
ok("右侧进度格只列 10 道正式题（练习不占序号）", (await page.locator(".qx-panel .bn-grid i").count()) === 10,
  String(await page.locator(".qx-panel .bn-grid i").count()));
ok("进度格下注明练习不计分", /练习 2 题不计分/.test(flat(await page.locator(".qx-panel").innerText())),
  flat(await page.locator(".qx-panel").innerText()).slice(0, 40));
await page.screenshot({ path: path.join(SHOT, "01-play-01.png") });

/* ---------- 4. 交互：点柱选珠 → 点目标柱 ---------- */
const clickPeg = async (i, sel = ".tol-pane:not(.goal)") => {
  await page.locator(`${sel} .tol-peg`).nth(i).click();
  await page.waitForTimeout(90);
};
await clickPeg(1);                                   // 点空柱 → 提示
ok("点空柱给提示", /空的/.test(await tip()), await tip());
await clickPeg(0);                                   // 选中 A（最上面是绿珠）
ok("选中柱子后进入待移动状态", (await page.locator(".tol-pane:not(.goal) .tol-peg.sel").count()) === 1);
await clickPeg(1);                                   // 绿珠移到 B
ok("一步移动后已走 1 步", (await moves()) === 1, String(await moves()));
ok("P1 目标达成（A2 B1）", JSON.stringify(await beadCounts(".tol-pane:not(.goal)")) === "[2,1,0]",
  JSON.stringify(await beadCounts(".tol-pane:not(.goal)")));
ok("完成提示写明用了几步", /完成 · 用了 1 步/.test(await tip()), await tip());
ok("完成后右侧本题评分为 1？练习不计分 → 仍 0",
  /0\s*\/\s*10/.test(flat(await page.locator(".qx-panel .qx-score-hd").innerText())));
await page.screenshot({ path: path.join(SHOT, "02-play-01-done.png") });

/* 下一题 */
const nextBtn = () => page.locator(".tol-acts .tol-btn.primary");
await nextBtn().click();
await page.waitForTimeout(500);
ok("进入练习 2", (await tag()) === "练习 2 / 2", await tag());

/* ---------- 5. 容量限制 ---------- */
await clickPeg(0); await clickPeg(2);   // 把 A 上的珠移到 C（C 容量 2）
await clickPeg(0); await clickPeg(2);   // 再移一颗 → C 满
const cBeads = (await beadCounts(".tol-pane:not(.goal)"))[2];
ok("C 柱装到 2 颗", cBeads === 2, String(cBeads));
const before = await beadCounts(".tol-pane:not(.goal)");
await clickPeg(1); await clickPeg(2);   // B 上还有 1 颗 → 往满的 C 放，应拒绝
ok("C 柱满后拒绝第 3 颗并提示", /放不下/.test(await tip()) && JSON.stringify(await beadCounts(".tol-pane:not(.goal)")) === JSON.stringify(before), await tip());

/* ---------- 6. 重来本题 ---------- */
await page.locator(".tol-acts .tol-btn").first().click();
await page.waitForTimeout(400);
ok("重来本题：盘面回到起点", JSON.stringify(await beadCounts(".tol-pane:not(.goal)")) === "[2,1,0]",
  JSON.stringify(await beadCounts(".tol-pane:not(.goal)")));
ok("重来本题：步数归零", (await moves()) === 0, String(await moves()));

/* ---------- 7. 逐题作答 ---------- */
async function play(itemIdx, detour = 0) {
  const it = TOL_ITEMS[itemIdx];
  const p = bfsPath(it.start, it.goal);
  /* 先绕路：把 A 最上面的珠子 A→B→A，走 2 步无效步 */
  for (let d = 0; d < detour; d++) {
    await clickPeg(0); await clickPeg(1);
    await clickPeg(1); await clickPeg(0);
  }
  for (const [from, to] of p) {
    await clickPeg(from); await clickPeg(to);
  }
  return p.length + detour * 2;
}

console.log("== 正式作答 ==");
/* 练习 2（2 步，最快解） */
await play(1, 0);
ok("练习 2 完成", /完成/.test(await tip()), await tip());
await nextBtn().click(); await page.waitForTimeout(450);
ok("进入正式第 1 题", (await tag()) === "第 1 / 10 题", await tag());
await page.waitForTimeout(1300);                 // 计划时间留痕

/* T1：最少步数正确 */
await play(2, 0);
ok("T1 用最少步数完成", /完成 · 用了 3 步（最少 3 步），正确/.test(await tip()), await tip());
ok("本题评分变为 1 / 10", /1\s*\/\s*10/.test(flat(await page.locator(".qx-panel .qx-score-hd").innerText())),
  flat(await page.locator(".qx-panel .qx-score-hd").innerText()));
const planTxt = flat(await page.locator(".tol-tm").innerText());
ok("计划时间已计入（>0 秒）", !/计划 0 秒/.test(planTxt), planTxt);
await page.screenshot({ path: path.join(SHOT, "03-formal-01-ok.png") });

/* T2：绕 2 步 → 非最少步数 */
await nextBtn().click(); await page.waitForTimeout(400);
await play(3, 1);
ok("T2 多走 2 步后不算正确", /未用最少步数/.test(await tip()), await tip());
ok("本题评分仍 1", /1\s*\/\s*10/.test(flat(await page.locator(".qx-panel .qx-score-hd").innerText())));

/* T3：绕 2 步 */
await nextBtn().click(); await page.waitForTimeout(400);
await play(4, 1);
ok("连续不正确 2 题后仍未停止", /下一题/.test(flat(await nextBtn().innerText())), await flat(await nextBtn().innerText()));

/* T4：绕 2 步 → 连续 3 题，按钮变「结束测验」 */
await nextBtn().click(); await page.waitForTimeout(400);
await play(5, 1);
ok("连续 3 题未正确解决 → 按钮改为「结束测验」", /结束测验/.test(flat(await nextBtn().innerText())),
  await flat(await nextBtn().innerText()));
await page.screenshot({ path: path.join(SHOT, "04-streak3.png") });

/* ---------- 8. 结束 → 落库 ---------- */
await nextBtn().click();
await page.waitForTimeout(1500);
const saved = (await get(`/assessments/${rid}/answers?code=TOL`)) || {};
const a = saved.L1 || {};
console.log("  作答：", JSON.stringify({ correct: a.correct, extra: a.extra, planSec: a.planSec, execSec: a.execSec, rows: (a.rows || []).length }));
ok("作答已保存（2 练习 + 4 正式 = 6 条记录）", (a.rows || []).length === 6, String((a.rows || []).length));
ok("练习记录标了 prac、正式记录不计 prac",
  (a.rows || []).filter((r) => r.prac).length === 2 && (a.rows || []).filter((r) => !r.prac).length === 4);
ok("总正确数 = 1", a.correct === 1, String(a.correct));
ok("总步数 = 3 题各多 2 步 = 6", a.extra === 6, String(a.extra));
ok("总计划时间 > 0", Number(a.planSec) > 0, String(a.planSec));
ok("总执行时间 > 0", Number(a.execSec) > 0, String(a.execSec));
ok("正式题都记了 plan / exec / moves / min（最少 3–7 步）",
  (a.rows || []).filter((r) => !r.prac).every((r) => r.plan >= 0 && r.exec >= 0 && r.moves >= r.min && r.min >= 3 && r.min <= 7));

const rv = (await get(`/assessments/${rid}/review`)) || {};
const pj = (rv.projects || []).find((x) => x.code === "TOL");
ok("评分页取到 TOL 项目", !!pj);
ok("评分页 1 题 · 满分 10", pj && pj.items.length === 1 && pj.items[0].max === 10,
  pj ? `items=${pj.items.length}, max=${pj.items[0].max}` : "");
ok("评分页预填 1 分", pj && Number(pj.items[0].score) === 1, pj ? String(pj.items[0].score) : "");
ok("评分页项目合计 1 / 10", pj && Number(pj.total) === 1 && Number(pj.max) === 10, pj ? `${pj.total}/${pj.max}` : "");
ok("评分页携带四项指标口径", pj && pj.guide && ["总正确数", "总步数", "总计划时间", "总执行时间"].every((k) => String(pj.guide.score || "").includes(k)),
  pj && pj.guide ? String(pj.guide.score).slice(0, 60) : "");

await page.screenshot({ path: path.join(SHOT, "05-finished.png") });
await browser.close();

const del = await post(`/assessments/${rid}/cancel`, { reason: "TOL 施测核对脚本产生的临时评估，核对完成后清理" });
if (del.code === 0) console.log(`清理临时评估 #${rid}`);
console.log(bad.length ? `\n未通过 ${bad.length} 项：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
