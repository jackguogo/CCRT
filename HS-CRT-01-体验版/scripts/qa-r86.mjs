/**
 * 第 86 轮：施测界面五项改造回归
 *   1) 「再听一遍」旁的声音开关（图标切换、静音后不再朗读）
 *   2) 查看评估 / 评估情况不再出现「依据《神经心理认知量表操作指南》…」
 *   3) 右侧主试面板整体可折叠，折叠后竖排入口可点开
 *   4) MoCA 第一题连线图按记录单原图排布（10 点 + 1→甲→2 虚线箭头）；第四题命名改为三只动物线描
 *   5) ADAS / IMCT / CCSE / AMT 与 MMSE、MoCA 同版式；ADAS 词表可切套并逐词打钩计分
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";
const OUT = "docs/shots-r86";
fs.mkdirSync(OUT, { recursive: true });

const bad = [];
const ok = (t, c, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`);
  if (!c) bad.push(t);
};

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then(r => r.json());
const H = { "Content-Type": "application/json", Authorization: "Bearer " + login.data.token };
const get = (p) => fetch(BASE + p, { headers: H }).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then(r => r.json());

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter(a => a.status === "进行中").map(a => a.patient_id));
const target = pats.find(p => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const CODES = [
  ["MMSE", "简易精神状态量表（MMSE）"], ["MoCA", "蒙特利尔认知评估量表（MoCA）"],
  ["ADAS", "阿尔茨海默病评定量表-认知部分（ADAS-Cog）"], ["IMCT", "常识-记忆-注意测验量表（IMCT）"],
  ["CCSE", "认知能力筛查量表（CCSE）"], ["AMT", "简易智力检测量表（AMTS）"],
];
const mk = await post("/assessments", {
  patientId: target.id, planName: "施测界面五项校验（临时）", planId: 0,
  items: CODES.map(([code, name]) => ({ type: "scale", code, name })), mode: "doctor",
});
if (mk.code !== 0) { console.log("创建临时评估失败", mk.message); process.exit(1); }
const rid = mk.data.recordId;
console.log(`临时评估 #${rid} · ${target.name}（p${target.id}）\n`);

/* ---------- 浏览器 ---------- */
const browser = await chromium.launch({ headless: true, executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((tk) => localStorage.setItem("hs_tk", tk), login.data.token);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", e => errors.push("pageerror: " + e.message));
p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });

await p.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

const startScale = async (code) => {
  const card = p.locator(".lb-card").filter({ hasText: code }).first();
  await card.locator("button", { hasText: /开始评估|继续评估/ }).first().click();
  await p.waitForTimeout(900);
};
const quitQuiz = async () => {
  await p.locator(".quiz-quit").click();
  await p.waitForTimeout(400);
  const btn = p.locator(".el-message-box__btns button", { hasText: "确认退出" });
  if (await btn.count()) await btn.first().click();
  await p.waitForTimeout(800);
};

/* ---------- 1 + 3. MMSE：声音开关 + 面板折叠 ---------- */
await startScale("MMSE");
ok("MMSE 进入主试版式", await p.locator(".qx-main").count() === 1);
ok("顶栏有两个朗读相关按钮（再听一遍 + 声音开关）", await p.locator(".quiz-top .quiz-sound").count() === 2);
ok("声音开关默认开启", await p.locator(".quiz-mute").evaluate(e => !e.classList.contains("off")));
await p.locator(".quiz-mute").click();
await p.waitForTimeout(200);
ok("点击后切换为静音态", await p.locator(".quiz-mute").evaluate(e => e.classList.contains("off")));
const muted = await p.evaluate(() => !!document.querySelector(".quiz-mute.off svg path"));
ok("静音图标已切换（斜杠版）", muted);
await p.locator(".quiz-mute").click();
await p.waitForTimeout(150);
ok("再次点击恢复开启", await p.locator(".quiz-mute").evaluate(e => !e.classList.contains("off")));

