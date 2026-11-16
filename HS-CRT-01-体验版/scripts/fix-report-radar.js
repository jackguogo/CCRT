// 按新版画像规则重算全部报告：只统计实测域，未测域不入画像/结论
const path = require("path");
const Database = require("better-sqlite3");

const DOMS = ["复合性注意", "执行能力", "学习与记忆", "语言", "视结构-知觉能力", "社会认知"];
const MAP = { "注意": "复合性注意", "执行": "执行能力", "记忆": "学习与记忆", "语言": "语言", "视空间": "视结构-知觉能力" };
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const TAIL = "本报告仅供医疗专业人员参考，不能单独作为诊断依据。建议由医师结合临床进行解读。";

function buildRadar(results) {
  const acc = {};
  for (const r of results) {
    if (r.kind === "paradigm" && r.domainScore != null) {
      const d = MAP[r.domain] || r.domain;
      (acc[d] = acc[d] || []).push(clamp(r.domainScore));
    }
  }
  const radar = {};
  for (const d of DOMS) {
    if (d === "社会认知") continue;
    if (acc[d] && acc[d].length) radar[d] = clamp(acc[d].reduce((a, b) => a + b) / acc[d].length);
  }
  const measured = DOMS.filter((d) => d !== "社会认知" && radar[d] != null);
  if (measured.length) radar["社会认知"] = Math.round(measured.reduce((a, d) => a + radar[d], 0) / measured.length);
  return measured.length ? radar : null;
}

function buildConclusion(radar) {
  if (!radar || !Object.keys(radar).length) {
    return ["各项评估已完成。", "本次评估未包含认知域范式，不生成认知域结论。", TAIL].join("\n");
  }
  const keys = DOMS.filter((k) => radar[k] != null);
  const weak = keys.filter((k) => radar[k] < 55);
  const mid = keys.filter((k) => radar[k] >= 55 && radar[k] < 75);
  const lines = ["各项评估已完成。"];
  if (!weak.length && !mid.length) lines.push("各认知域结果处于参考范围内。");
  weak.forEach((k) => lines.push(`【${k}】结果低于参考范围；`));
  mid.forEach((k) => lines.push(`【${k}】处于临界水平，建议关注；`));
  lines.push(TAIL);
  return lines.join("\n");
}

const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const reports = db.prepare("SELECT id, record_id, report_no, radar, conclusion FROM report").all();
const detailsOf = db.prepare("SELECT payload FROM assess_detail WHERE record_id=?");
const upd = db.prepare("UPDATE report SET radar=?, conclusion=? WHERE id=?");

let changed = 0, empty = 0;
const samples = [];

db.transaction(() => {
  for (const rep of reports) {
    const results = detailsOf.all(rep.record_id).map((r) => { try { return JSON.parse(r.payload); } catch (e) { return null; } }).filter(Boolean);
    const radar = buildRadar(results);
    if (!radar) empty++;
    const conclusion = buildConclusion(radar);
    const rJson = JSON.stringify(radar);
    if (rJson === rep.radar && conclusion === rep.conclusion) continue;
    if (samples.length < 3) samples.push({ no: rep.report_no, radar, conclusion });
    upd.run(rJson, conclusion, rep.id);
    changed++;
  }
})();

console.log(JSON.stringify({ total: reports.length, changed, radarNull: empty, samples }, null, 1));
db.close();
