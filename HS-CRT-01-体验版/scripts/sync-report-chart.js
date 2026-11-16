// 按当前「各项目完成情况」口径重算全部报告的 chart 快照。
// 口径本身由 server/report-chart.js 定义（报告页、训练方案页、导出同源），
// 本脚本只负责把库里生成报告时留下的旧快照刷成新口径。
//   node scripts/sync-report-chart.js        写回
//   node scripts/sync-report-chart.js --dry  只看会改什么
const path = require("path");
const Database = require("better-sqlite3");
const { chartOfRecord } = require("../server/report-chart");

const DRY = process.argv.includes("--dry");
const db = new Database(path.join(__dirname, "..", "data", "hscrt01.db"));
const reps = db.prepare("SELECT id, record_id, patient_id, report_no, chart FROM report ORDER BY id").all();
const patOf = db.prepare("SELECT * FROM patient WHERE id=?");
const upd = db.prepare("UPDATE report SET chart=? WHERE id=?");

let changed = 0, skipped = 0;
const samples = [];

db.transaction(() => {
  for (const r of reps) {
    const p = patOf.get(r.patient_id) || {};
    let chart = [];
    try { chart = chartOfRecord(db, r.record_id, p); } catch (e) {
      console.error(r.report_no, "重算失败：", e.message);
      skipped++;
      continue;
    }
    if (!chart.length) { skipped++; continue; }
    const json = JSON.stringify(chart);
    if (json === r.chart) continue;
    changed++;
    if (samples.length < 2) {
      const before = (() => { try { return JSON.parse(r.chart || "[]"); } catch (e) { return []; } })();
      samples.push({
        no: r.report_no,
        before: before.filter((x) => x.kind === "paradigm").map((x) => ({ name: x.name, metrics: x.metrics.map((m) => m.k + "=" + m.v) })),
        after: chart.filter((x) => x.kind === "paradigm").map((x) => ({
          name: x.name, dim: x.scoreDim, legacy: !!x.legacy,
          metrics: x.metrics.map((m) => (m.p ? "★" : "") + m.k + "=" + m.v),
        })),
      });
    }
    if (!DRY) upd.run(json, r.id);
  }
})();

console.log(JSON.stringify({ total: reps.length, changed, skipped, dry: DRY, samples }, null, 1));
db.close();
