/* icons.js —— HS-CRT-01 图标系统
 * 统一规格：24×24 网格 / 1.7px 描边 / 圆头圆角 / currentColor 单色
 * 设计原则：只画「认知加工过程」的抽象几何隐喻，不用 emoji、不用实物象形
 *           （购物篮/猫/对话气泡这类消费级图形与临床数字疗法语境冲突）。
 *           每个图标以「锚点 + 结构」表达一次认知操作；同一认知域共用一套骨架，
 *           六域图标是各自骨架的极简版，形成可辨识的家族感。
 * 用法：hsIcon("CA-01")  →  <svg class="hs-ico">…</svg>
 *      hsIcon("复合性注意", 20)
 */
(function (w) {
  var P = {
    /* ===== 复合性注意 —— 骨架：聚焦环 / 扫描框 / 靶点 ===== */
    // CA-01 信号捕捉：三层同心扫描环 + 中心靶点
    "CA-01": '<circle cx="12" cy="12" r="8.6" stroke-dasharray="2 3.4" opacity=".55"/><circle cx="12" cy="12" r="4.8" opacity=".8"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2"/>',
    // CA-02 目标搜索：四角取景框 + 点阵中唯一实心靶点
    "CA-02": '<path d="M3.8 8.4V5.2A1.4 1.4 0 0 1 5.2 3.8h3.2M15.6 3.8h3.2a1.4 1.4 0 0 1 1.4 1.4v3.2M20.2 15.6v3.2a1.4 1.4 0 0 1-1.4 1.4h-3.2M8.4 20.2H5.2a1.4 1.4 0 0 1-1.4-1.4v-3.2"/><circle cx="8.4" cy="8.4" r="1.05" opacity=".55"/><circle cx="12" cy="8.4" r="1.05" opacity=".55"/><circle cx="15.6" cy="8.4" r="1.05" opacity=".55"/><circle cx="8.4" cy="12" r="1.05" opacity=".55"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="15.6" cy="12" r="1.05" opacity=".55"/><circle cx="8.4" cy="15.6" r="1.05" opacity=".55"/><circle cx="12" cy="15.6" r="1.05" opacity=".55"/><circle cx="15.6" cy="15.6" r="1.05" opacity=".55"/>',
    // CA-03 一心二用：上下双通道并行加工
    "CA-03": '<rect x="2.8" y="3.4" width="18.4" height="17.2" rx="3.2"/><path d="M2.8 12h18.4" stroke-dasharray="2 2.4" opacity=".7"/><path d="M5.6 7.6h3.4M13.4 7.6h3.4" opacity=".8"/><path d="M5.6 16.4h5.6M14.2 16.4h3" opacity=".8"/><circle cx="19" cy="7.6" r="1.3" fill="currentColor" stroke="none"/><circle cx="11" cy="16.4" r="1.3" fill="currentColor" stroke="none"/>',
    // CA-04 快速切换：两条规则路径经中枢换向
    "CA-04": '<path d="M3.2 7.4h8.4"/><path d="M9.6 4.9l2.7 2.5-2.7 2.5"/><path d="M20.8 16.6h-8.4"/><path d="M14.4 14.1l-2.7 2.5 2.7 2.5"/><circle cx="12" cy="12" r="2.1"/>',

    /* ===== 执行能力 —— 骨架：节点 / 路径 / 层级 ===== */
    // EX-01 色词辨析：两个错位的通道（字义与字色）+ 冲突分界
    "EX-01": '<rect x="3.4" y="3.4" width="10" height="10" rx="2.6"/><rect x="10.6" y="10.6" width="10" height="10" rx="2.6" opacity=".55"/><path d="M4.2 19.8L19.8 4.2" stroke-dasharray="2 2.4" opacity=".65"/><circle cx="8.4" cy="8.4" r="1.7" fill="currentColor" stroke="none"/>',
    // EX-02 智慧连线：节点序列 + 顺序连线
    "EX-02": '<circle cx="4.6" cy="17.4" r="2"/><circle cx="9.6" cy="7.4" r="2"/><circle cx="14.6" cy="15.4" r="2"/><circle cx="19.4" cy="6.6" r="2"/><path d="M6.3 15.9l2-6.5M11.4 9l1.9 4.6M16.3 14.1l1.3-5.5"/><circle cx="4.6" cy="17.4" r=".7" fill="currentColor" stroke="none"/>',
    // EX-03 宝塔规划：目标点向三层子目标拆解
    "EX-03": '<circle cx="12" cy="4" r="1.8" fill="currentColor" stroke="none"/><path d="M12 6v3.2M6.6 12.4v2M12 9.2v3.2M17.4 12.4v2"/><path d="M4.2 12.4h15.6" opacity=".55"/><rect x="3.6" y="14.4" width="6" height="5.6" rx="1.8"/><rect x="9" y="14.4" width="6" height="5.6" rx="1.8"/><rect x="14.4" y="14.4" width="6" height="5.6" rx="1.8"/>',
    // EX-04 数字倒数：序列方块 + 逆向提取
    "EX-04": '<rect x="2.8" y="4" width="5.2" height="5.2" rx="1.6"/><rect x="9.4" y="4" width="5.2" height="5.2" rx="1.6"/><rect x="16" y="4" width="5.2" height="5.2" rx="1.6"/><circle cx="5.4" cy="6.6" r="1" fill="currentColor" stroke="none"/><path d="M18.6 12.6v4.8H5.4v-4.8"/><path d="M8 14.8L5.4 17.4 8 20"/>',

    /* ===== 学习与记忆 —— 骨架：编码 / 保持 / 提取回路 ===== */
    // LM-01 数字传真：三个编码单元 + 复述回路
    "LM-01": '<rect x="2.8" y="9" width="4.6" height="6.6" rx="1.5"/><rect x="9.7" y="9" width="4.6" height="6.6" rx="1.5"/><rect x="16.6" y="9" width="4.6" height="6.6" rx="1.5"/><path d="M4.6 6.2h14.8"/><path d="M17 3.8l2.4 2.4-2.4 2.4"/><circle cx="5.1" cy="12.3" r="1" fill="currentColor" stroke="none"/>',
    // LM-02 词海拾贝：词表 + 延迟提取时钟
    "LM-02": '<rect x="3" y="3.4" width="12.4" height="17.2" rx="2.6"/><path d="M6.4 8h5.6M6.4 11.4h5.6M6.4 14.8h3.2"/><circle cx="17.6" cy="16.6" r="4.2"/><path d="M17.6 14.2v2.6l1.8 1.2"/>',
    // LM-03 图像配对：四象限 + 对角联想 + 两个锚点
    "LM-03": '<rect x="2.8" y="4" width="7.6" height="7.6" rx="2"/><rect x="13.6" y="4" width="7.6" height="7.6" rx="2"/><rect x="2.8" y="13.6" width="7.6" height="7.6" rx="2"/><rect x="13.6" y="13.6" width="7.6" height="7.6" rx="2"/><path d="M10.4 8h3.2" stroke-dasharray="1.8 2"/><circle cx="6.6" cy="7.8" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.4" cy="17.4" r="1.5" fill="currentColor" stroke="none"/>',
    // LM-04 超市购物：清单勾选 + 前瞻延迟
    "LM-04": '<rect x="3" y="3.2" width="12" height="17.6" rx="2.6"/><path d="M6.2 8.2l1.4 1.4 2.2-2.4M6.2 13.4l1.4 1.4 2.2-2.4M6.2 18.2h5.6"/><circle cx="17.8" cy="17" r="4"/><path d="M17.8 15v2.2l1.6 1"/>',

    /* ===== 语言 —— 骨架：声波 / 语义网络 / 图词通路 ===== */
    // LA-01 看图命名：图框 + 语音输出波形
    "LA-01": '<rect x="2.8" y="4.6" width="10.4" height="14.8" rx="2.4"/><circle cx="7" cy="9.6" r="1.5"/><path d="M3.6 17l3.6-3.4 2.4 2.3 1.8-1.7 1.8 1.7"/><path d="M15.4 9.2a4.6 4.6 0 0 1 0 5.6M18.2 6.8a8 8 0 0 1 0 10.4"/>',
    // LA-02 词汇风暴：中心词节点向语义网络发散
    "LA-02": '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="4.6" cy="5.4" r="1.6"/><circle cx="19.4" cy="5.4" r="1.6"/><circle cx="4.6" cy="18.6" r="1.6"/><circle cx="19.4" cy="18.6" r="1.6"/><path d="M10.4 10.4L6 6.6M13.6 10.4L18 6.6M10.4 13.6L6 17.4M13.6 13.6L18 17.4" opacity=".7"/>',
    // LA-03 词图匹配：词块 ↔ 图块 双向映射
    "LA-03": '<rect x="2.6" y="6.4" width="6.6" height="11.2" rx="2"/><path d="M5 10h2.2M5 13.2h2.2M5 16h1.4"/><rect x="14.8" y="6.4" width="6.6" height="11.2" rx="2"/><path d="M16.6 15.4l2.4-4.8 2.4 4.8z"/><path d="M9.6 12h4.8M12 10.2l1.8 1.8-1.8 1.8"/>',
    // LA-04 听指令行动：声波 → 有序动作序列
    "LA-04": '<path d="M3 9.4a5.4 5.4 0 0 1 8.2-1.6 5.4 5.4 0 0 1 0 8.4"/><path d="M4.6 12h2.2M7.4 9.8v4.4"/><rect x="13.4" y="4" width="7.8" height="4" rx="1.4"/><rect x="13.4" y="10" width="7.8" height="4" rx="1.4"/><rect x="13.4" y="16" width="7.8" height="4" rx="1.4"/>',

    /* ===== 视结构-知觉能力 —— 骨架：几何对比 / 变换 / 轨迹 ===== */
    // VP-01 火眼金睛：两个相似图形 + 差异锚点
    "VP-01": '<rect x="2.8" y="5" width="8" height="8" rx="2"/><rect x="13.2" y="5" width="8" height="8" rx="2"/><circle cx="6.8" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.2" cy="9" r="1.5"/><path d="M4.4 16.6h15.2" stroke-dasharray="1.8 2.4" opacity=".6"/>',
    // VP-02 巧手拼搭：等距立方体空间构建
    "VP-02": '<path d="M12 2.8l7.6 4.4v9.6L12 21.2l-7.6-4.4V7.2z"/><path d="M12 2.8v9.6M12 12.4l7.6-5.2M12 12.4L4.4 7.2"/>',
    // VP-03 空间旋转：形状 + 心理旋转轨迹
    "VP-03": '<rect x="2.6" y="8.8" width="6.6" height="6.6" rx="1.6"/><path d="M10.6 12.1h2.8"/><path d="M17.4 7.4a6 6 0 1 1-4.6 9.2"/><path d="M12.8 16.6l-.6-2.6 2.6-.4"/><circle cx="5.9" cy="12.1" r="1.1" fill="currentColor" stroke="none"/>',
    // VP-04 妙笔临摹：虚线底稿 + 实线笔迹 + 笔尖锚点
    "VP-04": '<path d="M3 18.4l5.8-8.4 3.4 4.6 3-3.8 5.8 7.6" stroke-dasharray="2.4 2.2" opacity=".55"/><path d="M3 18.4l5.8-8.4 3.4 4.6 3-3.8 5.8 7.6"/><circle cx="21" cy="18.4" r="1.5" fill="currentColor" stroke="none"/>',

    /* ===== 社会认知 —— 骨架：双心智节点 / 会话 / 隐含层 ===== */
    // SC-01 察言观色：情绪轮廓 + 强度梯度
    "SC-01": '<circle cx="11.6" cy="12" r="8"/><circle cx="8.8" cy="10.2" r="1" fill="currentColor" stroke="none"/><circle cx="14.4" cy="10.2" r="1" fill="currentColor" stroke="none"/><path d="M8 14.2a4.4 4.4 0 0 0 7.2 0"/><path d="M19.4 5.2a4 4 0 0 1 0 5.6M21.6 3.4a6.6 6.6 0 0 1 0 9.2" opacity=".65"/>',
    // SC-02 心有灵犀：两个心智节点 + 推断连接
    "SC-02": '<circle cx="7.8" cy="12" r="5.4"/><circle cx="17" cy="12" r="5.4" opacity=".6"/><path d="M12.2 9.6v4.8" stroke-dasharray="1.8 2"/><circle cx="7.8" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="1.2"/>',
    // SC-03 得体应对：会话情境 + 分岔选择
    "SC-03": '<path d="M3.4 7.4a2.8 2.8 0 0 1 2.8-2.8h8.4a2.8 2.8 0 0 1 2.8 2.8v5.6a2.8 2.8 0 0 1-2.8 2.8H8.6l-3.8 2.8v-2.8h-.6A2.8 2.8 0 0 1 3.4 13z"/><path d="M7 9.4h6.6"/><path d="M16.6 17.2v4.2M14.6 19.4l2 1.8 2-1.8" opacity=".7"/>',
    // SC-04 言外之意：显性语句 + 隐含层
    "SC-04": '<path d="M20 10.4c0 3.1-3.3 5.6-7.4 5.6-.9 0-1.8-.1-2.6-.3L6.2 18.4l.8-3.1c-1.4-1-2.2-2.5-2.2-4.2 0-3.1 3.3-5.6 7.4-5.6s7.8 2.5 7.8 4.9z"/><path d="M8.4 10.2h7.2" opacity=".6"/><path d="M3.4 20.4h9.2" stroke-dasharray="1.8 2.2" opacity=".55"/>',

    /* ===== 六域图标（各域骨架的极简版，用于分组标题 / 标签 / 筛选） ===== */
    "复合性注意": '<circle cx="12" cy="12" r="8.4" stroke-dasharray="2 3.2" opacity=".6"/><circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    "执行能力": '<circle cx="12" cy="4.6" r="1.7" fill="currentColor" stroke="none"/><path d="M12 6.4v3.4M5.4 13v2.4M12 9.8v3.2M18.6 13v2.4M3.4 11.6h17.2" opacity=".7"/><rect x="2.6" y="15.4" width="5.6" height="5" rx="1.6"/><rect x="9.2" y="15.4" width="5.6" height="5" rx="1.6"/><rect x="15.8" y="15.4" width="5.6" height="5" rx="1.6"/>',
    "学习与记忆": '<rect x="2.8" y="8.8" width="5" height="7" rx="1.6"/><rect x="9.5" y="8.8" width="5" height="7" rx="1.6"/><rect x="16.2" y="8.8" width="5" height="7" rx="1.6"/><path d="M4.6 5.6h14.8"/><path d="M17 3.2l2.4 2.4-2.4 2.4"/>',
    "语言": '<path d="M3 9a4.6 4.6 0 0 1 7-1.4A4.6 4.6 0 0 1 10 14.8"/><path d="M4.6 12h2M7.2 9.6v4.8"/><path d="M14 8.4a5 5 0 0 1 0 7.2M17.4 5.8a8.4 8.4 0 0 1 0 12.4"/>',
    "视结构-知觉能力": '<path d="M12 2.8l7.6 4.4v9.6L12 21.2l-7.6-4.4V7.2z"/><path d="M12 2.8v9.6M12 12.4l7.6-5.2M12 12.4L4.4 7.2"/>',
    "社会认知": '<circle cx="8" cy="12" r="5.2"/><circle cx="17" cy="12" r="5.2" opacity=".6"/><circle cx="8" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12.2 9.6v4.8" stroke-dasharray="1.8 2"/>',

    /* ===== 评定量表 / 范式（患者端任务清单复用） ===== */
    "MMSE": '<rect x="4.3" y="3.3" width="15.4" height="17.4" rx="2.8"/><path d="M7.6 8.1h8.8M7.6 11.4h8.8M7.6 14.7h4.4"/><path d="M13.2 17.5l1.7 1.7 3-3.1"/>',
    "MoCA": '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.9v5.4l3.4 2"/>',
    "ADAS": '<path d="M14.5 5.3l4.2 4.2L8.4 19.8H4.2v-4.2z"/><path d="M12.9 6.9l4.2 4.2"/>',
    "SPAN": '<path d="M20.1 12.4a8.1 8.1 0 1 1-2.7-6.2"/><path d="M20.5 3.9v4.3h-4.3"/><circle cx="8.9" cy="12.2" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12.2" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.1" cy="12.2" r="1.2" fill="currentColor" stroke="none"/>',
    "CPT": '<circle cx="12" cy="12" r="7.8" stroke-dasharray="2.2 2.6"/><circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none"/><path d="M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1"/>',
    "SDMT": '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3.2"/><circle cx="8.3" cy="8.3" r="1.45"/><circle cx="12" cy="8.3" r="1.45"/><circle cx="15.7" cy="8.3" r="1.45"/><circle cx="8.3" cy="12" r="1.45"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="15.7" cy="12" r="1.45"/><circle cx="8.3" cy="15.7" r="1.45"/><circle cx="12" cy="15.7" r="1.45"/><circle cx="15.7" cy="15.7" r="1.45"/>',
    "TMT": '<circle cx="4.8" cy="17.6" r="2.1"/><circle cx="9.9" cy="7.7" r="2.1"/><circle cx="14.6" cy="15.3" r="2.1"/><circle cx="19.4" cy="6.6" r="2.1"/><path d="M6.5 16.1l2.1-6.2M11.7 8.9l1.7 4.6M16.4 14l1.7-5.5"/>',
    "STROOP": '<path d="M4.4 18.9L10.3 5.1h1.4l5.9 13.8"/><path d="M7.1 13.9h7.9"/><circle cx="19.7" cy="7.1" r="1.9" fill="currentColor" stroke="none"/>',
    "TOL": '<path d="M3.4 19.9h17.2"/><path d="M7 19.9V7.2M12 19.9V7.2M17 19.9V7.2"/><path d="M5.1 17.4h3.8M5.9 14.6h2.2M10.1 17.4h3.8M15.1 17.4h3.8M15.9 14.6h2.2"/>',
    "AVLT": '<rect x="4.3" y="3.3" width="15.4" height="17.4" rx="2.8"/><path d="M7.6 8.1h8.8M7.6 11.4h8.8M7.6 14.7h4.4"/><path d="M13.2 17.5l1.7 1.7 3-3.1"/>',
    "REC": '<rect x="3.3" y="3.3" width="7.4" height="7.4" rx="2.1"/><rect x="13.3" y="3.3" width="7.4" height="7.4" rx="2.1"/><rect x="3.3" y="13.3" width="7.4" height="7.4" rx="2.1"/><rect x="13.3" y="13.3" width="7.4" height="7.4" rx="2.1"/><circle cx="7" cy="7" r="1.7" fill="currentColor" stroke="none"/><circle cx="17" cy="17" r="1.7" fill="currentColor" stroke="none"/><path d="M9.3 9.3l5.4 5.4" stroke-dasharray="2 2.2"/>',
    "BNT": '<rect x="3.2" y="4.3" width="17.6" height="15.4" rx="2.9"/><circle cx="8.7" cy="9.5" r="1.75"/><path d="M4.1 17.4l4.6-4.5 3.2 3.1 2.9-2.7 5.2 4.8"/>',
    "FLU": '<path d="M3.4 8.3a3.1 3.1 0 0 1 3.1-3.1h11a3.1 3.1 0 0 1 3.1 3.1v6.1a3.1 3.1 0 0 1-3.1 3.1h-6.3l-3.8 2.9v-2.9h-.9a3.1 3.1 0 0 1-3.1-3.1z"/><path d="M7.2 8.8h9.6M7.2 11.9h6.2"/>',
    "CDT": '<circle cx="12" cy="12" r="8.4"/><path d="M12 12V6.6M12 12l3.6 3.4"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/>',
    "COPY": '<path d="M14.5 5.3l4.2 4.2L8.4 19.8H4.2v-4.2z"/><path d="M12.9 6.9l4.2 4.2"/><path d="M4.2 19.8l4.2-4.2"/>',

    /* ===== 门户 / 端别 ===== */
    // UI-BRAIN 认知：双半球轮廓（左右对称的脑叶折叠）
    "UI-BRAIN": '<path d="M9.6 2.6a2.4 2.4 0 0 1 2.4 2.4v14.4a2.4 2.4 0 0 1-4.7.6 2.4 2.4 0 0 1-2.8-3 2.9 2.9 0 0 1-.3-5.4 2.4 2.4 0 0 1 1.3-4.1 2.4 2.4 0 0 1 1.9-2.9 2.4 2.4 0 0 1 2.2-2z"/><path d="M14.4 2.6A2.4 2.4 0 0 0 12 5v14.4a2.4 2.4 0 0 0 4.7.6 2.4 2.4 0 0 0 2.8-3 2.9 2.9 0 0 0 .3-5.4 2.4 2.4 0 0 0-1.3-4.1 2.4 2.4 0 0 0-1.9-2.9 2.4 2.4 0 0 0-2.2-2z"/>',
    // UI-DOCTOR 医生端：听诊器
    "UI-DOCTOR": '<path d="M5.2 2.8a.3.3 0 0 0 .3-.3H4.2a2.2 2.2 0 0 0-2.2 2.2v4.6a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4.7a2.2 2.2 0 0 0-2.2-2.2h-1.3a.3.3 0 0 0 .3.3"/><path d="M8 15.3v1.2a5.9 5.9 0 0 0 11.8 0v-3.1"/><circle cx="19.8" cy="11.2" r="2.1"/>',
    // UI-ADMIN 管理端：控制台面板
    "UI-ADMIN": '<rect x="3.1" y="4.2" width="17.8" height="15.6" rx="3"/><path d="M3.1 9.1h17.8"/><path d="M9.1 9.1v10.7"/><path d="M12.2 12.4h5.6M12.2 15.6h3.6"/>',
    // UI-PATIENT 患者端：手机
    "UI-PATIENT": '<rect x="6.6" y="2.6" width="10.8" height="18.8" rx="2.9"/><path d="M10.5 5.4h3"/><path d="M10.8 18.4h2.4"/>',
    // UI-PLAY 试玩：播放三角（数字疗法试玩入口）
    "UI-PLAY": '<circle cx="12" cy="12" r="8.6"/><path d="M10.2 8.6l5.2 3.4-5.2 3.4z" fill="currentColor" stroke="none"/>',
    // UI-SOUND 朗读：扬声器 + 两道声波
    "UI-SOUND": '<path d="M4 9.4h3.4l4.2-3.5v12.2l-4.2-3.5H4z"/><path d="M15.2 9.3a3.9 3.9 0 0 1 0 5.4"/><path d="M17.9 6.7a7.5 7.5 0 0 1 0 10.6" opacity=".55"/>',
    // UI-MUTE 静音：扬声器 + 一道斜杠（无声波）
    "UI-MUTE": '<path d="M4 9.4h3.4l4.2-3.5v12.2l-4.2-3.5H4z"/><path d="M15.4 9.6l5 5M20.4 9.6l-5 5"/>',
    // UI-CHEVRON 展开/收起：向下折角（收起时 CSS 旋转 -90°）
    "UI-CHEVRON": '<path d="M6.6 9.4L12 14.8l5.4-5.4"/>',

    "_default": '<circle cx="12" cy="12" r="8.4"/><path d="M8.6 12h6.8M12 8.6v6.8"/>'
  };

  var SVG_ATTR = 'class="hs-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

  w.HS_ICONS = P;
  w.hsIcon = function (code, size) {
    var body = P[code] || P["_default"];
    var wh = size ? ' width="' + size + '" height="' + size + '"' : "";
    return "<svg " + SVG_ATTR + wh + ">" + body + "</svg>";
  };
  // 兼容旧引擎对全局 ICONS[code] 的引用（games.js 里取的是 HTML 串，这里返回 SVG 串）
  w.hsIcons = new Proxy({}, {
    get: function (_, k) { return typeof k === "string" ? w.hsIcon(k) : ""; }
  });

  // 声明式注入：<i data-ico="CA-01"></i>（静态页用，避免手写重复 SVG）
  w.hsMount = function (root) {
    (root || document).querySelectorAll("[data-ico]").forEach(function (el) {
      if (el.dataset.mounted) return;
      el.innerHTML = w.hsIcon(el.dataset.ico);
      el.dataset.mounted = "1";
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { w.hsMount(); });
  else w.hsMount();
})(window);
