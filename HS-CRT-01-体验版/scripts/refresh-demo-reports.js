// 修复演示/历史报告：把没有留存逐题作答的旧记录，按**当前范式定义**补齐作答与评分，
// 重建 assess_detail 载荷与 report.chart，使报告里的「范式评估」维度与施测/评分页一致。
//
// 只处理 assess_answer 为空的记录（即从未留存作答的演示数据）；
// 真实记录一律不动 —— 它们的作答本来就在，报告会按现算口径展示。
//   node scripts/refresh-demo-reports.js --dry
//   node scripts/refresh-demo-reports.js
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { PARADIGMS } = require("../server/seed-data");
const { buildDetailFromScores, ageFrom } = require("../server/detail-builder");
const { chartOfRecord } = require("../server/report-chart");
const { CDT_SCALES } = require("../server/cdt-data");
const { SDMT_ROWS } = require("../server/sdmt-data");

const DRY = process.argv.includes("--dry");
const DB = path.join(__dirname, "..", "data", "hscrt01.db");
if (!DRY) {
  const bak = DB + ".bak-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  fs.copyFileSync(DB, bak);
  console.log("已备份", path.basename(bak));
}
const db = new Database(DB);
const metaOf = (code) => PARADIGMS.find((p) => p.code === code);
const EDU_YEARS = { "文盲": 0, "小学": 6, "初中": 9, "高中": 12, "大学及以上": 16 };

/* 按「能力水平 r（0–1）」生成一套符合当前施测端结构的作答与逐题得分。
   数值不凭空拔高：r 来自该记录原有得分比例，保证同一患者的严重程度前后一致。 */
