// 按新版「各项目完成情况」口径重算全部报告的 chart：
// 量表 → 实际得分 / 满分 / 参考分界（含学历分层）/ 偏移（前端画分值色条）
// 范式 → 按各范式自身的指标定义计算客观指标（用时、正确数、错误数、广度、干扰量…）
const path = require("path");
const Database = require("better-sqlite3");
const { PARADIGMS, SCALES } = require("../server/seed-data");
const { paradigmIndicators } = require("../server/paradigm-metrics");

const itemMaxOf = (it) => it.scoring === "item"
  ? (it.max || 0)
  : (it.parts || []).reduce((a, p) => a + (p.max != null ? p.max : 1), 0);
const groupMaxCache = {};
function groupMaxOf(code) {
  if (groupMaxCache[code]) return groupMaxCache[code];
  const pa = PARADIGMS.find((x) => x.code === code);
  const out = {};
  if (pa && pa.items) {
    for (const it of pa.items) {
      if (it.demo) continue;
      out[it.g] = (out[it.g] || 0) + itemMaxOf(it);
    }
  }
  return (groupMaxCache[code] = out);
}
const cutFromVerdict = (v) => {
  const m = /分界\s*(\d+)\s*分/.exec(v || "");
  return m ? Number(m[1]) : null;
};
const scoreOf = (r) => {
  if (r.total != null && r.max != null) return { total: r.total, max: r.max };
  for (const v of Object.values(r.metrics || {})) {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(v).trim());
    if (m) return { total: Number(m[1]), max: Number(m[2]) };
  }
  return null;
};

function buildChart(results, ctx) {
  return results.map((r) => {
    if (r.kind === "scale") {
      const cut = r.cutoff != null ? r.cutoff : cutFromVerdict(r.verdict);
      let refText = "—", delta = null;
      if (cut != null) {
        refText = (r.direction === "lower_better" ? "≤ " : "≥ ") + cut + " 分";
        delta = r.direction === "lower_better" ? (cut - r.total) : (r.total - cut);
      }
      // 学历分层：该量表分界值按学历分层时，标出患者所属层
      const meta = SCALES.find((x) => x.code === r.code);
      const cutEdu = (meta && meta.cutoff && meta.cutoff.edu && cut != null) ? (ctx.education || null) : null;
      return {
        name: r.name, kind: "scale", domain: null,
        total: r.total != null ? r.total : null, max: r.max != null ? r.max : null,
        cutoff: cut, cutoffEdu: cutEdu, direction: r.direction || "higher_better",
        refText, delta, verdict: r.verdict || null, metrics: [],
      };
    }
    const bg = r.byGroup || {};
    const bm = (r.byGroupMax && Object.keys(r.byGroupMax).length) ? r.byGroupMax : groupMaxOf(r.code);
    const bs = r.byGroupSec || {};
    let metrics = [];
    if (r.ind && r.ind.length) {
      metrics = r.ind;
    } else {
      const pa = PARADIGMS.find((x) => x.code === r.code);
      const scores = (ctx.rawMap && ctx.rawMap[r.code] && ctx.rawMap[r.code].scores) || {};
      // 只有留下逐题评分明细的记录才能按指标定义重算，早期演示记录回退到原有 metrics
      if (Object.keys(scores).length) {
        const ind = paradigmIndicators(r.code, pa, scores, ctx.answersOf(r.code), { total: r.total, max: r.max });
        metrics = ind.length ? ind : [];
      }
      if (!metrics.length) {
        metrics = Object.keys(bg).length
          ? Object.keys(bg).map((k) => ({
            k,
            v: (bm[k] != null ? `${bg[k]}/${bm[k]}` : String(bg[k])) + (bs[k] ? ` · ${bs[k]}s` : ""),
          }))
          : Object.entries(r.metrics || {}).map(([k, v]) => ({ k, v: String(v) }));
      }
    }
    if (!metrics.length) {
      const sc = scoreOf(r);
      metrics = sc
        ? [{ k: "要素得分", v: `${sc.total}/${sc.max}` }]
        : Object.entries(r.metrics || {}).map(([k, v]) => ({ k, v: String(v) }));
    }
    return {
      name: r.name, kind: "paradigm", domain: r.domain || null,
      total: null, max: null, cutoff: null, cutoffEdu: null, direction: null,
      refText: "—", delta: null, verdict: r.verdict || null, metrics,
    };
  });
}

const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const reports = db.prepare("SELECT id, record_id, patient_id, report_no, chart FROM report").all();
const detailsOf = db.prepare("SELECT code,payload,raw FROM assess_detail WHERE record_id=?");
const answersOf = db.prepare("SELECT item_id,value FROM assess_answer WHERE record_id=? AND code=?");
const patientOf = db.prepare("SELECT education FROM patient WHERE id=?");
const upd = db.prepare("UPDATE report SET chart=? WHERE id=?");

let changed = 0;
const samples = [];

db.transaction(() => {
  for (const rep of reports) {
    const rows = detailsOf.all(rep.record_id);
    const results = [];
    const rawMap = {};
    for (const row of rows) {
      try { results.push(JSON.parse(row.payload)); } catch (e) { continue; }
      try { rawMap[row.code] = JSON.parse(row.raw || "{}"); } catch (e) { }
    }
    if (!results.length) continue;
    const pat = patientOf.get(rep.patient_id) || {};
    const ctx = {
      education: pat.education || null,
      rawMap,
      answersOf: (code) => {
        const out = {};
        answersOf.all(rep.record_id, code).forEach((x) => {
          try { out[x.item_id] = JSON.parse(x.value || "{}"); } catch (e) { }
        });
        return out;
      },
    };
    const chart = buildChart(results, ctx);
    const json = JSON.stringify(chart);
    if (json === rep.chart) continue;
    if (samples.length < 2) samples.push({ no: rep.report_no, chart });
    upd.run(json, rep.id);
    changed++;
  }
})();

console.log(JSON.stringify({ total: reports.length, changed, samples }, null, 1));
db.close();
