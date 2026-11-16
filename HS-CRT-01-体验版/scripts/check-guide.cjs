/**
 * 指导语数据一致性校验（只读）
 * 1. 每个条目都有 p（指导语）与 o（客观操作）
 * 2. bands 分值必须落在 0..itemMaxOf 内，且首档 = 满分
 * 3. 演示题（demo）必须 bands 为空
 * 4. 量表总分 = sum(itemMax)，与量表 total 一致
 * 5. 范式逐题覆盖
 */
const { SCALES, PARADIGMS } = require("../server/seed-data");
const { SCALE_GUIDE, PARADIGM_GUIDE } = require("../server/guide-data");
const { itemMaxOf } = require("../server/paradigm-metrics");

const bad = [], warn = [];
const Y = (t) => console.log("  ✓ " + t);

function checkItems(kind, meta, guide) {
  if (!guide) { bad.push(`[${kind}] ${meta.code} 无 guide`); return; }
  const gi = guide.items || {};
  const miss = meta.items.filter((it) => !gi[it.id]);
  if (miss.length) bad.push(`[${kind}] ${meta.code} 缺指导语条目: ${miss.map((m) => m.id).join(",")}`);

  let sum = 0;
  for (const it of meta.items) {
    const g = gi[it.id];
    const max = itemMaxOf(it);
    if (!it.demo) sum += max;
    if (!g) continue;
    if (!g.p) bad.push(`[${kind}] ${meta.code}.${it.id} 缺指导语 p`);
    if (!g.o) bad.push(`[${kind}] ${meta.code}.${it.id} 缺客观操作 o`);
    if (!Array.isArray(g.bands)) { bad.push(`[${kind}] ${meta.code}.${it.id} bands 不是数组`); continue; }

    if (it.demo) {
      if (g.bands.length) bad.push(`[${kind}] ${meta.code}.${it.id} 演示题不应有分档`);
      continue;
    }
    if (!g.bands.length) { bad.push(`[${kind}] ${meta.code}.${it.id} 计分题缺分档（max=${max}）`); continue; }

    const vals = g.bands.map((b) => b[0]);
    const top = Math.max(...vals);
    if (top !== max) bad.push(`[${kind}] ${meta.code}.${it.id} 首档 ${top} ≠ 满分 ${max}`);
    if (Math.min(...vals) !== 0) bad.push(`[${kind}] ${meta.code}.${it.id} 缺 0 分档`);
    if (vals.some((v) => v < 0 || v > max)) bad.push(`[${kind}] ${meta.code}.${it.id} 存在越界分值 ${vals.join("/")}`);
    if (new Set(vals).size !== vals.length) bad.push(`[${kind}] ${meta.code}.${it.id} 分档分值重复 ${vals.join("/")}`);
    if (g.bands.some((b) => !b[1])) bad.push(`[${kind}] ${meta.code}.${it.id} 分档缺判据文字`);
  }
  return sum;
}

console.log("===== 量表 =====");
for (const sc of SCALES) {
  const sum = checkItems("量表", sc, SCALE_GUIDE[sc.code]);
  const ok = sum === sc.total;
  console.log(`  ${ok ? "✓" : "✗"} ${sc.code} ${sc.name}  逐题满分合计 ${sum} / 量表 total ${sc.total}  · 条目 ${sc.items.length}`);
  if (!ok) bad.push(`[量表] ${sc.code} 逐题满分合计 ${sum} ≠ total ${sc.total}`);
}

console.log("\n===== 范式 =====");
for (const pa of PARADIGMS) {
  const sum = checkItems("范式", pa, PARADIGM_GUIDE[pa.code]);
  console.log(`  ✓ ${pa.code} ${pa.name}  · 条目 ${pa.items.length} · 逐题满分 ${sum}`);
}

console.log("\n===== 结果 =====");
if (bad.length) {
  console.log(`✗ ${bad.length} 项问题：`);
  bad.forEach((b) => console.log("   " + b));
  process.exitCode = 1;
} else {
  console.log("✓ 全部一致：指导语、客观操作、分档均与计分口径匹配");
}
