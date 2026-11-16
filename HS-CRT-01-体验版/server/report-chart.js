// report-chart.js —— 报告「各项目完成情况」的唯一事实源
//
// 量表 → 实际得分 / 满分 / 参考分界（含学历分层）/ 偏移，前端据此画分值色条
// 范式 → 该范式**实际计分维度** + 过程指标，指标一律现算（paradigmIndicators），
//        不再沿用生成报告时的快照，避免施测页改了口径、报告还停在旧指标名。
//
// 之所以抽成独立模块：报告页、训练方案页、历史报告回看三处共用；
// 之前每个入口各存一份 chart 快照，改一次范式就要各自迁移，必然漂移。

const { PARADIGMS } = require("./seed-data");
const { paradigmIndicators } = require("./paradigm-metrics");

/* 各范式的计分维度：报告卡片上要能一眼看出「这题按什么给分」。
   pick = 指标列表里属于计分项的名称，其余按过程指标呈现（供主试评估，不计分）。 */
const SCORE_DIM = {
  SPAN: {
    k: "总分（顺背 + 倒背）", main: "总分", pick: ["顺背得分", "倒背得分", "总分"],
    note: "顺背、倒背各按正确数列数计分，求和为总分；界值按教育分层：文盲 >5、小学 >6、初中及以上 >7",
  },
  CPT: { k: "正确题数", main: "正确题数", pick: ["正确题数"], note: "记录数目标次数是否正确" },
  SDMT: {
    k: "正确数", main: "正确数", pick: ["正确数"],
    note: "90 秒内抄写正确的格数（满分 110）；正确数 > 21 属正常",
  },
  TMT: {
    k: "A / B 完成时间", noScore: true, pick: ["A 完成时间", "B 完成时间"],
    note: "按年龄与教育程度分层临界值判读；连接错误数、忽略错误数为过程指标",
  },
  STROOP: {
    k: "卡片 C 正确数", main: "卡片 C 正确数", pick: ["卡片 C 正确数"],
    note: "满分 50，评分 > 39 属正常；卡片 A/B 与 SIE 供主试评估，不计入得分",
  },
  TOL: {
    k: "总正确数", main: "总正确数", pick: ["总正确数"],
    note: "限时内用最少步数解决的题数（满分 10）；总步数、总计划时间、总执行时间为过程指标",
  },
  AVLT: {
    k: "延迟回忆正确词数", main: "延迟回忆", pick: ["即刻回忆", "延迟回忆"],
    note: "满分各 12 词；遗忘数 = 即刻 − 延迟",
  },
  REC: { k: "辨别力", main: "辨别力", pick: ["辨别力"], note: "辨别力 = 命中率 − 虚报率" },
  BNT: {
    k: "总分（无提示 + 语义提示后）", main: "总分", pick: ["总分"],
    note: "满分 30，总分 > 24 属正常；语义提示数、语音提示两项只作临床参考，不计分",
  },
  FLU: { k: "产词数", main: "动物词数", pick: ["动物词数", "“大”字词数"], note: "类别流畅与首字流畅分别计数" },
  CDT: {
    k: "要素得分", main: "要素得分", pick: ["要素得分"],
    note: "按所选评分法（3/4/5/7/10/30 分）逐项勾选合计",
  },
  COPY: { k: "要素得分", main: "要素得分", pick: ["要素得分"], note: "按临摹要素逐项评分" },
};

const ageOf = (birth) => {
  if (!birth) return 0;
  const t = new Date(birth).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 31557600000);
};

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

/* 量表卡片 */
function scaleCard(d) {
  const total = num(d.total), max = num(d.max);
  /* 分界值 0（或负数）等于未设分界：否则会出现「参考区间（≤ 0 分）」这种无意义判读。
     旧记录没存 cutoff 字段时，从 verdict 的「分界 N 分」回填，避免参考区间整行丢失。 */
  let cut = num(d.cutoff);
  if (cut == null) {
    const m = /分界\s*(\d+)\s*分/.exec(String(d.verdict || ""));
    if (m) cut = Number(m[1]);
  }
  if (cut != null && cut <= 0) cut = null;
  let refText = "—", delta = null;
  if (cut != null) {
    refText = ((d.direction === "lower_better") ? "≤ " : "≥ ") + cut + " 分";
    delta = (d.direction === "lower_better") ? (cut - total) : (total - cut);
  }
  return {
    name: d.name, kind: "scale", domain: null,
    total, max, cutoff: cut, cutoffEdu: d.cutoffEdu || null,
    direction: d.direction || "higher_better",
    refText, delta, verdict: d.verdict || null, metrics: [],
  };
}