await p.screenshot({ path: `${OUT}/01-mmse-sound.png` });
ok("右侧面板默认展开", await p.locator(".qx-panel").isVisible());
ok("展开态不显示竖排入口", !(await p.locator(".qx-rail").isVisible()));
await p.locator(".qx-fold").click();
await p.waitForTimeout(300);
ok("点收起后面板隐藏", !(await p.locator(".qx-panel").isVisible()));
ok("折叠后出现竖排入口「评估要点」", (await p.locator(".qx-rail").isVisible()) && /评估要点/.test(await p.locator(".qx-rail").innerText()));
await p.screenshot({ path: `${OUT}/02-mmse-collapsed.png` });
await p.locator(".qx-rail").click();
await p.waitForTimeout(300);
ok("点竖排入口重新弹出面板", await p.locator(".qx-panel").isVisible());
const panelSections = await p.locator(".qx-panel .qx-lb").allInnerTexts();
ok("面板含「评估操作 / 注意 / 本题评分」", panelSections.some(x => x.includes("评估操作")) && panelSections.some(x => x.includes("注意")) && panelSections.some(x => x.includes("本题评分")), panelSections.join("/"));
await quitQuiz();

/* ---------- 4. MoCA：连线图与命名图 ---------- */
await startScale("MoCA");
const moca1 = await p.evaluate(() => {
  const svg = document.querySelector(".qx-fig svg");
  if (!svg) return null;
  return {
    circles: svg.querySelectorAll("circle").length,
    labels: [...svg.querySelectorAll("text")].map(t => t.textContent.trim()),
    dashed: [...svg.querySelectorAll("line")].filter(l => l.getAttribute("stroke-dasharray")).length,
    markers: svg.querySelectorAll("line[marker-end]").length,
  };
});
ok("MoCA 第一题：10 个圆点", moca1 && moca1.circles === 10, moca1 ? String(moca1.circles) : "无 svg");
const need = ["1", "2", "3", "4", "5", "甲", "乙", "丙", "丁", "戊"];
ok("MoCA 第一题：数字与汉字齐全", moca1 && need.every(l => moca1.labels.includes(l)), moca1 ? moca1.labels.join(" ") : "");
ok("MoCA 第一题：含「开始 / 结束」提示", moca1 && moca1.labels.includes("开始") && moca1.labels.includes("结束"));
ok("MoCA 第一题：2 条虚线箭头（1→甲、甲→2）", moca1 && moca1.dashed === 2 && moca1.markers === 2, moca1 ? `${moca1.dashed} 虚线 / ${moca1.markers} 箭头` : "");
await p.screenshot({ path: `${OUT}/03-moca-path.png` });

