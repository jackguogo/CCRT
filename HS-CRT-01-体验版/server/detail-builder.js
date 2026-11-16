// detail-builder.js —— 评估记录明细（assess_detail.payload）的唯一构建口径
//
// 施测完成后「提交评分」与「历史记录重算」都走这里，保证：
//   量表 → total/max/cutoff/verdict（含学历分层）
//   范式 → total/max/byGroup/domainScore/ind/metrics（指标由 paradigmIndicators 现算）
// 之前这段逻辑只在 index.js 里，脚本要重算只能另写一份 → 必然漂移，故抽出。

const { SCALES, PARADIGMS } = require("./seed-data");
const { paradigmIndicators, maxOfItem } = require("./paradigm-metrics");

const scaleByCode = (c) => SCALES.find((s) => s.code === c);

/* 患者年龄（周岁）；缺出生日期返回 null，供分层临界值判读使用 */
const ageFrom = (birth) => {
  if (!birth) return null;
  const b = new Date(String(birth).slice(0, 10));
  if (isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const dm = t.getMonth() - b.getMonth();
  if (dm < 0 || (dm === 0 && t.getDate() < b.getDate())) a--;
  return a > 0 && a < 130 ? a : null;
};

const EDU_YEARS = { "文盲": 0, "小学": 6, "初中": 9, "高中": 12, "大学及以上": 16 };

/* 认知域得分：默认按「得分/满分」折算。但计时类范式（TMT）的分组值是用时，
   直接除以满分会出现「测得越快、认知域分越低」的反向结果；色词、伦敦塔同理，
   各按自己的口径换算，其余范式沿用默认。 */
function paradigmDomainScore(code, base, patient, answers) {
  const def = PARADIGMS.find((x) => x.code === code) || {};
  const cfg = def.cfg || {};
  if (code === "TMT") {
    const age = ageFrom(patient && patient.birth_date);
    const yrs = EDU_YEARS[(patient && patient.education) || ""];
    const band = (age && yrs != null)
      ? (cfg.cutoffs || []).find((r) => age >= r.ageMin && age <= r.ageMax && (r.eduLt16 === (yrs < 16)))
      : null;
    const at = answers && answers.TA ? Number(answers.TA.sec) || 0 : 0;
    const bt = answers && answers.TB ? Number(answers.TB.sec) || 0 : 0;
    if (!band || !at || !bt) return base;
    /* 用时达到（A+B）临界值 = 100 分；用时为其 2 倍 = 50 分，快于临界值按 100 计 */
    return Math.max(0, Math.min(100, Math.round((band.A + band.B) / (at + bt) * 100)));
  }
  if (code === "STROOP") {
    /* 用色词任务（卡片 C）的正确率：抑制控制的核心指标，也对应记录单「评分」口径 */
    const c = answers && answers.SC ? Number(answers.SC.ok) : NaN;
    if (!Number.isFinite(c)) return base;
    return Math.max(0, Math.min(100, Math.round(c / (cfg.perCard || 50) * 100)));
  }
  if (code === "TOL") {
    /* 总正确数 / 正式题数（记录单未给界值，只作域得分换算） */
    const c = answers && answers.L1 ? Number(answers.L1.correct) : NaN;
    const mx = Number(cfg.max) || 10;
    if (!Number.isFinite(c)) return base;
    return Math.max(0, Math.min(100, Math.round(c / mx * 100)));
  }
  return base;
}

/* 范式的项目级指标：默认按分组给「X 分」；但连线测试的分组值是用时（不是分数），
   且错误数/忽略错误数不是分值，统一改成取客观指标，避免报告里出现「A 部分 45 分」。 */
function paradigmMetrics(code, ind, byGroup) {
  const m = {}; Object.keys(byGroup).forEach((k) => { m[k] = byGroup[k] + " 分"; });
  const pick = (keys) => keys.forEach((k) => {
    const f = (ind || []).find((x) => x.k === k); if (f) m[k] = f.v;
  });
  if (code === "SDMT") pick(["错误数", "完成量"]);
  if (code === "TMT") {
    Object.keys(m).filter((k) => /部分$/.test(k)).forEach((k) => delete m[k]);
    pick(["A 完成时间", "A 连接错误数", "A 忽略错误数", "B 完成时间", "B 连接错误数", "B 忽略错误数", "参考判读"]);
  }
  if (code === "CDT") {
    delete m["画钟"];
    pick(["要素得分", "评分法", "参考判读", "用时"]);
  }
  if (code === "BNT") {
    delete m["图片命名"];
    pick(["无提示正确数", "语义提示数", "语义提示后正确数", "语音提示数", "语音提示后正确数", "总分", "用时", "参考判读"]);
  }
  if (code === "TOL") {
    delete m["移珠达成目标"];
    pick(["总正确数", "总步数", "总计划时间", "总执行时间", "完成题数"]);
  }
  if (code === "STROOP") {
    Object.keys(m).filter((k) => /^卡片/.test(k)).forEach((k) => delete m[k]);
    pick(["卡片 A 用时", "卡片 A 正确数", "卡片 B 用时", "卡片 B 正确数",
      "卡片 C 用时", "卡片 C 正确数", "C 读成字义", "SIE耗时数", "SIE准确数", "评分与判读"]);
  }
  return m;
}

/* 按逐题得分生成 assess_detail 载荷（量表 / 范式两套口径） */
function buildDetailFromScores(code, patient, scores, answers) {
  const sc = scaleByCode(code), pa = PARADIGMS.find((x) => x.code === code);
  const meta = sc || pa;
  if (!meta || !meta.items) return null;
  const pat = patient || {};
  let total = 0, max = 0, byGroup = {}, byGroupMax = {}, byGroupSec = {};
  for (const it of meta.items) {
    if (it.demo) continue;
    // 满分可能随作答变化（画钟按所选评分法），统一走 maxOfItem
    const m = maxOfItem(it, answers);
    const v = Math.max(0, Math.min(m, Number(scores[it.id]) || 0));
    total += v; max += m;
    byGroup[it.g] = (byGroup[it.g] || 0) + v;
    byGroupMax[it.g] = (byGroupMax[it.g] || 0) + m;
    // 施测端记录的作答耗时（秒），按分组累加，作为客观指标之一
    const sec = answers && answers[it.id] ? Number(answers[it.id].sec) || 0 : 0;
    if (sec > 0) byGroupSec[it.g] = (byGroupSec[it.g] || 0) + sec;
  }
  if (sc) {
    let adjust = 0;
    if (sc.adjust && sc.adjust.type === "education_le12_add1") {
      const eduYears = EDU_YEARS[pat.education] ?? 9;
      if (eduYears <= 12) adjust = 1;
    }
    const raw = total;
    total = Math.min(total + adjust, sc.total);
    let verdict = "供医师判读", cut = null, cutEdu = null;
    if (sc.cutoff) {
      if (sc.cutoff.edu) {
        // 分界值按学历分层：先精确匹配学历名，「中学」层覆盖初中/高中
        const hit = sc.cutoff.edu.find((e) => pat.education && pat.education.startsWith(e[0]))
          || sc.cutoff.edu.find((e) => e[0] === "中学" && /初中|高中/.test(pat.education || ""))
          || sc.cutoff.edu[sc.cutoff.edu.length - 1];
        cut = hit[1];
        cutEdu = pat.education || null;
      } else cut = sc.cutoff.fixed;
      if (cut != null) verdict = (sc.direction === "higher_better" ? total < cut : total > cut)
        ? `低于参考范围（分界 ${cut} 分）` : `处于参考范围内（分界 ${cut} 分）`;
    }
    return {
      kind: "scale", code, name: sc.name, total, max: sc.total, itemScore: raw, adjust,
      byGroup, verdict, cutoff: cut, cutoffEdu: cutEdu, direction: sc.direction, reviewed: true,
    };
  }
  const baseScore = max ? Math.max(0, Math.min(100, Math.round(total / max * 100))) : 0;
  const domainScore = paradigmDomainScore(code, baseScore, pat, answers);
  const ind = paradigmIndicators(code, pa, scores, answers, {
    total, max, education: pat.education || "", age: ageFrom(pat.birth_date),
  });
  /* 错误数/完成量/用时不是分值，但在项目指标里必须留痕（报告据此复核答卷质量） */
  const metrics = paradigmMetrics(code, ind, byGroup);
  return {
    kind: "paradigm", code, name: pa.name, domain: pa.domain, total, max, metrics,
    byGroup, byGroupMax, byGroupSec, domainScore, ind, verdict: "供医师判读", reviewed: true,
  };
}

module.exports = { buildDetailFromScores, paradigmDomainScore, paradigmMetrics, ageFrom, scaleByCode, EDU_YEARS };
