// paradigm-metrics.js —— 范式客观指标计算
// 各范式需要记录的指标不同（完成时间、正确数、错误数、广度、干扰量、辨别力……），
// 按范式自身的指标定义分别计算，不做百分制或跨范式换算。
// 输入：scores = { 题目ID: 得分 }，answers = { 题目ID: { parts:[...], sec } }
// 输出：[{ k: 指标名, v: 指标值 }]，顺序即展示顺序

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const itemMaxOf = (it) => it.scoring === "item"
  ? (it.max || 0)
  : (it.parts || []).reduce((a, p) => a + (p.max != null ? p.max : 1), 0);
/* 满分（可随作答变化的题型）：画钟等范式的满分取决于医生选用的评分法，
   由题目上的 maxBy = { field, map } 声明——从作答里取 field 的值，查 map 得满分。
   没有 maxBy 或作答里没记该字段时，回落到题目固定的满分。 */
const maxOfItem = (it, answers) => {
  const by = it && it.maxBy;
  const a = by && answers ? answers[it.id] : null;
  const v = by && a && by.map ? by.map[a[by.field]] : null;
  return v != null ? (Number(v) || 0) : itemMaxOf(it);
};

const itemsOf = (meta) => ((meta && meta.items) || []).filter((it) => !it.demo);
const grp = (its, g) => its.filter((it) => it.g === g);
const partOf = (answers, id, i) => {
  const a = answers && answers[id];
  const ps = a && Array.isArray(a.parts) ? a.parts : [];
  return ps[i == null ? 0 : i];
};
const secOf = (answers, id) => Math.round(n(answers && answers[id] ? answers[id].sec : 0));
const secSum = (its, answers) => its.reduce((a, it) => a + secOf(answers, it.id), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const secTxt = (s) => (s > 0 ? s + " 秒" : "—");
const plus = (v) => (v > 0 ? "+" : "") + v;

function paradigmIndicators(code, meta, scores, answers, fallback) {
  const its = itemsOf(meta);
  if (!its.length) return [];
  const all = its.length;
  const ok = (id) => n(scores && scores[id]) > 0;
  const okCount = (arr) => arr.filter((it) => ok(it.id)).length;
  const sumScore = (arr) => arr.reduce((a, it) => a + n(scores && scores[it.id]), 0);
  const sumMax = (arr) => arr.reduce((a, it) => a + maxOfItem(it, answers), 0);
  const totalSec = secTxt(secSum(its, answers));
  const hitOf = (arr) => arr.filter((it) => ok(it.id)).length;
  // 连线顺序与期望序列的错位处数（作为错误数客观记录）
  const seqErrors = (it) => {
    const exp = String((it.parts && it.parts[0] && it.parts[0].expect) || "").split(",").filter(Boolean);
    const got = String(partOf(answers, it.id) || "").split(",").filter(Boolean);
    if (!got.length) return 0;
    let e = 0;
    for (let i = 0; i < Math.max(exp.length, got.length); i++) if ((exp[i] || "") !== (got[i] || "")) e++;
    return e;
  };

  switch (code) {
    /* 数字广度：顺背/倒背各按「正确数列数」计分，总分=两者之和；另记各方向最长正确位数 */
    case "SPAN": {
      // 教育分层界值：文盲 >5、小学 >6、初中及以上 >7 属正常（见 08 校准文档 4.1）
      const cutOf = (edu) => {
        const e = String((fallback && fallback.education) || edu || "");
        if (/文盲/.test(e)) return 5;
        if (/小学/.test(e)) return 6;
        return 7;
      };
      const fwdArr = grp(its, "顺背"), bwdArr = grp(its, "倒背");
      const fwdScore = sumScore(fwdArr), bwdScore = sumScore(bwdArr);
      const total = fwdScore + bwdScore;
      const spanOf = (arr) => arr.reduce((best, it) => {
        if (!(n(scores && scores[it.id]) > 0)) return best;
        return Math.max(best, Number(it.len) || 0);
      }, 0);
      const cut = cutOf();
      const edu = (fallback && fallback.education) || "";
      return [
        { k: "顺背得分", v: fwdScore + " / " + sumMax(fwdArr) },
        { k: "倒背得分", v: bwdScore + " / " + sumMax(bwdArr) },
        { k: "总分", v: total + " / " + (sumMax(fwdArr) + sumMax(bwdArr)) },
        { k: "顺背广度", v: spanOf(fwdArr) + " 位" },
        { k: "倒背广度", v: spanOf(bwdArr) + " 位" },
        {
          k: "参考判读",
          v: (total > cut ? "总分 > " + cut + "，处于正常范围" : "总分 ≤ " + cut + "，低于参考范围")
            + "（" + (edu || "教育程度未记录按初中及以上界值") + "）",
        },
        { k: "用时", v: totalSec },
      ];
    }

    /* 持续性操作：记录数目标次数是否正确 */
    case "CPT":
      return [
        { k: "正确题数", v: okCount(its) + "/" + all },
        { k: "错误数", v: (all - okCount(its)) + " 题" },
        { k: "正确率", v: pct(okCount(its), all) + "%" },
        { k: "用时", v: totalSec },
      ];

    /* 符号数字转换：作答表整串留存（行内逐格、_ 表示空），正确/错误/完成量逐格比对得出 */
    case "SDMT": {
      const total = fallback && fallback.total != null ? n(fallback.total) : sumScore(its);
      const max = fallback && fallback.max != null ? n(fallback.max) : sumMax(its);
      const rows = (meta && meta.cfg && meta.cfg.rows) || [];
      const sheet = String(partOf(answers, (its[0] || {}).id) || "");
      let okN = 0, badN = 0, filled = 0;
      if (sheet) {
        sheet.split("|").forEach((line, ri) => {
          const exp = rows[ri] || [];
          line.split("").forEach((ch, ci) => {
            if (!ch || ch === "_") return;
            filled++;
            if (n(ch) === n(exp[ci])) okN++; else badN++;
          });
        });
      }
      const cut = (meta && meta.cfg && meta.cfg.cutoff) || 21;
      return [
        { k: "正确数", v: (sheet ? okN : total) + " / " + max },
        { k: "错误数", v: badN + " 个" },
        { k: "完成量", v: filled + " / " + (rows.reduce((a, r) => a + r.length, 0) || 105) + " 格" },
        { k: "得分率", v: pct(sheet ? okN : total, max) + "%" },
        { k: "参考判读", v: (n(sheet ? okN : total) > cut ? "正确数 > " + cut : "正确数 ≤ " + cut) + (n(sheet ? okN : total) > cut ? "，处于正常范围" : "，低于参考范围") },
        { k: "用时", v: totalSec },
      ];
    }

    /* 连线：A/B 部分完成时间 + 连接错误数 + 忽略错误数，并按年龄/教育程度给分层临界值 */
    case "TMT": {
      const cfg = (meta && meta.cfg) || {};
      const a = grp(its, "A 部分")[0], b = grp(its, "B 部分")[0];
      const info = (it) => {
        const ans = (it && answers && answers[it.id]) || {};
        return {
          has: !!it,
          sec: Math.round(n(ans.sec)),
          err: Math.round(n(ans.err)),
          skip: Math.round(n(ans.skip)),
          done: ans.completed !== false,   // 未标注视为已完成
        };
      };
      const A = info(a), B = info(b);
      const timeTxt = (x) => (!x.has ? "—" : x.sec > 0 ? x.sec + " 秒" + (x.done ? "" : "（未完成）") : "—");
      const cntTxt = (x, f) => (!x.has ? "—" : x[f] + " 次");
      const age = n(fallback && fallback.age);
      const edu = String((fallback && fallback.education) || "");
      const eduYears = { "文盲": 0, "小学": 6, "初中": 9, "高中": 12, "大学及以上": 16 }[edu];
      const band = (age && eduYears != null)
        ? (cfg.cutoffs || []).find((r) => age >= r.ageMin && age <= r.ageMax && (r.eduLt16 === (eduYears < 16)))
        : null;
      let cutTxt = "—", judge = "缺年龄或教育程度，未做分层判读";
      if (band) {
        cutTxt = "A ≤ " + band.A + " 秒、B ≤ " + band.B + " 秒（"
          + band.ageMin + "–" + band.ageMax + " 岁，教育" + (band.eduLt16 ? "<16" : "≥16") + " 年）";
        const over = [];
        if (A.has && A.sec > band.A) over.push("A " + A.sec + " 秒 > " + band.A + " 秒");
        if (B.has && B.sec > band.B) over.push("B " + B.sec + " 秒 > " + band.B + " 秒");
        judge = over.length ? "超出临界值：" + over.join("；") : "A、B 用时均在临界值内";
      } else if (age && eduYears != null) {
        judge = "年龄 " + age + " 岁超出记录单分层范围（55–98 岁），请人工判读";
      }
      return [
        { k: "A 完成时间", v: timeTxt(A) },
        { k: "A 连接错误数", v: cntTxt(A, "err") },
        { k: "A 忽略错误数", v: cntTxt(A, "skip") },
        { k: "B 完成时间", v: timeTxt(B) },
        { k: "B 连接错误数", v: cntTxt(B, "err") },
        { k: "B 忽略错误数", v: cntTxt(B, "skip") },
        { k: "分层临界值", v: cutTxt },
        { k: "参考判读", v: judge },
        { k: "总用时", v: totalSec },
      ];
    }

    /* 色词：三张卡片各自的用时与正确数；SIE 耗时 = C − B，SIE 准确数 = C 正确数 − B 正确数 */
    case "STROOP": {
      const cfg = (meta && meta.cfg) || {};
      const per = cfg.perCard || 50;
      const cut = cfg.cutoff || 39;
      /* 三张卡片的用时/正确数/读成字义都记在作答里（SA/SB/SC），不计分，供主试评估 */
      const info = (key) => {
        const a = (answers && answers[key]) || null;
        return {
          has: !!a,
          sec: Math.round(n(a && a.sec)),
          ok: a && a.ok != null ? Math.round(n(a.ok)) : null,
          bad: Math.round(n(a && a.bad)),
          semantic: a && a.semantic != null ? Math.round(n(a.semantic)) : null,
          done: !a || a.completed !== false,
        };
      };
      const A = info("SA"), B = info("SB"), C = info("SC");
      const tTxt = (x) => (!x.has || !x.sec ? "—" : x.sec + " 秒" + (x.done ? "" : "（未读完）"));
      const oTxt = (x) => (!x.has || x.ok == null ? "—" : x.ok + " / " + per);
      const sieT = (B.sec && C.sec) ? plus(C.sec - B.sec) + " 秒" : "—";
      const sieOk = (B.ok != null && C.ok != null) ? plus(C.ok - B.ok) + " 个" : "—";
      const score = C.ok;
      const judge = score == null
        ? "—"
        : (score > cut ? "评分 " + score + " > " + cut + "，处于正常范围" : "评分 " + score + " ≤ " + cut + "，低于参考范围");
      return [
        { k: "卡片 A 用时", v: tTxt(A) },
        { k: "卡片 A 正确数", v: oTxt(A) },
        { k: "卡片 B 用时", v: tTxt(B) },
        { k: "卡片 B 正确数", v: oTxt(B) },
        { k: "卡片 C 用时", v: tTxt(C) },
        { k: "卡片 C 正确数", v: oTxt(C) },
        /* 卡片 C 的错误形态：把字义当颜色读出来的次数（Stroop 干扰的典型表现） */
        { k: "C 读成字义", v: C.semantic == null ? "—" : C.semantic + " 次" },
        { k: "SIE耗时数", v: sieT },
        { k: "SIE准确数", v: sieOk },
        { k: "评分与判读", v: judge },
      ];
    }

    /* 伦敦塔：四项主要指标（总正确数 / 总步数 / 总计划时间 / 总执行时间） */
    case "TOL": {
      const a = (answers && (answers.L1 || answers[its[0] && its[0].id])) || {};
      const rows = Array.isArray(a.rows) ? a.rows : [];
      const formal = rows.filter((r) => !r.prac);
      const correct = a.correct != null ? n(a.correct) : formal.filter((r) => r.ok).length;
      /* 总步数 = Σ(实际步数 − 最少步数)，只计走过的题（含未完成题） */
      const extra = a.extra != null
        ? n(a.extra)
        : formal.reduce((s, r) => s + Math.max(0, n(r.moves) - n(r.min)), 0);
      const plan = a.planSec != null ? n(a.planSec) : formal.reduce((s, r) => s + n(r.plan), 0);
      const exec = a.execSec != null ? n(a.execSec) : formal.reduce((s, r) => s + n(r.exec), 0);
      const maxN = n(meta && meta.cfg && meta.cfg.max) || sumMax(its);
      const solved = formal.filter((r) => r.solved).length;
      return [
        { k: "总正确数", v: correct + "/" + maxN },
        { k: "总步数", v: extra + " 步" },
        { k: "总计划时间", v: secTxt(plan) },
        { k: "总执行时间", v: secTxt(exec) },
        { k: "完成题数", v: solved + "/" + (formal.length || maxN) },
      ];
    }

    /* 词语学习：即刻回忆 / 延迟回忆的正确词数 + 遗忘数 */
    case "AVLT": {
      const imm = grp(its, "即刻回忆"), del = grp(its, "延迟回忆");
      const i1 = sumScore(imm), d1 = sumScore(del);
      return [
        { k: "即刻回忆", v: i1 + "/" + (sumMax(imm) || 12) },
        { k: "延迟回忆", v: d1 + "/" + (sumMax(del) || 12) },
        { k: "遗忘数", v: (imm.length && del.length ? (i1 - d1) : 0) + " 个" },
        { k: "用时", v: totalSec },
      ];
    }

    /* 图形再认：命中 / 虚报 / 辨别力（命中率 − 虚报率） */
    case "REC": {
      const rc = grp(its, "再认");
      let hit = 0, fa = 0;
      rc.forEach((it) => {
        const exp = it.parts && it.parts[0] ? it.parts[0].expect : null;
        const got = partOf(answers, it.id);
        if (got == null || got === "") return;
        if (exp === "是") { if (got === "是") hit++; }
        else if (got === "是") fa++;
      });
      const targetN = rc.filter((it) => it.parts && it.parts[0] && it.parts[0].expect === "是").length;
      const foilN = rc.length - targetN;
      const dprime = targetN && foilN ? (pct(hit, targetN) - pct(fa, foilN)) / 100 : null;
      return [
        { k: "命中数", v: hit + "/" + targetN },
        { k: "虚报数", v: fa + "/" + foilN },
        { k: "辨别力", v: dprime == null ? "—" : dprime.toFixed(2) },
        { k: "用时", v: totalSec },
      ];
    }

    /* 图片命名（BNT，30 幅）：按记录单六项统计；总分 = 无提示正确 + 语义提示后正确 */
    case "BNT": {
      const cfg = (meta && meta.cfg) || {};
      const a = (answers && (answers.B1 || answers[its[0] && its[0].id])) || {};
      const total = n(a.total) || (n(a.ok1) + n(a.ok3));
      const cut = n(cfg.cutoff) || 24;
      const maxN = n(cfg.max) || 30;
      const verdict = total > cut
        ? `得分 ${total} > ${cut}，处于正常范围`
        : `得分 ${total} ≤ ${cut}，提示命名能力下降`;
      return [
        { k: "无提示正确数", v: n(a.ok1) + " / " + maxN },
        { k: "语义提示数", v: n(a.sem) + " 次" },
        { k: "语义提示后正确数", v: n(a.ok3) + " 次" },
        { k: "语音提示数", v: n(a.ph) + " 次（不计分）" },
        { k: "语音提示后正确数", v: n(a.ok5) + " 次（不计分）" },
        { k: "总分", v: total + " / " + maxN },
        { k: "用时", v: totalSec },
        { k: "参考判读", v: verdict },
      ];
    }

    /* 词语流畅：两类任务的产词数 */
    case "FLU": {
      const a = grp(its, "类别流畅")[0], d = grp(its, "首字流畅")[0];
      const numOf = (it) => {
        if (!it) return "—";
        const v = partOf(answers, it.id);
        const s = n(scores && scores[it.id]);
        return (v != null && v !== "" ? v : s) + " 个";
      };
      return [
        { k: "动物词数", v: numOf(a) },
        { k: "“大”字词数", v: numOf(d) },
        { k: "用时", v: totalSec },
      ];
    }

    /* 画钟 / 临摹：要素得分（医生复核）；画钟另记所用评分法与判读 */
    case "CDT":
    case "COPY": {
      // 早期记录的题目编号与现行题库不一致时，回退到汇总得分与全部作答耗时
      const sc = sumScore(its) || n(fallback && fallback.total);
      const mx = sumMax(its) || n(fallback && fallback.max);
      const anySec = Object.keys(answers || {})
        .reduce((a, id) => a + Math.round(n(answers[id] && answers[id].sec)), 0);
      const out = [
        { k: "要素得分", v: sc + "/" + mx },
        { k: "用时", v: totalSec !== "—" ? totalSec : (anySec > 0 ? anySec + " 秒" : "—") },
      ];
      const a0 = its.map((it) => answers && answers[it.id]).find((a) => a && a.cdtScaleName) || null;
      if (code === "CDT" && a0) {
        out.splice(1, 0, { k: "评分法", v: a0.cdtScaleName });
        if (a0.cdtRule) out.push({ k: "参考判读", v: a0.cdtRule });
      }
      return out;
    }

    /* 其余范式：按分组给出正确数 / 项数 + 用时 */
    default: {
      const out = [...new Set(its.map((it) => it.g))].map((g) => {
        const arr = grp(its, g);
        return { k: g, v: sumScore(arr) + "/" + sumMax(arr) };
      });
      out.push({ k: "用时", v: totalSec });
      return out;
    }
  }
}

module.exports = { paradigmIndicators, itemMaxOf, maxOfItem };