/* 逐题评分前进到第 4 题（命名） */
for (let i = 0; i < 3; i++) {
  await p.locator(".qx-band").first().click();
  await p.locator(".quiz-btn.primary").click();
  await p.waitForTimeout(350);
}
const animals = await p.evaluate(() => {
  const box = document.querySelector(".qx-animals");
  if (!box) return null;
  const imgs = [...box.querySelectorAll("img")];
  return { n: imgs.length, srcs: imgs.map(i => i.getAttribute("src")), heads: document.querySelector(".qx-phd b").textContent };
});
ok("MoCA 第四题：三张动物图卡", animals && animals.n === 3 && animals.srcs.every(x => /assets\/moca\/(lion|rhino|camel)\.png/.test(x)), animals ? animals.srcs.join(" ") : "无");
ok("MoCA 第四题：当前为第 4 题", animals && /第 4 \//.test(animals.heads), animals ? animals.heads : "");
await p.screenshot({ path: `${OUT}/04-moca-naming.png` });
await quitQuiz();

/* ---------- 5. ADAS：项目名称 + 词表切换 + 逐次试验打钩计分 ---------- */
await startScale("ADAS");
ok("ADAS 进入主试版式（右侧面板）", await p.locator(".qx-main").count() === 1 && await p.locator(".qx-panel").count() === 1);
const pjName = await p.locator(".qx-pj").innerText().catch(() => "");
ok("顶栏显示当前评估项目名称", /ADAS/.test(pjName), pjName);
const pjNo = await p.locator(".qx-pj-n").innerText().catch(() => "");
ok("顶栏显示题号", /第 1 \/ 11 题/.test(pjNo), pjNo);
const sets = await p.locator(".qw-set").allInnerTexts();
ok("ADAS 单词回忆：两套词表", sets.length === 2 && sets[0] === "第一套", sets.join("/"));
const trials = await p.locator(".qw-trial").allInnerTexts();
ok("ADAS 单词回忆：每套三次试验", trials.length === 3, trials.join("/"));
const words1 = await p.locator(".qw-word").allInnerTexts();
ok("ADAS 单词回忆：10 个词", words1.length === 10, words1.join(" "));
ok("第一套第 1 次为手册词表", words1.join("") === "家庭硬币铁路儿童军队旗子皮肤图书馆麦子海洋", words1.join(" "));
await p.locator(".qw-word").nth(0).click();
await p.locator(".qw-word").nth(1).click();
await p.locator(".qw-word").nth(2).click();
await p.waitForTimeout(200);
const scoreTxt = await p.locator(".qx-score-hd b").innerText();
ok("第 1 次勾 3 词 → 三次未回忆 7/10/10 平均 9 分", /^9 分/.test(scoreTxt.trim()), scoreTxt);
ok("勾选态有对勾方块", await p.locator(".qw-word.on .qw-box").count() === 3);
await p.screenshot({ path: `${OUT}/05-adas-words.png` });
/* 切到第 2 次试验：词序变化、勾选独立 */
await p.locator(".qw-trial").nth(1).click();
await p.waitForTimeout(250);
const words2 = await p.locator(".qw-word").allInnerTexts();
ok("切到第 2 次后词序变化", words2[0] !== words1[0], `${words1[0]} → ${words2[0]}`);
ok("第 2 次试验勾选独立（无残留）", (await p.locator(".qw-word.on").count()) === 0);
await p.locator(".qw-word").nth(0).click();
await p.waitForTimeout(150);
ok("第 2 次勾 1 词 → 平均 8.7 分", /^8\.7 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()), await p.locator(".qx-score-hd b").innerText());
await p.screenshot({ path: `${OUT}/05b-adas-trial.png` });
/* 切套：勾选清空、得分回到「全未回忆」 */
await p.locator(".qw-set").nth(1).click();
await p.waitForTimeout(250);
const words3 = await p.locator(".qw-word").allInnerTexts();
ok("切到第二套后词表变化", words3[0] !== words1[0], `${words1[0]} → ${words3[0]}`);
ok("切套后勾选清空、得分回满 10 分", (await p.locator(".qw-word.on").count()) === 0 && /^10 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()));
/* 第二套第 1 次勾 2 个词 → (8+10+10)/3 = 9.3 */
await p.locator(".qw-word").nth(0).click();
await p.locator(".qw-word").nth(1).click();
await p.waitForTimeout(150);
ok("第二套勾 2 词 → 平均 9.3 分", /^9\.3 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()), await p.locator(".qx-score-hd b").innerText());
/* 推进到第 2 题（命名）：17 项清单 + 自动对应分档 + 物品线索 */
await p.locator(".quiz-btn.primary").click();
await p.waitForTimeout(400);
const nm = await p.evaluate(() => ({
  names: document.querySelectorAll(".qx-names .qw-word").length,
  groups: [...document.querySelectorAll(".qn-group .qw-gt")].map(e => e.textContent.trim()),
  cues: [...document.querySelectorAll(".qx-cue")].map(e => e.querySelector("b").textContent.trim()),
  cueRows: document.querySelectorAll(".qx-cue-row").length,
  head: document.querySelector(".qx-phd b").textContent,
}));
ok("ADAS 命名：17 项清单（12 实物 + 5 手指）", nm.names === 17 && nm.groups.length === 2, `${nm.names} 项 · ${nm.groups.join("/")} · ${nm.head}`);
ok("ADAS 命名：物品线索按高/中/低频率分三组", nm.cues.length === 3 && nm.cueRows === 12, `${nm.cues.join("/")} · ${nm.cueRows} 条`);
ok("ADAS 命名：未勾选时 17 项全不正确 → 5 分、5 档高亮", /^5 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()) && (await p.locator(".qx-chip.on").first().innerText()) === "5", await p.locator(".qx-score-hd b").innerText());
await p.locator(".qw-word").nth(0).click();
await p.locator(".qw-word").nth(1).click();
await p.locator(".qw-word").nth(2).click();
await p.waitForTimeout(200);
ok("ADAS 命名：勾 3 项正确 → 14 项不正确 → 4 分", /^4 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()) && (await p.locator(".qx-chip.on").first().innerText()) === "4", await p.locator(".qx-score-hd b").innerText());
ok("ADAS 命名：面板同时显示正确/不正确项数", /命名正确 3 项 · 不正确 14 项/.test(await p.locator(".qx-sec.qx-scoring .qx-tx").first().innerText()), await p.locator(".qx-sec.qx-scoring .qx-tx").first().innerText());
await p.screenshot({ path: `${OUT}/05c-adas-naming.png` });
for (const i of [3, 4, 5]) await p.locator(".qw-word").nth(i).click();
await p.waitForTimeout(200);
ok("ADAS 命名：勾 6 项正确 → 11 项不正确 → 3 分", /^3 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()), await p.locator(".qx-score-hd b").innerText());
/* 全勾 17 项 → 0 项不正确 → 0 分 */
for (let i = 6; i < 17; i++) await p.locator(".qw-word").nth(i).click();
await p.waitForTimeout(250);
ok("ADAS 命名：17 项全正确 → 0 分", /^0 分/.test((await p.locator(".qx-score-hd b").innerText()).trim()) && (await p.locator(".qx-chip.on").first().innerText()) === "0", await p.locator(".qx-score-hd b").innerText());
/* A03–A05 各取首档，推进到第 6 题（单词再认） */
for (let i = 0; i < 4; i++) {
  await p.locator(".quiz-btn.primary").click();
  await p.waitForTimeout(300);
  if (i < 3) { await p.locator(".qx-band").first().click(); await p.waitForTimeout(120); }
}
await p.waitForTimeout(200);
const rec = await p.evaluate(() => ({
  groups: document.querySelectorAll(".qw-group").length,
  words: document.querySelectorAll(".qw-word").length,
  head: document.querySelector(".qx-phd b").textContent,
}));
ok("ADAS 单词再认：旧词 + 新词两组", rec.groups === 2 && rec.words === 22, `${rec.groups} 组 / ${rec.words} 词 · ${rec.head}`);
await p.screenshot({ path: `${OUT}/06-adas-recognize.png` });
/* 再认：勾 1 个旧词 + 1 个新词 → 错误 = 10-1+1 = 10 分 */
const groups = await p.locator(".qw-group").count();
await p.locator(".qw-group").nth(0).locator(".qw-word").nth(0).click();
await p.locator(".qw-group").nth(groups - 1).locator(".qw-word").nth(0).click();
await p.waitForTimeout(200);
const recScore = await p.locator(".qx-score-hd b").innerText();
ok("ADAS 单词再认：按错误数自动计分（漏认 9 + 误认 1 = 10 分）", /^10 分/.test(recScore.trim()), recScore);
/* 余下 5 个评定项各取首档，完成整份 ADAS */
await p.locator(".quiz-btn.primary").click();
await p.waitForTimeout(300);
for (let i = 0; i < 5; i++) {
  await p.locator(".qx-band").first().click();
  await p.locator(".quiz-btn.primary").click();
  await p.waitForTimeout(280);
}
await p.waitForTimeout(500);
const qpSum = await p.locator(".qp-sum").innerText();
ok("ADAS 完成评估：核对弹窗合计 = 9.3 + 10 = 19.3 / 70", /19\.3\s*\/\s*70/.test(qpSum.replace(/\s+/g, " ")), qpSum.replace(/\s+/g, " "));
await p.screenshot({ path: `${OUT}/06b-adas-check.png` });
await p.locator(".el-dialog__footer button", { hasText: "确认完成" }).click();
await p.waitForTimeout(900);
const rv = (await get(`/assessments/${rid}/review`)).data;
const pj = (rv.projects || []).find(x => x.code === "ADAS");
const pjTotal = pj ? Math.round(pj.items.reduce((a, i) => a + (Number(i.score) || 0), 0) * 10) / 10 : -1;
ok("ADAS 评分落库合计 = 19.3 分", pjTotal === 19.3, String(pjTotal));