/* 范式卡片：优先用当前定义现算；没有作答可依的历史记录，退回分组得分并标记 legacy */
function paradigmCard(d, opts) {
  const { answers = {}, scores = {}, education = "", patient = null } = opts || {};
  const pa = PARADIGMS.find((x) => x.code === d.code) || null;
  const dim = SCORE_DIM[d.code] || null;
  /* 有作答还不够：老记录的作答键（题号）可能与现行题库对不上，
     这时按现算口径会算出「0 分」，比不显示更误导 —— 一并按历史记录处理 */
  const ids = new Set(((pa && pa.items) || []).map((i) => i.id));
  const hasAnswer = Object.keys(answers).some((k) => ids.has(k));

  let metrics = [];
  if (pa && pa.items && pa.items.length) {
    const ind = paradigmIndicators(d.code, pa, scores, answers, {
      total: d.total, max: d.max, education, age: ageOf(patient && patient.birth_date),
    }) || [];
    /* 满分算成 0 或整行是「—」说明题结构与作答不匹配，宁可不显示也不编 */
    const usable = ind.filter((x) => x && x.v != null && x.v !== "—");
    if (usable.length >= 2) {
      const picks = (dim && dim.pick) || [];
      metrics = ind.map((x) => Object.assign({}, x, { p: picks.includes(x.k) }));
    }
  }

  const bg = d.byGroup || {};
  const bm = d.byGroupMax || {};
  const legacy = !hasAnswer || !metrics.length;
  if (legacy) {
    /* 旧记录的分组名（「连线A」「一致」「图片命名」…）本身就是旧口径，
       摆到新报告里只会和「计分维度」自相矛盾 —— 宁可不显示，只说明原因。 */
    metrics = [];
  }

  /* 计分分值与总分：优先从计分项里解析（如「卡片 C 正确数 42 / 50」），
     没有计分项时退回明细里记录的 total/max——避免旧明细的满分（如 SPAN 7）
     与新定义（14）不一致时把报告写错。 */
  /* 卡片右上角的「计分 x / y」：优先取该范式的主计分指标（SCORE_DIM.main），
     其次「总分 / 总正确数」这一行，最后任意计分项。计时型范式（TMT）没有分值，
     不给计分——否则会出现「计分 0 / 600」这种误导性数字。 */
  let scored = null;
  if (!legacy && !(dim && dim.noScore)) {
    scored = { total: num(d.total), max: num(d.max) };
    const prim = metrics.filter((x) => x.p);
    const rx = /^(\d+)\s*\/\s*(\d+)$/;
    const pick = (arr) => (arr || []).map((x) => rx.exec(String(x.v || "").trim())).find(Boolean);
    const order = [
      dim && dim.main ? metrics.filter((x) => x.k === dim.main) : [],
      prim.filter((x) => /总分|总正确数/.test(x.k)),
      prim,
      metrics,
    ];
    const hit = order.map(pick).find(Boolean);
    if (hit) scored = { total: Number(hit[1]), max: Number(hit[2]) };
    if (!scored || !scored.max) scored = null;
  }

  return {
    name: (pa && pa.name) || d.name, kind: "paradigm", domain: (pa && pa.domain) || d.domain || null,
    total: null, max: null, cutoff: null, cutoffEdu: null, direction: null,
    refText: "—", delta: null, verdict: d.verdict || null,
    metrics,
    scoreDim: dim ? dim.k : "",
    scoreNote: dim ? dim.note : "",
    scored,
    legacy,
    legacyNote: legacy ? "历史记录：该次评估未留存逐题作答，无法按现行评分维度重算" : "",
  };
}

/* 由一条评估记录的明细重建 chart，不读库里的 chart 快照 */
function chartOfRecord(db, recordId, patient) {
  const rows = db.prepare("SELECT code, payload, raw FROM assess_detail WHERE record_id=? ORDER BY id").all(recordId);
  const ansStmt = db.prepare("SELECT item_id,value FROM assess_answer WHERE record_id=? AND code=?");
  const scStmt = db.prepare("SELECT item_id,score FROM assess_score WHERE record_id=? AND code=?");
  const out = [];
  for (const row of rows) {
    let d = null;
    try { d = JSON.parse(row.payload); } catch (e) { continue; }
    if (!d || !d.kind) continue;
    if (d.kind === "scale") { out.push(scaleCard(d)); continue; }
    let raw = {};
    try { raw = JSON.parse(row.raw || "{}"); } catch (e) { }
    const answers = {};
    for (const r of ansStmt.all(recordId, row.code)) {
      try { answers[r.item_id] = JSON.parse(r.value || "{}"); } catch (e) { }
    }
    /* 逐题评分：优先用明细里固化的 raw.scores，缺失时读评分表（演示/历史记录常见） */
    let scores = raw.scores && Object.keys(raw.scores).length ? raw.scores : {};
    if (!Object.keys(scores).length) {
      for (const r of scStmt.all(recordId, row.code)) scores[r.item_id] = r.score;
    }
    out.push(paradigmCard(d, {
      answers,
      scores,
      education: (patient && patient.education) || "",
      patient,
    }));
  }
  return out;
}

module.exports = { chartOfRecord, SCORE_DIM };