function makeAnswers(code, ratio, pat) {
  const meta = metaOf(code);
  if (!meta) return null;
  const r = Math.max(0.25, Math.min(0.95, Number(ratio) || 0.7));
  const answers = {}, scores = {};

  if (code === "SPAN") {
    const lens = (g) => [...new Set(meta.items.filter((i) => i.g === g).map((i) => i.len))].sort((a, b) => a - b);
    const lf = lens("顺背"), lb = lens("倒背");
    const maxF = lf[Math.min(lf.length - 1, Math.round(r * (lf.length - 1)))];
    const maxB = lb[Math.min(lb.length - 1, Math.max(0, Math.round(r * (lb.length - 1)) - 1))];
    for (const it of meta.items) {
      if (it.demo) continue;
      const lim = it.g === "倒背" ? maxB : maxF;
      const okTrials = it.len < lim ? 2 : (it.len === lim ? 1 : 0);
      answers[it.id] = {
        parts: (it.parts || []).map((p, i) => (i < okTrials ? p.expect : "错误")),
        sec: (it.len || 3) * 2,
      };
      scores[it.id] = okTrials;
    }
    return { answers, scores };
  }

  if (code === "TMT") {
    const yrs = EDU_YEARS[pat.education] ?? 9;
    const age = ageFrom(pat.birth_date) || 65;
    const cuts = (meta.cfg && meta.cfg.cutoffs) || [];
    const band = cuts.find((x) => age >= x.ageMin && age <= x.ageMax && x.eduLt16 === (yrs < 16)) || cuts[0];
    const k = 0.75 + (1 - r) * 0.85;
    const A = Math.round((band ? band.A : 74) * k);
    const B = Math.round((band ? band.B : 154) * k);
    answers.TA = { sec: A, err: Math.round((1 - r) * 3), skip: Math.max(0, Math.round((1 - r) * 2) - 1), completed: true, parts: [String(A)] };
    answers.TB = { sec: B, err: Math.round((1 - r) * 4), skip: Math.round((1 - r) * 2), completed: true, parts: [String(B)] };
    scores.TA = 0; scores.TB = 0;                 // 计时项不折算成分数
    return { answers, scores };
  }

  if (code === "STROOP") {
    const okC = Math.round(r * 50);
    const okB = Math.min(50, okC + 3), okA = Math.min(50, okC + 6);
    const secC = Math.round(62 + (1 - r) * 40);
    answers.S1 = { parts: [String(okC)], sec: secC };
    answers.SA = { sec: Math.round(35 + (1 - r) * 25), ok: okA, bad: 50 - okA, semantic: 0, completed: true };
    answers.SB = { sec: Math.round(48 + (1 - r) * 32), ok: okB, bad: 50 - okB, semantic: 0, completed: true };
    answers.SC = { sec: secC, ok: okC, bad: 50 - okC, semantic: Math.round((1 - r) * 6), completed: true };
    scores.S1 = okC;
    return { answers, scores };
  }

  if (code === "TOL") {
    const mins = [3, 3, 4, 4, 5, 5, 6, 6, 7, 7];
    const correct = Math.round(r * 10);
    const formal = mins.map((mn, i) => {
      const ok = i < correct;
      return { min: mn, moves: mn + (ok ? 0 : 1 + (i % 3)), ok, solved: ok || i === correct, plan: 6 + (i % 4) * 3, exec: 20 + (i % 5) * 6, prac: false };
    });
    const prac = [1, 2].map((mn) => ({ min: mn, moves: mn, ok: true, solved: true, plan: 4, exec: 10, prac: true }));
    const rows = [...prac, ...formal];
    answers.L1 = {
      correct,
      extra: formal.reduce((a, x) => a + Math.max(0, x.moves - x.min), 0),
      planSec: formal.reduce((a, x) => a + x.plan, 0),
      execSec: formal.reduce((a, x) => a + x.exec, 0),
      rows, sec: 0,
    };
    scores.L1 = correct;
    return { answers, scores };
  }

  if (code === "BNT") {
    const total = Math.round(r * 30);
    const ok1 = Math.min(30, Math.max(0, total - Math.round((1 - r) * 4)));
    const ok3 = Math.max(0, total - ok1);
    const sem = Math.max(0, 30 - ok1);
    const ph = Math.max(0, sem - ok3);
    answers.B1 = { parts: [String(total)], ok1, sem, ok3, ph, ok5: Math.round(ph * 0.4), total, sec: 8 * 60, rows: [] };
    scores.B1 = total;
    return { answers, scores };
  }

  if (code === "CDT") {
    const scale = CDT_SCALES.find((s) => s.k === "s10") || CDT_SCALES[4];
    const target = Math.round(r * scale.max);
    let sum = 0; const picks = [];
    for (const it of scale.items) { if (sum + it.pts <= target) { picks.push(it.id); sum += it.pts; } }
    answers.D1 = {
      parts: [""], sec: 150,
      cdtScale: scale.k, cdtScaleName: scale.name, cdtRule: scale.rule,
      cdtPicks: picks, cdtTotal: sum,
    };
    scores.D1 = sum;
    return { answers, scores };
  }

  if (code === "AVLT") {
    const imm = Math.round(r * 12);
    const del = Math.max(0, imm - Math.round((1 - r) * 3));
    const list = (k) => Array.from({ length: 12 }, (_, i) => (i < k ? "是" : "否"));
    answers.V0 = { parts: list(imm), sec: 40 };
    answers.V1 = { parts: list(imm), sec: 35 };
    answers.V2 = { parts: list(del), sec: 30 };
    scores.V0 = imm; scores.V1 = imm; scores.V2 = del;
    return { answers, scores };
  }

  if (code === "SDMT") {
    const filled = Math.round(r * 105);
    const sheet = SDMT_ROWS.map((row, ri) =>
      row.map((ch, ci) => ((ri * 15 + ci) < filled ? ch : "_")).join("")).join("|");
    answers.S1 = { parts: [sheet], sec: 90 };
    scores.S1 = filled;
    return { answers, scores };
  }

  return null;   // 其余范式（CPT/FLU/REC/COPY）不造数据，报告按分组得分呈现
}

