/**
 * 第 68 轮：MoCA 按记录单（表 3-1）还原为「主试施测 + 逐题评分」
 * 校验：
 *   1) 全量表 examinerOnly：屏幕只有指导语与必需刺激材料，无点选 / 画布 / 填空 / 麦克风
 *   2) 交替连线到「戊」、立方体临摹、画钟 3 分档、三只动物命名、记忆学习与练习组不计分
 *   3) 17 题逐题评分 → 完成评估 → 核对全部题目与评分 → 确认生成报告
 *   4) 落库口径：15 条计分题评分、明细 26/30、报告一致、评分进度分母不含演示题
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3211/api/v1";
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";
const OUT = "docs/shots-r68";
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

const mk = await post("/assessments", {
  patientId: target.id, planName: "MoCA 记录单还原校验（临时）", planId: 0,
  items: [{ type: "scale", code: "MoCA", name: "蒙特利尔认知评估量表（MoCA）" }], mode: "doctor",
});
if (mk.code !== 0) { console.log("创建临时评估失败", mk.message); process.exit(1); }
const rid = mk.data.recordId;
console.log(`临时评估 #${rid} · ${target.name}（p${target.id}）\n`);

const DB = path.resolve("data/hscrt01.db");
const dbOne = (sql) => execFileSync(NODE20, ["-e",
  `const D=require("better-sqlite3");const db=new D(${JSON.stringify(DB)},{readonly:true});process.stdout.write(JSON.stringify(db.prepare(${JSON.stringify(sql)}).all()));db.close();`
], { encoding: "utf8" }).trim();
const purge = (id) => {
  const code = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(DB)});
const id = ${id};
db.transaction((id) => {
  db.prepare("DELETE FROM report WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_detail WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_score WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_answer WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
})(id);
process.stdout.write(String(db.prepare("SELECT COUNT(*) c FROM assess_record WHERE id=?").get(id).c));
db.close();
`;
  const left = execFileSync(NODE20, ["-e", code], { encoding: "utf8" }).trim();
  console.log(left === "0" ? `✓ 临时评估 #${id} 已清理` : `! 临时评估 #${id} 清理失败（剩 ${left}）`);
};

/* 逐题评分（按条目顺序，演示题记 null）：
   M01 1、M02 1、M03 2、M04 3、M05 不计分、M06 1、M07 1、M08 1、M09 2、
   M10 1、M11 1、M12 1、M13 不计分、M14 1、M17 1、M15 4、M16 5 → 合计 26 */
const SCORES = [1, 1, 2, 3, null, 1, 1, 1, 2, 1, 1, 1, null, 1, 1, 4, 5];
const TOTAL = SCORES.filter(v => v !== null).reduce((a, b) => a + b, 0);
/* MoCA 计分口径：受教育年限 ≤12 年者总分加 1 分（不超过满分） */
const EDU = { "文盲": 0, "小学": 6, "初中": 9, "高中": 12, "大学及以上": 16 };
const ADJ = (EDU[target.education] ?? 9) <= 12 ? 1 : 0;
const EXPECT = Math.min(TOTAL + ADJ, 30);
console.log(`  逐题合计 ${TOTAL} · 教育调整 +${ADJ}（${target.education || "未填"}）→ 总分 ${EXPECT}\n`);