/* 评估情况弹窗（查看评估）：不再出现「依据」 */
const vbtn = p.locator(".lb-card").filter({ hasText: "ADAS" }).first().locator("button", { hasText: "查看评估" }).first();
if (await vbtn.count()) {
  await vbtn.click();
  await p.waitForTimeout(800);
  const gtxt = await p.locator(".rv-pjguide").first().innerText().catch(() => "");
  ok("评估情况弹窗不含「依据」分类信息", !/依据/.test(gtxt), gtxt.replace(/\s+/g, " ").slice(0, 50));
  await p.screenshot({ path: `${OUT}/10-record-panel.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
}

/* ---------- IMCT / CCSE / AMT 版式 ---------- */
for (const [code, shot] of [["IMCT", "07-imct.png"], ["CCSE", "08-ccse.png"], ["AMT", "09-amt.png"]]) {
  await startScale(code);
  const layout = await p.evaluate(() => ({
    main: document.querySelectorAll(".qx-main").length,
    panel: document.querySelectorAll(".qx-panel").length,
    lbs: [...document.querySelectorAll(".qx-panel .qx-lb")].map(e => e.textContent.trim()),
    bands: document.querySelectorAll(".qx-band").length,
    say: (document.querySelector(".qx-say") || {}).textContent || "",
  }));
  ok(`${code} 为主试版式：右侧含 评估操作与本题评分`,
    layout.main === 1 && layout.panel === 1 && layout.lbOk !== false &&
    layout.lbs.some(x => x.includes("评估操作")) && layout.lbs.some(x => x.includes("本题评分")) && layout.bands > 0,
    `${layout.lbs.join("/")} · ${layout.bands} 个分档`);
  ok(`${code} 左侧只给指导语（无作答控件）`, !(await p.locator(".quiz-fills, .quiz-canvas, .quiz-mic, .quiz-opts").count()), layout.say.slice(0, 24));
  await p.screenshot({ path: `${OUT}/${shot}` });
  await quitQuiz();
}

/* ---------- 2. 「依据」信息已移除 ---------- */
const src = fs.readFileSync("web/doctor.html", "utf8");
ok("查看评估 / 评估情况不再渲染「依据」行", !/guide\.source/.test(src) && !/<b>依据<\/b>/.test(src));

ok("全程无脚本错误", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();

/* ---------- 清理临时评估 ---------- */
const DB = path.resolve("data/hscrt01.db");
execFileSync(NODE20, ["-e", `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(DB)});
const id = ${rid};
db.transaction((id) => {
  for (const t of ["assess_answer", "assess_score", "assess_detail", "report"]) db.prepare("DELETE FROM " + t + " WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
})(id);
db.close();
console.log("已清理临时评估 #" + id);
`], { stdio: "inherit" });

console.log(`\n${bad.length ? "未通过 " + bad.length + " 项：" + bad.join("；") : "全部通过"}`);
process.exit(bad.length ? 1 : 0);