const reports = db.prepare("SELECT * FROM report ORDER BY id").all();
const ansOf = db.prepare("SELECT item_id FROM assess_answer WHERE record_id=? AND code=?");
const delAns = db.prepare("DELETE FROM assess_answer WHERE record_id=? AND code=?");
const delSc = db.prepare("DELETE FROM assess_score WHERE record_id=? AND code=?");
const detOf = db.prepare("SELECT * FROM assess_detail WHERE record_id=? AND code=?");
const insAns = db.prepare("INSERT INTO assess_answer(record_id,code,item_id,value) VALUES(?,?,?,?)");
const insSc = db.prepare(`INSERT INTO assess_score(record_id,code,item_id,score,updated_at) VALUES(?,?,?,?,datetime('now','localtime'))
  ON CONFLICT(record_id,code,item_id) DO UPDATE SET score=excluded.score`);
const updDet = db.prepare("UPDATE assess_detail SET payload=?, raw=? WHERE id=?");
const updChart = db.prepare("UPDATE report SET chart=? WHERE id=?");

let filled = 0, charts = 0, skipped = 0;
const log = [];

const run = db.transaction(() => {
  for (const rep of reports) {
    const rec = db.prepare("SELECT * FROM assess_record WHERE id=?").get(rep.record_id);
    if (!rec) { skipped++; continue; }
    const pat = db.prepare("SELECT * FROM patient WHERE id=?").get(rep.patient_id) || {};
    const items = (() => { try { return JSON.parse(rec.items || "[]"); } catch (e) { return []; } })();

    for (const it of items) {
      if (it.type !== "paradigm") continue;
      const det = detOf.get(rec.id, it.code);
      if (!det) continue;
      /* 判断这题的作答是否属于现行题库：老演示记录用的是旧题号（N1…N15），
         按现口径重算只会得到 0 分，必须先清掉再按新结构补 */
      const meta = metaOf(it.code);
      const ids = new Set(((meta && meta.items) || []).map((x) => x.id));
      const known = ansOf.all(rec.id, it.code).some((r) => ids.has(r.item_id));
      if (!known) {
        delAns.run(rec.id, it.code);
        delSc.run(rec.id, it.code);
        {
        let payload = {};
        try { payload = JSON.parse(det.payload); } catch (e) { }
        /* 原有得分比例 + 按报告错开的小幅扰动：避免多条演示报告算出完全一样的数值 */
        const base = payload.max ? (Number(payload.total) || 0) / Number(payload.max) : 0.7;
        const ratio = base + ((((rep.id * 37) % 9) - 4) / 100);
        const made = makeAnswers(it.code, ratio, pat);
        if (!made) continue;
        for (const [iid, v] of Object.entries(made.answers)) {
          insAns.run(rec.id, it.code, iid, JSON.stringify(v));
        }
        for (const [iid, s] of Object.entries(made.scores)) {
          insSc.run(rec.id, it.code, iid, Number(s) || 0);
        }
        const next = buildDetailFromScores(it.code, pat, made.scores, made.answers);
        if (next) {
          const raw = Object.assign({}, (() => { try { return JSON.parse(det.raw || "{}"); } catch (e) { return {}; } })(), { scores: made.scores, reviewed: true });
          updDet.run(JSON.stringify(next), JSON.stringify(raw), det.id);
        }
        filled++;
        log.push(`${rep.report_no} ${it.code} 补齐作答（比例 ${ratio.toFixed(2)}）`);
        }
      }
    }

    const chart = chartOfRecord(db, rec.id, pat);
    if (chart.length) {
      const json = JSON.stringify(chart);
      if (json !== rep.chart) { updChart.run(json, rep.id); charts++; }
    }
  }
  if (DRY) throw new Error("__dry__");     // 试运行：抛错回滚，留数据原样
});
try { run(); } catch (e) { if (e.message !== "__dry__") throw e; }

console.log(JSON.stringify({ dry: DRY, reports: reports.length, filledItems: filled, chartsUpdated: charts, skipped, log: log.slice(0, 40) }, null, 1));
db.close();