try {
  const browser = await chromium.launch({ headless: true, executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForSelector(".lb-banner");
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const box = page.locator(".el-message-box:visible").first();
  if (await box.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }

  await page.locator("button:visible", { hasText: "开始评估" }).first().click();
  await page.waitForSelector(".quiz-mask.quiz-examiner");
  await page.waitForTimeout(500);

  /* ---------- 1. 第一题：交替连线，只有指导语 + 连线图，无点选交互 ---------- */
  const q1 = await page.evaluate(() => ({
    say: (document.querySelector(".qx-say") || {}).innerText || "",
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    op: (document.querySelector(".qx-tx") || {}).innerText || "",
    bands: [...document.querySelectorAll(".qx-band")].map(b => b.innerText.replace(/\n/g, "|")),
    score: (document.querySelector(".qx-score-hd b") || {}).innerText || "",
    nodes: document.querySelectorAll(".qo-node").length,
    dots: document.querySelectorAll(".qx-fig svg circle").length,
    mic: document.querySelectorAll(".quiz-mic").length,
    input: document.querySelectorAll(".quiz-input").length,
    canvas: document.querySelectorAll("canvas").length,
  }));
  ok("进入主试施测版式", !!q1.say, q1.head.replace(/\n/g, " · "));
  ok("指导语按记录单（画线、到「戊」结束）", /画一条连线/.test(q1.say) && /戊/.test(q1.say), q1.say.slice(0, 40));
  ok("连线图有 10 个圆点（1-甲-…-5-戊）", q1.dots === 10, `${q1.dots} 个`);
  ok("连线不设点选交互", q1.nodes === 0);
  ok("分档评分 1 / 0", q1.bands.length === 2 && q1.bands[0].startsWith("1|"), q1.bands.join("  "));
  ok("未评分时显示未评分", q1.score.indexOf("未评分") === 0, q1.score);
  ok("无麦克风 / 填空 / 画布", q1.mic === 0 && q1.input === 0 && q1.canvas === 0);
  await page.screenshot({ path: `${OUT}/01-moca-q01.png` });

  /* ---------- 2. 未评分不能进入下一题 ---------- */
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForTimeout(400);
  const guard = await page.evaluate(() => ({
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    toast: [...document.querySelectorAll(".el-message")].map(m => m.innerText.trim()).join(" | "),
  }));
  ok("未评分时拦下并提示", guard.head.indexOf("第 1 / 17") >= 0 && /评分/.test(guard.toast), guard.toast || "无提示");

  const pick = async (v) => {
    const btns = page.locator(".qx-band");
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const t = (await btns.nth(i).locator("i").innerText()).trim();
      if (Number(t) === v) { await btns.nth(i).click(); return true; }
    }
    return false;
  };
  const snap = () => page.evaluate(() => ({
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    say: (document.querySelector(".qx-say") || {}).innerText || "",
    bands: [...document.querySelectorAll(".qx-band")].map(b => (b.querySelector("i") || {}).innerText),
    demoNote: (document.querySelector(".qx-scoring .qx-tx") || {}).innerText || "",
    dots: document.querySelectorAll(".qx-fig svg circle").length,
    fig: document.querySelectorAll(".qx-fig svg").length,
    emoji: document.querySelectorAll(".qx-animals img").length,
    canvas: document.querySelectorAll("canvas").length,
    nodes: document.querySelectorAll(".qo-node").length,
  }));

  /* ---------- 3. 逐题评分，并在关键题截图核验 ---------- */
  const shots = { 1: "01-moca-q01.png", 2: "02-moca-q02.png", 3: "03-moca-q03.png", 4: "04-moca-q04.png", 5: "05-moca-q05.png", 9: "06-moca-q09.png" };
  let allOk = true;
  for (let i = 0; i < SCORES.length; i++) {
    const no = i + 1;
    if (no > 1) { await page.click(".quiz-foot .quiz-btn.primary"); await page.waitForTimeout(180); }
    const s = await snap();
    if (SCORES[i] !== null) {
      if (!(await pick(SCORES[i]))) { allOk = false; console.log(`  ! 第 ${no} 题无 ${SCORES[i]} 分档`); }
    }
    if (no === 2) {
      ok("第 2 题给出立方体原图", s.fig === 1 && /照着这幅图/.test(s.say), `${s.fig} 个图形 · ${s.say.slice(0, 20)}`);
    }
    if (no === 3) {
      ok("第 3 题画钟分档 3 / 2 / 1 / 0", s.bands.join(",") === "3,2,1,0", s.bands.join(","));
      ok("第 3 题不设画布", s.canvas === 0);
    }
    if (no === 4) {
      ok("第 4 题出示三只动物图卡", s.emoji === 3, `${s.emoji} 只`);
    }
    if (no === 5) {
      ok("第 5 题记忆学习不计分", s.bands.length === 0 && /不计分/.test(s.demoNote), s.demoNote);
    }
    if (no === 9) {
      ok("第 9 题 100 连续减 7 分档 3 / 2 / 1 / 0", s.bands.join(",") === "3,2,1,0", s.bands.join(","));
    }
    if (no === 13) {
      ok("第 13 题抽象练习组不计分", s.bands.length === 0 && /不计分/.test(s.demoNote), s.say.slice(0, 22));
    }
    if (no === 15) {
      ok("第 15 题为手表—尺子（新增计分组）", /手表和尺子/.test(s.say), s.say);
    }
    if (no === 16) {
      ok("第 16 题延迟回忆分档 5 → 0", s.bands.join(",") === "5,4,3,2,1,0", s.bands.join(","));
    }
    if (no === 17) {
      ok("第 17 题定向分档 6 → 0", s.bands.join(",") === "6,5,4,3,2,1,0", s.bands.join(","));
      ok("第 17 题按记录单问日期/月份/年代", /年代/.test(s.say), s.say);
    }
    if (shots[no] && no !== 1) await page.screenshot({ path: `${OUT}/${shots[no]}` });
  }
  ok("17 题逐题评分完成", allOk);
  const lastBtn = (await page.locator(".quiz-foot .quiz-btn.primary").innerText()).trim();
  ok("最后一题按钮为「完成评估」", lastBtn === "完成评估", lastBtn);

  /* ---------- 4. 完成评估 → 核对全部题目与评分 ---------- */
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForSelector(".qp-dialog", { state: "visible" });
  await page.waitForTimeout(400);
  const prev = await page.evaluate(() => ({
    title: (document.querySelector(".qp-dialog .el-dialog__title") || {}).innerText || "",
    rows: [...document.querySelectorAll(".qp-row")].map(r => ({
      no: (r.querySelector(".qp-no") || {}).innerText,
      s: (r.querySelector(".qp-s") || {}).innerText.replace(/\s/g, ""),
      demo: !!r.querySelector(".qp-s.demo"),
    })),
    sum: (document.querySelector(".qp-sum") || {}).innerText || "",
    total: (document.querySelector(".qp-sum b") || {}).innerText || "",
  }));
  ok("打开完成前核对弹窗", /完成评估前核对/.test(prev.title), prev.title);
  ok("核对列出全部 17 题", prev.rows.length === 17, `${prev.rows.length} 行`);
  ok(`核对合计 = ${TOTAL} / 30`, prev.total === String(TOTAL) && /30/.test(prev.sum), prev.sum.replace(/\n/g, " "));
  const demoRows = prev.rows.filter(r => r.demo);
  ok("两处不计分题标注「不计分」", demoRows.length === 2 && demoRows.every(r => r.s === "不计分"), demoRows.map(r => r.no).join(","));
  const got = prev.rows.filter(r => !r.demo).map(r => Number(String(r.s).split("/")[0]));
  ok("逐题分值与所选一致", JSON.stringify(got) === JSON.stringify(SCORES.filter(v => v !== null)), got.join(","));
  await page.screenshot({ path: `${OUT}/07-moca-preview.png` });

  /* ---------- 5. 返回修改 → 回到最后一题 ---------- */
  await page.click(".qp-dialog .el-dialog__footer button:has-text('返回修改')");
  await page.waitForTimeout(500);
  const backInfo = await page.evaluate(() => ({
    on: !!document.querySelector(".quiz-mask.quiz-examiner"),
    head: (document.querySelector(".qx-phd") || {}).innerText || "",
    score: (document.querySelector(".qx-score-hd b") || {}).innerText || "",
  }));
  ok("核对后可返回修改", backInfo.on && /第 17 \/ 17/.test(backInfo.head), backInfo.head.replace(/\n/g, " "));
  ok("返回后本题分数保留", backInfo.score.indexOf("5 分") === 0, backInfo.score);
  await page.click(".quiz-foot .quiz-btn.primary");
  await page.waitForSelector(".qp-dialog", { state: "visible" });
  await page.waitForTimeout(300);

  /* ---------- 6. 确认完成 → 生成报告 ---------- */
  await page.click(".qp-dialog .el-dialog__footer button:has-text('确认完成')");
  await page.waitForTimeout(2200);
  const rep = await page.evaluate(() => ({
    view: document.body.innerText.indexOf("本报告仅供医疗专业人员参考") >= 0,
    txt: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
  }));
  ok("确认后生成并打开报告", rep.view, rep.txt.slice(0, 60));
  await page.screenshot({ path: `${OUT}/08-moca-report.png` });
  ok("浏览器控制台无错误", errors.length === 0, errors.slice(0, 4).join(" | ") || "none");

  /* 方案项目表：评分进度分母不含演示题（17 题 − 2 题 = 15） */
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const prog = await page.evaluate(() => {
    const el = document.querySelector(".qstat");
    return el ? el.innerText.replace(/\s+/g, " ").trim() : "";
  });
  ok("评分进度 15/15（不含不计分题）", /评分进度/.test(prog) && /15\/15/.test(prog), prog);

  /* ---------- 7. 落库口径 ---------- */
  const sc = JSON.parse(dbOne(`SELECT item_id,score FROM assess_score WHERE record_id=${rid} ORDER BY item_id`));
  ok("评分落库 15 条（计分题）", sc.length === 15, `${sc.length} 条`);
  const sum = sc.reduce((a, r) => a + r.score, 0);
  ok(`评分合计 ${TOTAL}`, sum === TOTAL, `实际 ${sum}`);
  const det = JSON.parse(dbOne(`SELECT payload FROM assess_detail WHERE record_id=${rid} AND code='MoCA'`))[0];
  const pl = JSON.parse(det.payload);
  ok("明细按评分生成（非仅记录作答）", !pl.recordOnly, pl.recordOnly ? "recordOnly" : "scored");
  ok(`明细总分 ${EXPECT} / 30（含教育调整 +${ADJ}）`, pl.total === EXPECT && pl.max === 30, `${pl.total}/${pl.max}`);
  const repRow = JSON.parse(dbOne(`SELECT chart FROM report WHERE record_id=${rid}`))[0];
  const chart = repRow ? JSON.parse(repRow.chart) : [];
  const mocaRow = chart.find(c => /MoCA/.test(c.name || ""));
  ok(`报告记录 ${EXPECT} / 30`, mocaRow && mocaRow.total === EXPECT && mocaRow.max === 30,
    mocaRow ? `${mocaRow.total}/${mocaRow.max} ${mocaRow.verdict || ""}` : "无该项");

  await browser.close();
} finally {
  purge(rid);
}

console.log(bad.length ? `\n✗ 失败 ${bad.length} 项：${bad.join(" / ")}` : "\n✓ 全部通过");
process.exit(bad.length ? 1 : 0);
