// seed-data.js —— 量表库 / 范式库 / 训练方案库初始数据（受控初始数据，对应 PRD 第5、7章）
// 说明：本体验版内置临床常用量表的操作化条目与计分规则，仅供体验与内部演示；
//       注册版的条目文本、常模与分界值须经临床专家确认并做信效度验证。

/* 数字广度（SPAN）的刺激序列与条目（照《数字广度测验记录表》录入；顺背 3–12 位 / 倒背 2–10 位，每长度 2 试） */
const { SPAN_CFG, SPAN_ITEMS } = require("./span-data");
const { SDMT_KEY, SDMT_PRACTICE, SDMT_ROWS, SDMT_CFG } = require("./sdmt-data");
const { TMT_BOARDS, TMT_CFG } = require("./tmt-data");
const { STROOP_COLORS, STROOP_INK, STROOP_CFG, STROOP_CARDS } = require("./stroop-data");
const { CDT_SCALES, CDT_DEFAULT_SCALE } = require("./cdt-data");
const { BNT_ITEMS, BNT_CFG } = require("./bnt-data");
const { TOL_CFG } = require("./tol-data");

/* ==================== 量表库 ==================== */
// 施测模型：每个条目由 1～n 个「作答单元」(parts) 组成，患者逐题作答，医生按单元判分。
// part.mode：fill(填空，患者输入) / judge(口述或动作，医生判定) / draw(手写绘制，医生判定) / number(数值，医生录入)
// part.expect：可自动比对的期望答案（@year/@month/@day/@weekday/@season 为按施测日期计算）
const SCALES = [
  {
    code: "MMSE", name: "简易精神状态量表（MMSE）", total: 30, minutes: "8–10",
    // 全量表由主试口述施测、主试评分（张明园中文修订版记录单）：
    // 屏幕只呈现指导语，不设麦克风 / 填空 / 图片 / 折纸 / 画布等患者交互，
    // 避免把「主试施测」做成「患者自测」；材料由主试当面出示，逐题评分后汇总。
    examinerOnly: true,
    desc: "19 题 30 分：定向力 10、即刻回忆 3、计算和注意力 5、命名 2、复述 1、阅读 1、理解 3、书写 1、视空间知觉 1、延迟回忆 3。",
    direction: "higher_better",
    items: [
      { id: "Q01", g: "定向力", t: "今年的年份？", parts: [{ u: "年", mode: "judge" }] },
      { id: "Q02", g: "定向力", t: "现在是什么季节？", parts: [{ mode: "judge" }] },
      { id: "Q03", g: "定向力", t: "现在是几月？", parts: [{ u: "月", mode: "judge" }] },
      { id: "Q04", g: "定向力", t: "今天是几号？", parts: [{ u: "日", mode: "judge" }] },
      { id: "Q05", g: "定向力", t: "今天是星期几？", parts: [{ mode: "judge" }] },
      { id: "Q06", g: "定向力", t: "您现在住在哪个城市？", parts: [{ mode: "judge" }] },
      { id: "Q07", g: "定向力", t: "您现在住在什么区（县）？", parts: [{ mode: "judge" }] },
      { id: "Q08", g: "定向力", t: "您现在住在什么街道（乡）？", parts: [{ mode: "judge" }] },
      { id: "Q09", g: "定向力", t: "我们现在是第几层楼？", parts: [{ u: "层", mode: "judge" }] },
      { id: "Q10", g: "定向力", t: "我们这儿是什么单位？", parts: [{ mode: "judge" }] },
      { id: "Q11", g: "即刻回忆", t: "现在我说三样东西的名称，在我全部讲完之后，请您重复说一遍，并记住这三样东西，因为等一下要再问您：皮球、国旗、树木。",
        parts: [{ l: "皮球", mode: "judge" }, { l: "国旗", mode: "judge" }, { l: "树木", mode: "judge" }] },
      { id: "Q12", g: "计算和注意力", t: "现在请您计算 100 连续减去 7，共计算 5 次，说出每减一次的得数。",
        parts: [{ l: "第 1 次", mode: "judge" }, { l: "第 2 次", mode: "judge" }, { l: "第 3 次", mode: "judge" },
          { l: "第 4 次", mode: "judge" }, { l: "第 5 次", mode: "judge" }] },
      { id: "Q13", g: "命名", t: "（主试出示手表）请问这是什么？（出示铅笔）请问这是什么？",
        parts: [{ l: "手表", mode: "judge" }, { l: "铅笔", mode: "judge" }] },
      { id: "Q14", g: "复述", t: "现在我说一句话，请您按照我说的话原样地重复一遍：四十四只石狮子。", parts: [{ l: "复述", mode: "judge" }] },
      { id: "Q15", g: "阅读", t: "请您读这张卡片所写的句子，并照着去做。", parts: [{ l: "按卡片执行", mode: "judge" }] },
      { id: "Q16", g: "理解", t: "请您用右手拿这张纸，把纸对折，再将纸放在地面上。",
        parts: [{ l: "三步命令", mode: "paper", max: 3 }] },
      { id: "Q17", g: "书写", t: "请您写一句完整的、有意义的句子（句子必须有主语、动词）。", parts: [{ l: "书写", mode: "judge" }] },
      { id: "Q18", g: "视空间知觉", t: "请您按样子画图。", figure: "pentagons", parts: [{ l: "临摹双五边形", mode: "judge" }] },
      { id: "Q19", g: "延迟回忆", t: "现在请您告诉我，刚才我要您记住的三样东西是什么？",
        parts: [{ l: "皮球", mode: "judge" }, { l: "国旗", mode: "judge" }, { l: "树木", mode: "judge" }] },
    ],
    cutoff: { edu: [["文盲", 17], ["小学", 20], ["中学", 24], ["大学及以上", 24]], text: "总分低于分界值提示认知功能受损可能" },
  },
  {
    code: "MoCA", name: "蒙特利尔认知评估量表（MoCA）", total: 30, minutes: "10–12",
    // 与 MMSE 同一施测模型：全量表由主试逐条念读指导语施测，被试口述或用纸笔在记录单上作答，
    // 主试按记录单分档逐题评分。屏幕只呈现指导语与必需刺激材料（连线图 / 立方体 / 动物图片），
    // 连线不设点选、画钟与立方体不设画布——这些动作在记录单上用笔完成。
    examinerOnly: true,
    desc: "17 题 30 分：视空间/执行 5（交替连线 1、立方体 1、画钟 3）、命名 3、注意 6（顺背/倒背/警觉性各 1、100 连续减 7 计 3）、语言 3、抽象 2（火车—自行车、手表—尺子各 1）、延迟回忆 5、定向 6；教育程度≤12 年加 1 分。",
    direction: "higher_better",
    items: [
      // 条目 ID 沿用历史编号（M13 橘子—香蕉为练习、M15 延迟回忆、M16 定向），
      // 新增的手表—尺子取 M17，避免既有记录按 ID 错位。
      { id: "M01", g: "视空间/执行",
        t: "请您画一条连线，按照从数字到汉字并逐渐升高的顺序。您从这里开始〔指向数字 1〕，从 1 连向甲，再连向 2，并一直连下去，到这里结束〔指向汉字 戊〕。",
        figure: "mocaPath", parts: [{ l: "交替连线", mode: "judge" }] },
      { id: "M02", g: "视空间/执行", t: "请您照着这幅图在下面的空白处原样画一遍，并尽可能准确。",
        figure: "cube", parts: [{ l: "临摹立方体", mode: "judge" }] },
      { id: "M03", g: "视空间/执行", t: "请您在这画一个圆形的表，像一般钟表一样填齐所有数字，并用指针画出 11 点 10 分。",
        scoring: "item", max: 3, parts: [{ l: "画钟", mode: "judge" }] },
      { id: "M04", g: "命名", t: "请您告诉我这个动物的名字。",
        animals: ["lion", "rhino", "camel"],
        parts: [{ l: "第 1 只", mode: "judge" }, { l: "第 2 只", mode: "judge" }, { l: "第 3 只", mode: "judge" }] },
      { id: "M05", g: "记忆（学习）", demo: true,
        t: "下面我读几个词，请您仔细听，读完后请尽量重复一遍：面孔、天鹅绒、教堂、菊花、红色。",
        parts: [{ l: "第 1 次复述", mode: "judge" }, { l: "第 2 次复述", mode: "judge" }] },
      { id: "M06", g: "注意", t: "下面请您仔细听我说一些数字，当我说完时您就跟着照样背出来：2 — 1 — 8 — 5 — 4。",
        parts: [{ l: "顺背", mode: "judge" }] },
      { id: "M07", g: "注意", t: "下面我再说一些数字，请您仔细听，当我说完时请您按我说的数字顺序倒着背出来：7 — 4 — 2。",
        parts: [{ l: "倒背", mode: "judge" }] },
      { id: "M08", g: "注意", t: "下面我要读出一串数字，请注意听。每当我读到 1 的时候，您就拍一下手；当我读到其他数字时不要拍手。",
        parts: [{ l: "警觉性", mode: "judge" }] },
      { id: "M09", g: "注意", t: "现在请您做一道计算题，计算 100 连续减去 7，共计算 5 次，将每次计算的得数告诉我。",
        scoring: "item", max: 3,
        parts: [{ l: "第 1 次", mode: "judge" }, { l: "第 2 次", mode: "judge" }, { l: "第 3 次", mode: "judge" },
          { l: "第 4 次", mode: "judge" }, { l: "第 5 次", mode: "judge" }] },
      { id: "M10", g: "语言", t: "现在我要对您说一句话，我说完后请您按我说的话原样重复出来：我只知道今天张亮是来帮过忙的人。",
        parts: [{ l: "复述句 1", mode: "judge" }] },
      { id: "M11", g: "语言", t: "现在我再对您说一句话，我说完后请您也照原样重复出来：狗在房间的时候，猫总是躲在沙发下面。",
        parts: [{ l: "复述句 2", mode: "judge" }] },
      { id: "M12", g: "语言", t: "请您尽可能快、尽可能多地说出您所知道的动物的名称。时间是 1 分钟。",
        parts: [{ l: "词语流畅性", mode: "judge" }] },
      { id: "M13", g: "抽象", demo: true, t: "请您说说橘子和香蕉在什么方面相类似？", parts: [{ l: "练习", mode: "judge" }] },
      { id: "M14", g: "抽象", t: "您再说说火车和自行车在什么方面相类似？", parts: [{ l: "火车—自行车", mode: "judge" }] },
      { id: "M17", g: "抽象", t: "您再说说手表和尺子在什么方面相类似？", parts: [{ l: "手表—尺子", mode: "judge" }] },
      { id: "M15", g: "延迟回忆", t: "刚才我给您读了几个词让您记住，请您再尽量回忆一下，告诉我这些词都有什么？",
        parts: [{ l: "第 1 个词", mode: "judge" }, { l: "第 2 个词", mode: "judge" }, { l: "第 3 个词", mode: "judge" },
          { l: "第 4 个词", mode: "judge" }, { l: "第 5 个词", mode: "judge" }] },
      { id: "M16", g: "定向", t: "请您告诉我今天的日期、月份、年份、星期几，以及这是什么地方、哪个城市。",
        parts: [{ l: "日期", mode: "judge" }, { l: "月份", mode: "judge" }, { l: "年份", mode: "judge" },
          { l: "星期几", mode: "judge" }, { l: "地点", mode: "judge" }, { l: "城市", mode: "judge" }] },
    ],
    adjust: { type: "education_le12_add1" },
    cutoff: { fixed: 26, text: "总分≥26为正常参考值" },
  },
  {
    code: "ADAS", name: "阿尔茨海默病评定量表-认知部分（ADAS-Cog）", total: 75, minutes: "20–45",
    // 与 MMSE/MoCA 同一施测模型：主试逐条念读指导语、出示物品与词表，被试口述或纸笔作答，
    // 主试按记录单分档逐题评分；屏幕只呈现指导语、必需刺激材料与词表。
    examinerOnly: true,
    desc: "12 条目操作化计分（单词回忆 0–10、单词再认 0–12、定向 0–8、其余 9 条目各 0–5），总分 0–75，得分越高提示认知活动受损越明显，供医师判读。",
    direction: "lower_better",
    answerMode: "judge",
    items: [
      { id: "A01", g: "单词回忆", t: "刚才我给您读了 10 个词，请您把能记住的词都说出来（不要求顺序）。",
        parts: [{ l: "第 1 个", mode: "judge" }, { l: "第 2 个", mode: "judge" }, { l: "第 3 个", mode: "judge" },
          { l: "第 4 个", mode: "judge" }, { l: "第 5 个", mode: "judge" }, { l: "第 6 个", mode: "judge" },
          { l: "第 7 个", mode: "judge" }, { l: "第 8 个", mode: "judge" }, { l: "第 9 个", mode: "judge" },
          { l: "第 10 个", mode: "judge" }] },
      { id: "A02", g: "命名", t: "（出示物品与手指）请您依次说出它们的名称。", type: "number", scoring: "item", max: 5 },
      { id: "A03", g: "指令", t: "下面请您做几个动作，请您按我的指令去做。", type: "number", scoring: "item", max: 5 },
      { id: "A04", g: "结构性练习", t: "请您照着这四幅图形，一幅一幅地画一遍。", figure: "adasFour", scoring: "item", max: 5,
        parts: [{ l: "临摹四图", mode: "draw" }] },
      { id: "A05", g: "意象性练习", t: "这是一封写给您的信。请将这张纸折叠起来，以便能装进信封，然后把纸放进信封内；再将信封封口，在信封上写上您自己的地址，然后告诉我邮票贴在哪儿。", type: "number", scoring: "item", max: 5 },
      { id: "A06", g: "定向", t: "请告诉我今天是哪一年、几月、几号、星期几、什么季节，以及我们现在在什么地方、第几层楼。", type: "number", scoring: "item", max: 8 },
      { id: "A07", g: "单词辨认任务", t: "我现在给您出示一些单词。我希望您大声读出来，并尽量记住。", type: "number", scoring: "item", max: 12 },
      { id: "A08", g: "回忆测验指令", t: "（评定项）患者对测验要求的记忆程度。", type: "number", scoring: "item", max: 5 },
      { id: "A09", g: "口头语言能力", t: "（评定项）患者言语的可理解程度。", type: "number", scoring: "item", max: 5 },
      { id: "A10", g: "找词困难", t: "（评定项）患者自发找词困难的程度。", type: "number", scoring: "item", max: 5 },
      { id: "A11", g: "口头语言理解能力", t: "（评定项）患者口头语言理解能力。", type: "number", scoring: "item", max: 5 },
      { id: "A12", g: "注意力", t: "（评定项）患者注意力集中程度。", type: "number", scoring: "item", max: 5 },
    ],
    cutoff: null,
  },
  {
    code: "IMCT", name: "常识-记忆-注意测验量表（IMCT）", total: 30, minutes: "8–10",
    // 主试施测：逐条念读指导语，被试口头回答，主试按错误分档评分。
    examinerOnly: true,
    desc: "常识 10、记忆 12、注意 8，按错误计分（每题 0/2 或 0/4），总分 0–30，得分越高提示认知损害越重，供医师判读。",
    direction: "lower_better",
    answerMode: "judge",
    items: [
      { id: "I01", g: "常识", t: "请您告诉我您的年龄。", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill" }] },
      { id: "I02", g: "常识", t: "现在是几点？（说出小时即可）", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill" }] },
      { id: "I03", g: "常识", t: "我们现在在什么地方？", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill" }] },
      { id: "I04", g: "常识", t: "今年是哪一年？", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill", expect: "@year" }] },
      { id: "I05", g: "常识", t: "现在是几月？", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill", expect: "@month" }] },
      { id: "I06", g: "记忆", t: "请说说您以前从事什么工作（曾任职务）。", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill" }] },
      { id: "I07", g: "记忆", t: "您的出生日期是哪一天？", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill" }] },
      { id: "I08", g: "记忆", t: "我们国家现任领导人是谁？", scoring: "item", max: 2, step: 2, parts: [{ mode: "fill" }] },
      { id: "I09", g: "记忆", t: "请说说昨天发生的一件事。", scoring: "item", max: 2, step: 2, parts: [{ mode: "judge" }] },
      { id: "I10", g: "记忆", t: "第二次世界大战结束于哪一年？", scoring: "item", max: 4, step: 2, parts: [{ mode: "fill", expect: "1945" }] },
      { id: "I11", g: "注意", t: "请您从 20 倒数到 1。", scoring: "item", max: 4, step: 2, parts: [{ mode: "judge" }] },
      { id: "I12", g: "注意", t: "请您把月份从 12 月倒着数到 1 月。", scoring: "item", max: 4, step: 2, parts: [{ mode: "judge" }] },
    ],
    cutoff: null,
  },
  {
    code: "CCSE", name: "认知能力筛查量表（CCSE）", total: 30, minutes: "8–10",
    // 主试施测：30 题逐条念读，被试口头或纸笔回答，主试逐题判定 0/1 分。
    examinerOnly: true,
    desc: "30 题各 1 分：定向 10、常识与个人信息 6、记忆与计算 7、语言与视空间 7，总分 0–30，供认知能力筛查参考。",
    direction: "higher_better",
    answerMode: "judge",
    items: [
      ["今年是哪一年？", "fill", { expect: "@year" }],
      ["现在是几月？", "fill", { expect: "@month" }],
      ["今天是几号？", "fill", { expect: "@day" }],
      ["今天是星期几？", "fill", { expect: "@weekday" }],
      ["现在是几点？（说出钟点）", "fill", {}],
      ["您现在在哪个省、哪个市？", "fill", {}],
      ["您现在在哪个区（县）？", "fill", {}],
      ["这是哪家医院（机构）？", "fill", {}],
      ["我们现在在第几层楼？", "fill", {}],
      ["这里是什么场所？", "fill", {}],
      ["您的年龄？", "fill", {}],
      ["您的出生年月？", "fill", {}],
      ["现任国家主席是谁？", "fill", {}],
      ["上一任国家主席是谁？", "fill", {}],
      ["您以前从事什么职业？", "fill", {}],
      ["您的学历？", "fill", {}],
      ["请您从 20 倒数到 1。", "judge", {}],
      ["请您计算 100 连续减 7，共计算 5 次。", "judge", {}],
      ["请跟我重复：皮球。", "judge", {}],
      ["请跟我重复：国旗。", "judge", {}],
      ["请跟我重复：树木。", "judge", {}],
      ["刚才请您记住的三样东西，第一样是什么？", "judge", {}],
      ["第二样是什么？", "judge", {}],
      ["第三样是什么？", "judge", {}],
      ["请跟我重复：四十四只石狮子。", "judge", {}],
      ["（出示图片）这是什么？", "judge", { emojis: ["⌚"] }],
      ["（出示图片）这是什么？", "judge", { emojis: ["✏️"] }],
      ["请读这句话，并照着做。", "judge", { card: "闭上您的眼睛" }],
      ["请写一个完整的、有意义的句子。", "draw", {}],
      ["请照样子临摹这两个相交的五边形。", "draw", { figure: "pentagons" }],
    ].map(([t, mode, ex], i) => ({
      id: "S" + String(i + 1).padStart(2, "0"),
      g: i < 10 ? "定向" : i < 16 ? "常识/个人" : i < 23 ? "记忆与计算" : "语言与视空间",
      t, ...ex,
      parts: [{ mode }],
    })),
    cutoff: null,
  },
  {
    code: "AMT", name: "简易智力检测量表（AMTS）", total: 10, minutes: "3–5",
    // 主试施测：逐条念读，被试口头回答，主试逐题判定 0/1 分。
    examinerOnly: true,
    desc: "11 个小题共 10 分（第 3 题为地址识记，不计分）；低于 7～8 分时提示认知下降可能。",
    direction: "higher_better",
    answerMode: "judge",
    items: [
      { id: "T1", g: "定向与识记", t: "请您告诉我您的年龄。", parts: [{ mode: "fill" }] },
      { id: "T2", g: "定向与识记", t: "请您告诉我现在的时间（几点）。", parts: [{ mode: "fill" }] },
      { id: "T3", g: "定向与识记", demo: true, t: "我现在告诉您我们这儿的地址，请您跟我说一遍，并记住，过一会儿我还要问您。",
        parts: [{ l: "复述地址", mode: "judge" }] },
      { id: "T4", g: "常识与注意", t: "请您告诉我今年是哪一年？", parts: [{ mode: "fill", expect: "@year" }] },
      { id: "T5", g: "常识与注意", t: "请您告诉我我们单位的名称。", parts: [{ mode: "fill" }] },
      { id: "T6", g: "常识与注意", t: "请您告诉我，我是做什么工作的？", parts: [{ mode: "fill" }] },
      { id: "T7", g: "常识与注意", t: "请您告诉我您的生日。", parts: [{ mode: "fill" }] },
      { id: "T8", g: "常识与注意", t: "请您告诉我们国家的国庆节是哪一天？", parts: [{ mode: "fill", expect: "10月1日" }] },
      { id: "T9", g: "常识与注意", t: "请您告诉我们国家现在的主席是谁？", parts: [{ mode: "fill" }] },
      { id: "T10", g: "常识与注意", t: "请您按顺序从 20 数到 1。", parts: [{ mode: "judge" }] },
      { id: "T11", g: "延迟回忆", t: "请您告诉我们这儿的地址，刚才我和您说过。", parts: [{ mode: "fill" }] },
    ],
    cutoff: { fixed: 7, text: "总分≤7 提示认知功能受损可能" },
  },
];

/* ==================== 范式库 ==================== */
// runner 为患者端交互引擎标识；scoring 为服务端指标计算说明
const PARADIGMS = [
  // 数字广度：刺激序列照记录表录入（见 span-data.js），顺背 3–12 位、倒背 2–10 位，每长度 2 试，每正确背出 1 个序列 1 分
  { code: "SPAN", name: "数字广度测验", domain: "注意", minutes: 5, runner: "span",
    desc: "顺背/倒背数字串，测注意广度与工作记忆。", cfg: { ...SPAN_CFG },
    items: SPAN_ITEMS,
    metrics: ["顺背得分", "倒背得分", "总分", "顺背广度", "倒背广度"] },
  { code: "CPT", name: "持续性操作测验（CPT）", domain: "注意", minutes: 5, runner: "cpt",
    desc: "连续字符流中对目标反应，测持续注意与反应抑制。", cfg: { isi: 1100, trials: 60, targetRatio: 0.25 },
    items: [
      { id: "P1", g: "目标计数", t: "下面是一串数字，请数一数「7」一共出现了几次：3 7 1 9 7 4 1 8 7 2 5 7。",
        scoring: "item", max: 2, step: 2, parts: [{ mode: "fill", expect: "4" }] },
      { id: "P2", g: "目标计数", t: "请数一数「5」一共出现了几次：6 5 2 5 8 5 1 3 5 9 4 5 7 5。",
        scoring: "item", max: 2, step: 2, parts: [{ mode: "fill", expect: "5" }] },
      { id: "P3", g: "目标计数", t: "请数一数「2」一共出现了几次：2 8 3 2 6 2 9 2 1 2 4 7 2 3 2。",
        scoring: "item", max: 2, step: 2, parts: [{ mode: "fill", expect: "6" }] },
    ],
    metrics: ["正确率", "漏报率", "平均反应时"] },
  { code: "SDMT", name: "符号数字转换测验（SDMT）", domain: "注意", minutes: 3, runner: "sdmt",
    desc: "90 秒内按 KEY 图解在符号下方填数字，测信息处理速度。",
    cfg: { ...SDMT_CFG, key: SDMT_KEY, practice: SDMT_PRACTICE, rows: SDMT_ROWS },
    items: [
      { id: "S1", g: "符号-数字转换", t: "请按 KEY 图解，在每个符号下方填上对应的数字，越快越好，90 秒内填到哪算到哪。",
        parts: [{ l: "90 秒正确填写个数", mode: "number", max: SDMT_CFG.maxScore }] },
    ],
    metrics: ["正确数", "错误数", "完成量", "用时"] },
  { code: "TMT", name: "连线测试（TMT-A/B）", domain: "执行", minutes: 10, runner: "tmt",
    desc: "A 部分按 1→25 顺序连线、B 部分按 1→A→2→B……交替连线；记录完成时间与错误数。",
    cfg: { ...TMT_CFG, boards: TMT_BOARDS },
    items: [
      { id: "TA", g: "A 部分", t: "A 部分：从数字 1 开始，按 1、2、3……从小到大的顺序连线，一直连到终点。",
        parts: [{ l: "完成时间", mode: "number", max: 300 }] },
      { id: "TB", g: "B 部分", t: "B 部分：从数字 1 开始，按 1→A→2→B……数字与字母交替的顺序连线，一直连到终点。",
        parts: [{ l: "完成时间", mode: "number", max: 300 }] },
    ],
    metrics: ["A 完成时间", "A 连接错误数", "A 忽略错误数", "B 完成时间", "B 连接错误数", "B 忽略错误数"] },
  { code: "STROOP", name: "Stroop 色词测验（SCWT）", domain: "执行", minutes: 5, runner: "stroop",
    desc: "三张卡片：A 读字、B 读点色、C 读墨色；记录每张的用时与正确数，干扰效应 = C − B。",
    cfg: { ...STROOP_CFG, cards: STROOP_CARDS, ink: STROOP_INK, colors: STROOP_COLORS },
    items: [
      /* 满分 50 = 卡片 C 的正确数；A/B 用时、读成字义、SIE 只作主试评估，不计分 */
      { id: "S1", g: "卡片 C", t: "色词任务：尽可能快、尽可能准确地读出字印刷的颜色，不要读字的意义。",
        parts: [{ l: "卡片 C 正确数", mode: "number", max: 50 }] },
    ],
    metrics: ["卡片 C 正确数（得分，满分 50）", "A/B/C 用时与正确数（供主试评估）", "C 读成字义", "SIE耗时数", "SIE准确数", "参考判读"] },
  { code: "TOL", name: "伦敦塔测验（TOL）", domain: "执行", minutes: 15, runner: "tol",
    desc: "3 珠 3 柱（柱高不等），先 2 题练习再 10 题正式（最少步数 3–7）；记录总正确数、总步数、总计划时间、总执行时间。",
    cfg: TOL_CFG,
    items: [
      /* 2 练习 + 10 正式共成一个总分：在限时内用最少步数解决的题数（满分 10） */
      { id: "L1", g: "移珠达成目标", t: "一次只移动一个最上面的珠子，通过移动珠子完成目标图的状态。",
        scoring: "item", max: 10, parts: [{ l: "总正确数", mode: "number", max: 10 }] },
    ],
    metrics: ["总正确数（得分，满分 10）", "总步数（实际 − 最少之和）", "总计划时间", "总执行时间"] },
  { code: "AVLT", name: "听觉词语学习测验（AVLT）", domain: "记忆", minutes: 10, runner: "avlt",
    desc: "词表学习-即刻回忆-干扰-延迟回忆-再认。", cfg: { listA: ["皮球","国旗","树木","咖啡","火车","阳光","苹果","课本","雨伞","钢琴","汽车","月亮"],
      listB: ["沙发","钢笔","冬天","香蕉","轮船","星星","面包","花瓶","帽子","电话","草地","眼镜"],
      targets: 12, foils: ["报纸","椅子","西瓜","街道","耳朵","风筝"] },
    items: [
      { id: "V0", g: "学习", demo: true, t: "下面我读 12 个词，请您仔细听并记住，读完后请尽量重复一遍（我会读 3 遍）：皮球、国旗、树木、咖啡、火车、阳光、苹果、课本、雨伞、钢琴、汽车、月亮。",
        parts: [{ l: "皮球", mode: "judge" }, { l: "国旗", mode: "judge" }, { l: "树木", mode: "judge" }, { l: "咖啡", mode: "judge" },
          { l: "火车", mode: "judge" }, { l: "阳光", mode: "judge" }, { l: "苹果", mode: "judge" }, { l: "课本", mode: "judge" },
          { l: "雨伞", mode: "judge" }, { l: "钢琴", mode: "judge" }, { l: "汽车", mode: "judge" }, { l: "月亮", mode: "judge" }] },
      { id: "V1", g: "即刻回忆", t: "刚才我读的 12 个词，请您把能记住的都说出来（不要求顺序）。",
        parts: [{ l: "第 1 个", mode: "judge" }, { l: "第 2 个", mode: "judge" }, { l: "第 3 个", mode: "judge" }, { l: "第 4 个", mode: "judge" },
          { l: "第 5 个", mode: "judge" }, { l: "第 6 个", mode: "judge" }, { l: "第 7 个", mode: "judge" }, { l: "第 8 个", mode: "judge" },
          { l: "第 9 个", mode: "judge" }, { l: "第 10 个", mode: "judge" }, { l: "第 11 个", mode: "judge" }, { l: "第 12 个", mode: "judge" }] },
      { id: "V2", g: "延迟回忆", t: "刚才那 12 个词，请您再尽量回忆一遍，把能记住的都说出来。",
        parts: [{ l: "第 1 个", mode: "judge" }, { l: "第 2 个", mode: "judge" }, { l: "第 3 个", mode: "judge" }, { l: "第 4 个", mode: "judge" },
          { l: "第 5 个", mode: "judge" }, { l: "第 6 个", mode: "judge" }, { l: "第 7 个", mode: "judge" }, { l: "第 8 个", mode: "judge" },
          { l: "第 9 个", mode: "judge" }, { l: "第 10 个", mode: "judge" }, { l: "第 11 个", mode: "judge" }, { l: "第 12 个", mode: "judge" }] },
    ],
    metrics: ["第1次即刻回忆", "延迟回忆", "再认辨别"] },
  { code: "REC", name: "图形再认测验", domain: "记忆", minutes: 5, runner: "rec",
    desc: "学习图形后再认新旧，测视觉记忆。", cfg: { study: 8, foils: 8, studyMs: 2500 },
    items: [
      { id: "R0", g: "学习", demo: true, t: "请看下面这 8 个图形，记住它们，看完后我会问您哪些是刚才见过的。",
        emojis: ["🍎", "🚗", "🌳", "🔑", "🎈", "🐟", "⚽", "☂️"], parts: [{ l: "已学习", mode: "judge" }] },
      { id: "R1", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🍎"], options: ["是", "否"], parts: [{ mode: "choice", expect: "是" }] },
      { id: "R2", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🐶"], options: ["是", "否"], parts: [{ mode: "choice", expect: "否" }] },
      { id: "R3", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🚗"], options: ["是", "否"], parts: [{ mode: "choice", expect: "是" }] },
      { id: "R4", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🪑"], options: ["是", "否"], parts: [{ mode: "choice", expect: "否" }] },
      { id: "R5", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🌳"], options: ["是", "否"], parts: [{ mode: "choice", expect: "是" }] },
      { id: "R6", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["📚"], options: ["是", "否"], parts: [{ mode: "choice", expect: "否" }] },
      { id: "R7", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🔑"], options: ["是", "否"], parts: [{ mode: "choice", expect: "是" }] },
      { id: "R8", g: "再认", t: "刚才学习过的图形里有这个吗？", emojis: ["🎈"], options: ["是", "否"], parts: [{ mode: "choice", expect: "是" }] },
    ],
    metrics: ["命中数", "虚报数", "辨别力"] },
  { code: "BNT", name: "波士顿命名测验（BNT）", domain: "语言", minutes: 6, runner: "bnt",
    desc: "30 幅线条图逐张命名（20 秒/张），记录无提示、语义提示、语音提示三级结果。",
    cfg: BNT_CFG,
    items: [
      // 整套 30 幅共出一个总分：无提示正确数 + 语义提示后正确数（最高 30 分）
      { id: "B1", g: "图片命名", t: "（逐张出示图片，每张 20 秒）请告诉我这张图片是什么。",
        scoring: "item", max: 30, parts: [{ l: "命名正确数", mode: "number", max: 30 }] },
    ],
    metrics: ["无提示正确数", "语义提示数", "语义提示后正确数", "语音提示数", "语音提示后正确数", "总分"] },
  { code: "FLU", name: "词语流畅性测验", domain: "语言", minutes: 3, runner: "flu",
    desc: "类别流畅（动物）与首字流畅（“大”），各60秒。", cfg: { tasks: [["动物", "ANIMAL"], ["大", "DA"]], duration: 60 },
    items: [
      { id: "F1", g: "类别流畅", t: "请您在 1 分钟内尽可能多地说出「动物」的名称，说得越多越好。",
        type: "number", scoring: "item", max: 10 },
      { id: "F2", g: "首字流畅", t: "请您在 1 分钟内尽可能多地说出以「大」字开头的词语，说得越多越好。",
        type: "number", scoring: "item", max: 10 },
    ],
    metrics: ["动物词数", "“大”字词数"] },
  { code: "CDT", name: "画钟测验（CDT）", domain: "视空间", minutes: 4, runner: "canvas",
    desc: "触屏画钟（11点10分），六种评分法任选，逐项勾选计分。",
    cfg: { prompt: "请画一个钟面，标出所有数字，并把指针指向11点10分", items: 10,
      scales: CDT_SCALES, defaultScale: CDT_DEFAULT_SCALE },
    items: [
      // max 为默认（10 分评分法）的满分；实际满分随医生所选评分法变化，见 maxBy
      { id: "D1", g: "画钟", t: "请画一个钟面，标出所有数字，并把指针指向 11 点 10 分。", scoring: "item", max: 10,
        maxBy: { field: "cdtScale", map: { s3: 3, s4: 4, s5: 5, s7: 7, s10: 10, s30: 30 } },
        parts: [{ l: "画钟", mode: "draw" }] },
    ],
    metrics: ["要素得分（按所选评分法，医生勾选）"] },
  { code: "COPY", name: "图形临摹测验", domain: "视空间", minutes: 4, runner: "canvas",
    desc: "临摹双五边形/立方体，要素判定+人工复核。", cfg: { prompt: "请尽量准确地临摹下图（两个相交的五边形）", items: 10 },
    items: [
      { id: "K1", g: "临摹", t: "请照样子临摹这两个相交的五边形，尽量准确。", figure: "pentagons", scoring: "item", max: 10,
        parts: [{ l: "临摹", mode: "draw" }] },
    ],
    metrics: ["要素得分（0–10，医生复核）"] },
];

/* ==================== 待开放项目 ====================
   条目内容已录入，但施测引擎 / 记录单尚未定稿（CPT、AVLT、REC、FLU 无独立引擎，COPY 复用画钟引擎，
   CCSE 条目仍在核对）。这些项目在「临时自定义评估项目」「方案管理」中置灰不可勾选，
   并统一排在各自分组的最后；某一项开放时只需从此表移除。 */
const PENDING_CODES = ["CCSE", "CPT", "AVLT", "REC", "FLU", "COPY"];

/* ==================== 训练方案库（DSM-5六域 24方案×10关） ==================== */
// archetype: stream(刺激流作答) / grid(网格搜索配对) / seq(序列输入) / recall(词语生成)
//          / mcq(选择题) / canvas(手写) / scene(场景寻物) / tower(规划谜题)
// levels: 每关参数（与 PRD 表7-2～7-25 一致），passRule 统一见服务端引擎
const P = (code, domain, name, archetype, desc, levels, extra = {}) =>
  ({ code, domain, name, archetype, desc, levels, ...extra });

const TRAININGS = [
  // —— 复合性注意 ——
  P("CA-01", "复合性注意", "信号捕捉", "stream", "持续性注意训练（CPT范式）：刺激流中捕捉目标",
    [{ isi: 1500, ratio: .3, distr: 0, dur: 180 }, { isi: 1300, ratio: .3, distr: 1, dur: 180 }, { isi: 1200, ratio: .25, distr: 2, dur: 240 },
     { isi: 1100, ratio: .25, distr: 2, dur: 240 }, { isi: 1000, ratio: .2, distr: 3, dur: 300 }, { isi: 900, ratio: .2, distr: 3, dur: 300, dual: 1 },
     { isi: 800, ratio: .2, distr: 4, dur: 360 }, { isi: 700, ratio: .15, distr: 4, dur: 360 }, { isi: 600, ratio: .15, distr: 4, dur: 420, dual: 1 },
     { isi: 500, ratio: .15, distr: 5, dur: 480, dual: 1 }]),
  P("CA-02", "复合性注意", "目标搜索", "grid", "选择性注意训练（视觉搜索）：干扰物中找全部目标",
    [{ n: 4, sim: 1, targets: 1, tl: 60 }, { n: 6, sim: 1, targets: 2, tl: 60 }, { n: 9, sim: 2, targets: 2, tl: 55 },
     { n: 12, sim: 2, targets: 3, tl: 55 }, { n: 16, sim: 3, targets: 3, tl: 50 }, { n: 20, sim: 3, targets: 4, tl: 50 },
     { n: 24, sim: 4, targets: 4, tl: 45 }, { n: 28, sim: 4, targets: 5, tl: 45 }, { n: 32, sim: 5, targets: 5, tl: 40 },
     { n: 36, sim: 5, targets: 6, tl: 40 }]),
  P("CA-03", "复合性注意", "一心二用", "stream", "分配性注意训练（双任务）：数字比较+图形计数",
    [{ isi: 3000, dual: 1, dur: 180 }, { isi: 3000, dual: 2, dur: 180 }, { isi: 2500, dual: 2, dur: 240 }, { isi: 2500, dual: 3, dur: 240 },
     { isi: 2000, dual: 3, dur: 300 }, { isi: 2000, dual: 4, dur: 300 }, { isi: 1800, dual: 4, dur: 360 }, { isi: 1500, dual: 5, dur: 360 },
     { isi: 1300, dual: 5, dur: 420 }, { isi: 1200, dual: 5, dur: 480 }]),
  P("CA-04", "复合性注意", "快速切换", "stream", "转换性注意训练（任务转换）：按线索在两套规则间切换",
    [{ isi: 3000, switch: 5, cue: 1, dur: 180 }, { isi: 3000, switch: 4, cue: 1, dur: 180 }, { isi: 2500, switch: 3, cue: 1, dur: 240 },
     { isi: 2500, switch: 2, cue: 1, dur: 240 }, { isi: 2200, switch: 1, cue: 1, dur: 300 }, { isi: 2200, switch: 1, cue: 0, dur: 300 },
     { isi: 2000, switch: 1, cue: 2, dur: 360 }, { isi: 2000, switch: 1, cue: 0, dur: 360 }, { isi: 1800, switch: 1, cue: 0, rules: 3, dur: 420 },
     { isi: 1600, switch: 1, cue: 0, rules: 3, dur: 480 }]),
  // —— 执行能力 ——
  P("EX-01", "执行能力", "色词辨析", "stream", "抑制控制训练（Stroop范式）：按字色作答",
    [{ inc: 0, rtl: 4000, dur: 180 }, { inc: .2, rtl: 4000, dur: 180 }, { inc: .4, rtl: 3500, dur: 240 }, { inc: .5, rtl: 3500, dur: 240 },
     { inc: .6, rtl: 3000, dur: 300 }, { inc: .7, rtl: 3000, dur: 300 }, { inc: .7, rtl: 2800, dur: 360, extra: "视觉干扰" },
     { inc: .8, rtl: 2500, dur: 360 }, { inc: .8, rtl: 2500, dur: 420, extra: "声音干扰" }, { inc: .9, rtl: 2200, dur: 480 }]),
  P("EX-02", "执行能力", "智慧连线", "grid", "认知灵活性训练（TMT范式）：顺序/交替连线",
    [{ n: 5, mode: "A", tl: 60 }, { n: 8, mode: "A", tl: 60 }, { n: 10, mode: "A", tl: 55 }, { n: 8, mode: "B", tl: 90 },
     { n: 10, mode: "B", tl: 90 }, { n: 12, mode: "B", tl: 85 }, { n: 15, mode: "AB", tl: 120 }, { n: 18, mode: "B", tl: 80 },
     { n: 20, mode: "B", tl: 75 }, { n: 25, mode: "B", tl: 70 }]),
  P("EX-03", "执行能力", "宝塔规划", "tower", "计划推理训练（伦敦塔范式）：最少步数达成目标布局",
    [{ balls: 3, moves: 2, tl: 90 }, { balls: 3, moves: 3, tl: 90 }, { balls: 3, moves: 4, tl: 120 }, { balls: 4, moves: 4, tl: 120 },
     { balls: 4, moves: 5, tl: 150 }, { balls: 4, moves: 6, tl: 150 }, { balls: 5, moves: 6, tl: 180 }, { balls: 5, moves: 7, tl: 180 },
     { balls: 5, moves: 8, tl: 210 }, { balls: 5, moves: 9, tl: 240 }]),
  P("EX-04", "执行能力", "数字倒数", "seq", "工作记忆刷新训练：正背→倒背→n-back",
    [{ len: 3, mode: "fwd" }, { len: 4, mode: "fwd" }, { len: 3, mode: "bwd" }, { len: 4, mode: "bwd" }, { len: 1, mode: "nback", dur: 180 },
     { len: 5, mode: "bwd" }, { len: 2, mode: "nback", dur: 240 }, { len: 6, mode: "bwd" }, { len: 2, mode: "nback", dur: 240, distr: 1 },
     { len: 3, mode: "nback", dur: 300 }]),
  // —— 学习与记忆 ——
  P("LM-01", "学习与记忆", "数字传真", "seq", "短时记忆广度训练（数字广度）",
    [{ len: 3, mode: "fwd", speed: 1000, chan: "视觉" }, { len: 3, mode: "fwd", speed: 1000, chan: "听觉" }, { len: 4, mode: "fwd", speed: 800 },
     { len: 3, mode: "bwd", speed: 1000 }, { len: 5, mode: "fwd", speed: 800 }, { len: 4, mode: "bwd", speed: 800 },
     { len: 5, mode: "fwd", speed: 800, distr: 1 }, { len: 5, mode: "bwd", speed: 700 }, { len: 5, mode: "bwd", speed: 700, distr: 1 },
     { len: 6, mode: "bwd", speed: 600 }]),
  P("LM-02", "学习与记忆", "词海拾贝", "recall", "词语学习与延迟回忆训练（AVLT范式）",
    [{ len: 6, trials: 2, delay: 0 }, { len: 8, trials: 2, delay: 30 }, { len: 8, trials: 3, delay: 60 }, { len: 10, trials: 2, delay: 60 },
     { len: 10, trials: 3, delay: 120 }, { len: 12, trials: 2, delay: 120 }, { len: 12, trials: 3, delay: 180, recog: 1 },
     { len: 12, trials: 3, delay: 180, recog: 1, inter: 1 }, { len: 12, trials: 2, delay: 300 }, { len: 12, trials: 3, delay: 300, recog: 1, theme: 1 }]),
  P("LM-03", "学习与记忆", "图像配对", "grid", "视觉联想记忆训练：图案-位置配对与再认",
    [{ pairs: 2, memo: 20, delay: 0 }, { pairs: 3, memo: 20, delay: 5 }, { pairs: 4, memo: 18, delay: 10 }, { pairs: 4, memo: 15, delay: 15 },
     { pairs: 5, memo: 15, delay: 15 }, { pairs: 6, memo: 15, delay: 20, sim: 1 }, { pairs: 6, memo: 12, delay: 30 },
     { pairs: 8, memo: 12, delay: 30 }, { pairs: 8, memo: 10, delay: 45, foil: 1 }, { pairs: 10, memo: 10, delay: 60 }]),
  P("LM-04", "学习与记忆", "超市购物", "scene", "前瞻记忆与场景记忆训练：按清单寻物+稍后执行",
    [{ items: 3, zones: 1, pm: 0 }, { items: 4, zones: 1, pm: 0 }, { items: 4, zones: 2, pm: 1 }, { items: 5, zones: 3, pm: 1 },
     { items: 5, zones: 3, pm: 2 }, { items: 6, zones: 4, pm: 2, sim: 1 }, { items: 6, zones: 5, pm: 3 },
     { items: 7, zones: 5, pm: 3 }, { items: 8, zones: 6, pm: 3, tl: 1 }, { items: 10, zones: 6, pm: 4, tl: 1 }]),
  // —— 语言 ——
  P("LA-01", "语言", "看图命名", "mcq", "命名能力训练（BNT范式）：图片命名与分级提示",
    [{ freq: 1, n: 6, hint: 3 }, { freq: 1, n: 8, hint: 2 }, { freq: 1, n: 8, hint: 2, verb: 1 }, { freq: 2, n: 10, hint: 1 },
     { freq: 2, n: 10, hint: 1, tl: 1 }, { freq: 3, n: 12, hint: 0 }, { freq: 4, n: 12, hint: 0 }, { freq: 4, n: 14, hint: 0, cat: 1 },
     { freq: 5, n: 14, hint: 0, tl: 1 }, { freq: 5, n: 16, hint: 0, abs: 1 }]),
  P("LA-02", "语言", "词汇风暴", "recall", "言语流畅性训练：类别/首字限时生成",
    [{ cat: "水果", dur: 60, hint: 1 }, { cat: "动物", dur: 60 }, { cat: "大", dur: 60, hint: 1 }, { cat: "工具", dur: 60 },
     { cat: "大", dur: 60 }, { cat: "双类别", dur: 90 }, { cat: "水", dur: 60 }, { cat: "复合约束", dur: 90 },
     { cat: "动物", dur: 90, dual: 1 }, { cat: "极限组合", dur: 120 }]),
  P("LA-03", "语言", "词图匹配", "mcq", "语义理解训练：词图配对/同义反义/语义归类",
    [{ type: "wg", opts: 2, tl: 10, n: 8 }, { type: "wg", opts: 3, tl: 10, n: 8 }, { type: "syn", opts: 2, tl: 8, n: 10 },
     { type: "ant", opts: 2, tl: 8, n: 10 }, { type: "rel", opts: 3, tl: 8, n: 10 }, { type: "wg", opts: 4, tl: 6, n: 12 },
     { type: "odd", opts: 4, tl: 6, n: 10 }, { type: "syn", opts: 3, tl: 6, n: 12 }, { type: "abs", opts: 3, tl: 6, n: 12 },
     { type: "mix", opts: 4, tl: 5, n: 14 }]),
  P("LA-04", "语言", "听指令行动", "mcq", "听理解与复述训练（TTS播报指令）",
    [{ steps: 1, len: 0, rep: 0 }, { steps: 1, len: 1, rep: 0 }, { steps: 2, len: 6, rep: 1 }, { steps: 2, len: 8, rep: 1 },
     { steps: 3, len: 10, rep: 1 }, { steps: 3, len: 10, rep: 1, neg: 1 }, { steps: 4, len: 15, rep: 1 }, { steps: 4, len: 15, rep: 1, fast: 1 },
     { steps: 5, len: 15, rep: 1 }, { steps: 5, len: 20, rep: 1 }]),
  // —— 视结构-知觉能力 ——
  P("VP-01", "视结构-知觉能力", "火眼金睛", "mcq", "视知觉辨别训练：异同判断/残缺补全/重叠拆分",
    [{ type: "same", n: 8, tl: 10 }, { type: "same", n: 10, tl: 8 }, { type: "missing", opts: 3, tl: 10, n: 8 },
     { type: "overlap", k: 2, tl: 15, n: 6 }, { type: "missing", opts: 4, tl: 10, n: 8 }, { type: "overlap", k: 3, tl: 15, n: 6 },
     { type: "missing", opts: 4, tl: 8, n: 10 }, { type: "overlap", k: 4, tl: 12, n: 6 }, { type: "mix", tl: 8, n: 12 },
     { type: "mix", tl: 6, n: 14 }]),
  P("VP-02", "视结构-知觉能力", "巧手拼搭", "mcq", "视空间构建训练：方块拼图/立方体计数/七巧板",
    [{ type: "block", n: 4, tl: 90 }, { type: "block", n: 6, tl: 90 }, { type: "cube", layer: 1, tl: 60 }, { type: "block", n: 7, tl: 80 },
     { type: "cube", layer: 2, tl: 60 }, { type: "tangram", tl: 120 }, { type: "cube", layer: 3, tl: 60 }, { type: "block", n: 9, tl: 80 },
     { type: "tangram", tl: 100, rot: 1 }, { type: "mix", tl: 90 }]),
  P("VP-03", "视结构-知觉能力", "空间旋转", "mcq", "心理旋转与空间记忆训练：旋转/镜像匹配与路线重现",
    [{ type: "rot", ang: 90, tl: 15, n: 8 }, { type: "rot", ang: 180, tl: 15, n: 8 }, { type: "mirror", ang: 90, tl: 15, n: 8 },
     { type: "rot", ang: 270, tl: 12, n: 8 }, { type: "mixrot", tl: 12, n: 8 }, { type: "route", seg: 3, tl: 30 },
     { type: "rot3d", tl: 15, n: 8 }, { type: "route", seg: 5, tl: 30 }, { type: "rot3d", tl: 12, n: 8 }, { type: "mix", tl: 10, n: 10 }]),
  P("VP-04", "视结构-知觉能力", "妙笔临摹", "canvas", "视觉运动整合训练：触屏临摹（要素判定）",
    [{ shape: "line_circle", tl: 60 }, { shape: "square_triangle", tl: 60 }, { shape: "cube3d", tl: 90 }, { shape: "pentagons", tl: 90 },
     { shape: "clock_face", tl: 120 }, { shape: "clock_full", tl: 120 }, { shape: "house_tree", tl: 150 }, { shape: "mirror", tl: 120 },
     { shape: "timed", tl: 90 }, { shape: "complex", tl: 150 }]),
  // —— 社会认知 ——
  P("SC-01", "社会认知", "察言观色", "mcq", "面部情绪识别训练：表情类别与强度辨析",
    [{ k: 2, strong: 1, tl: 0, n: 8 }, { k: 3, strong: 1, tl: 10, n: 8 }, { k: 4, strong: 1, tl: 10, n: 10 }, { k: 4, strong: 0, tl: 8, n: 10 },
     { k: 5, strong: 1, tl: 8, n: 10 }, { k: 6, strong: 1, tl: 6, n: 12 }, { k: 6, strong: 0, tl: 6, n: 12 },
     { k: 6, mix: 1, tl: 6, n: 12 }, { k: 6, ctx: 1, tl: 5, n: 12 }, { k: 6, strong: 0, tl: 4, n: 14 }]),
  P("SC-02", "社会认知", "心有灵犀", "mcq", "心理理论训练：愿望/信念/意图推断",
    [{ lvl: 1, opts: 2, n: 6 }, { lvl: 1, opts: 2, n: 6 }, { lvl: 2, opts: 2, n: 6 }, { lvl: 2, opts: 3, n: 6 },
     { lvl: 3, opts: 3, n: 6 }, { lvl: 4, opts: 3, n: 6 }, { lvl: 4, opts: 3, n: 6 }, { lvl: 5, opts: 4, n: 8 },
     { lvl: 5, opts: 3, n: 8 }, { lvl: 6, opts: 4, n: 8 }]),
  P("SC-03", "社会认知", "得体应对", "mcq", "社会情境推理训练：社交场景恰当行为选择",
    [{ scene: "礼貌", opts: 2, n: 6 }, { scene: "公共", opts: 3, n: 6 }, { scene: "求助", opts: 3, n: 6 }, { scene: "借还", opts: 3, n: 6 },
     { scene: "待客", opts: 4, n: 6 }, { scene: "冲突", opts: 4, n: 6 }, { scene: "模糊", opts: 4, n: 6 },
     { scene: "多步", opts: 4, n: 6 }, { scene: "职场", opts: 4, n: 6 }, { scene: "混合", opts: 4, n: 8 }]),
  P("SC-04", "社会认知", "言外之意", "mcq", "语用与情感理解训练：客套/隐喻/讽刺判断",
    [{ type: "客套", opts: 2, n: 6 }, { type: "明喻", opts: 2, n: 6 }, { type: "隐喻", opts: 3, n: 6 }, { type: "夸张", opts: 3, n: 6 },
     { type: "讽刺", opts: 3, n: 6, voice: 1 }, { type: "委婉", opts: 3, n: 6 }, { type: "幽默", opts: 3, n: 6 },
     { type: "双关", opts: 4, n: 6 }, { type: "情境讽刺", opts: 4, n: 6 }, { type: "混合", opts: 4, n: 8 }]),
];

/* ==================== RBAC ==================== */
const MENUS = [
  { key: "admin:user", name: "用户管理", end: "admin" },
  { key: "admin:data", name: "数据管理", end: "admin" },
  { key: "admin:config", name: "系统设置", end: "admin" },
  { key: "admin:data:export", name: "数据导出", end: "admin" },
  { key: "doc:patient", name: "患者信息", end: "doctor" },
  { key: "doc:plan", name: "方案管理", end: "doctor" },
  { key: "doc:assess", name: "评估功能", end: "doctor" },
  { key: "doc:train", name: "训练功能", end: "doctor" },
  { key: "doc:record", name: "数据记录", end: "doctor" },
];
const ROLES = [
  { key: "admin", name: "系统管理员", perms: MENUS.map(m => m.key) },
  { key: "doctor", name: "医生", perms: ["doc:patient", "doc:plan", "doc:assess", "doc:train", "doc:record"] },
  { key: "therapist", name: "治疗师", perms: ["doc:patient", "doc:assess", "doc:train", "doc:record"] },
];

/* 训练方案→推荐规则（SRS FR-D-09 / PRD 4.4） */
const RECOMMEND = {
  marked: { plans: 2, start: 3 },   // 明显受损：推荐2方案，起3关
  mild: { plans: 2, start: 2 },     // 轻度受损
  normal: { plans: 1, start: 1 },   // 正常：六域轮换保健
  mocaLow: 18,                      // MoCA<18 起始难度再降1关
  sessionMinutes: 30, maxDomainsPerSession: 3,
};

module.exports = { SCALES, PARADIGMS, TRAININGS, MENUS, ROLES, RECOMMEND, PENDING_CODES };
