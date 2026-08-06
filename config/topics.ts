/**
 * 领域（栏目）配置 —— 增删领域只改这个文件。
 *
 * 改完记得：如果新增了领域 id，去 config/sources.ts 里给它挂上源。
 * 首页分区顺序 = 这个数组的顺序（core 在前、extended 在后由 order 字段控制）。
 */

export interface Topic {
  /** 唯一 id，同时是 URL hash / 前端筛选值。只用小写字母和连字符。 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 首页小标题下的一句话定位 */
  description: string;
  /** true = 核心栏目（每天必出，即使只有 1 条也显示）；false = 扩展栏目（无优质内容当天隐藏） */
  core: boolean;
  /** 每日最多推荐几条 */
  maxItems: number;
  /** 该领域每天的目标阅读时长（分钟），显示为徽章。null = 不限时 */
  targetMinutes: [number, number] | null;
  /** 领域权重，影响综合分微调（-1 ~ +1）。想让某个领域更容易上首页就调高。 */
  weight: number;
  /** 入选综合分门槛。低于此分不显示。核心栏目通常放低一点保证有内容。 */
  minScore: number;
  /** 扩展栏目专用：当天至少凑够几条才显示该分区，否则整个分区隐藏 */
  minItemsToShow: number;
  /** 首页排序序号 */
  order: number;
  /** 卡片强调色（Tailwind 兼容的 CSS 颜色，浅色/深色两套） */
  accent: { light: string; dark: string };
  /** 给 AI 的额外指令：这个领域什么该选、什么该扔 */
  guidance: string;
}

export const TOPICS: Topic[] = [
  // ───────────────────────── 核心栏目 ─────────────────────────
  {
    id: "macro",
    name: "宏观经济与资本市场",
    description: "建立大局观：央行政策与利率路径、通胀与就业、大宗商品、汇率、股债与供应链。",
    core: true,
    maxItems: 6,
    targetMinutes: [5, 8],
    weight: 0.2,
    minScore: 5.0,
    minItemsToShow: 1,
    order: 1,
    accent: { light: "#1d4ed8", dark: "#7ea6ff" },
    guidance:
      "优先：央行决议与官员表态、通胀/就业/PMI 等硬数据、利率与汇率的结构性变动、大宗商品供需、主权债与信用事件。" +
      "剔除：单日股指涨跌复盘、个股行情解读、'分析师看好XX'、无数据支撑的市场情绪文。",
  },
  {
    id: "ai",
    name: "前沿科技与 AI 产业",
    description: "理解生产力变革方向：模型能力边界、推理成本、算力与芯片、开发者生态、企业落地与监管。",
    core: true,
    maxItems: 8,
    targetMinutes: [10, 15],
    weight: 0.3,
    minScore: 5.0,
    minItemsToShow: 1,
    order: 2,
    accent: { light: "#7c3aed", dark: "#c4a6ff" },
    guidance:
      "优先：新模型的真实能力边界与基准、推理/训练成本曲线变化、算力与芯片供给、真实企业落地数据、重要监管落地。" +
      "剔除：'XX 接入大模型'类通稿、无参数无评测的模型发布、AI 会不会取代人类的空泛讨论、纯营销的功能更新。",
  },
  {
    id: "business",
    name: "商业模式与行业深度",
    description: "提升商业敏锐度：财报拆解、单位经济模型、并购融资、战略选择、中国企业出海。",
    core: true,
    maxItems: 5,
    targetMinutes: [8, 12],
    weight: 0.15,
    minScore: 5.2,
    minItemsToShow: 1,
    order: 3,
    accent: { light: "#b45309", dark: "#f0b45e" },
    guidance:
      "优先：带数字的财报拆解、单位经济模型分析、有战略意图的并购、商业模式的结构性转变。" +
      "剔除：融资软文（'XX 完成 A 轮'且无业务信息）、战略合作通稿、创始人鸡汤、榜单排名稿。",
  },
  {
    id: "longform",
    name: "深度长文与思考",
    description: "抵抗碎片化。选文标准是半年后仍然成立，而不是今天的热点。适合周末或通勤精读。",
    core: true,
    maxItems: 3,
    targetMinutes: null,
    weight: 0.1,
    minScore: 5.5,
    minItemsToShow: 1,
    order: 4,
    accent: { light: "#0f766e", dark: "#5eead4" },
    guidance:
      "唯一标准：这篇文章半年后读是否仍然成立。优先有原创框架、一手经验、严密论证的长文。" +
      "剔除：追热点的时评、新闻复述、清单体（'10 个技巧'）、AI 味浓的凑字数文章。",
  },

  // ───────────────────────── 扩展栏目 ─────────────────────────
  {
    id: "semi",
    name: "半导体与硬件供应链",
    description: "制程节点、先进封装、HBM 与存储周期、EDA、设备出口管制、代工产能。",
    core: false,
    maxItems: 4,
    targetMinutes: [4, 6],
    weight: 0.15,
    minScore: 5.8,
    minItemsToShow: 2,
    order: 5,
    accent: { light: "#0369a1", dark: "#7dd3fc" },
    guidance:
      "优先：产能与良率的真实数字、封装与存储周期拐点、设备与材料的管制变化、代工厂客户结构变动。" +
      "剔除：消费电子新品评测、显卡跑分、无信源的'据传'类爆料。",
  },
  {
    id: "geopolitics",
    name: "地缘政治与政策监管",
    description: "只收直接影响资产价格与产业的政策：出口管制、关税、数据与 AI 立法、反垄断、能源制裁。",
    core: false,
    maxItems: 4,
    targetMinutes: [4, 6],
    weight: 0.1,
    minScore: 6.0,
    minItemsToShow: 2,
    order: 6,
    accent: { light: "#9f1239", dark: "#fda4af" },
    guidance:
      "优先：已落地或即将落地的具体条文、管制清单变动、关税税率变化、反垄断裁决。" +
      "剔除：选举花边、领导人互相喊话、纯军事冲突播报、意识形态争论、无政策落点的国际关系评论。",
  },
  {
    id: "energy",
    name: "能源与气候科技",
    description: "电力需求（尤其数据中心用电）、电网、储能、光伏与核能、油气、碳市场。",
    core: false,
    maxItems: 3,
    targetMinutes: [3, 5],
    weight: 0.05,
    minScore: 5.8,
    minItemsToShow: 2,
    order: 7,
    accent: { light: "#15803d", dark: "#86efac" },
    guidance:
      "优先：数据中心用电与电网约束、储能与核能的成本曲线、装机与发电量数据、能源政策落地。" +
      "剔除：气候道德倡议、无技术细节的'绿色转型'宣言、企业 ESG 报告稿。",
  },
  {
    id: "bio",
    name: "生物医药与健康科技",
    description: "临床读出、FDA/NMPA 审批、GLP-1 与减重赛道、AI 制药、脑机接口、医疗支付改革。",
    core: false,
    maxItems: 3,
    targetMinutes: [3, 5],
    weight: 0.05,
    minScore: 5.8,
    minItemsToShow: 2,
    order: 8,
    accent: { light: "#be185d", dark: "#f9a8d4" },
    guidance:
      "优先：III 期临床读出与具体终点数据、审批结果、影响支付方的定价与报销变化、有验证的 AI 制药成果。" +
      "剔除：动物实验早期结果的夸大报道、'有望治愈'类标题、保健养生内容。",
  },
  {
    id: "dev",
    name: "开源与开发者生态",
    description: "重要开源项目发布、语言与框架演进、基础设施、开发范式变化、值得 star 的新项目。",
    core: false,
    maxItems: 4,
    targetMinutes: [4, 6],
    weight: 0.05,
    minScore: 5.5,
    minItemsToShow: 2,
    order: 9,
    accent: { light: "#4d7c0f", dark: "#bef264" },
    guidance:
      "优先：改变开发方式的工具与范式、重要项目的 major 版本、许可证与治理变动、基础设施性能突破。" +
      "剔除：入门教程、'我用 AI 写了个玩具'、周边八卦、版本号 patch 级更新。",
  },
  {
    id: "papers",
    name: "学术前沿速递",
    description: "arXiv 高影响力新论文与 Nature/Science 重大成果。每条一句话讲清它证明了什么。",
    core: false,
    maxItems: 4,
    targetMinutes: [5, 8],
    weight: 0.0,
    minScore: 6.2,
    minItemsToShow: 2,
    order: 10,
    accent: { light: "#6d28d9", dark: "#d8b4fe" },
    guidance:
      "【特殊要求】summary 必须是一句话讲清『它证明了什么、为什么重要』，严禁复制粘贴摘要，严禁堆砌术语。" +
      "优先：方法上有真实新意、有可复现结果、挑战了既有共识的论文。" +
      "剔除：增量式调参、只在小数据集上刷点、纯综述、无代码无数据的宣称。",
  },
  {
    id: "consumer",
    name: "消费、出海与品牌",
    description: "消费趋势迁移、跨境电商与独立站、SHEIN/TikTok/Temu 生态、新兴市场机会。",
    core: false,
    maxItems: 3,
    targetMinutes: [3, 5],
    weight: 0.0,
    minScore: 5.8,
    minItemsToShow: 2,
    order: 11,
    accent: { light: "#c2410c", dark: "#fdba74" },
    guidance:
      "优先：带数据的消费行为迁移、渠道与流量结构变化、新兴市场的真实生意机会、监管对跨境的影响。" +
      "剔除：品牌营销案例吹捧、网红带货八卦、无数据的趋势预测。",
  },
  {
    id: "crypto",
    name: "加密与金融科技",
    description: "稳定币与支付基础设施、RWA、ETF 与机构资金流、监管框架、链上数据异动。",
    core: false,
    maxItems: 3,
    targetMinutes: [3, 4],
    weight: -0.1,
    minScore: 6.2,
    minItemsToShow: 2,
    order: 12,
    accent: { light: "#a16207", dark: "#fde047" },
    guidance:
      "【严格】只收结构性新闻：监管框架落地、稳定币与支付基础设施、机构资金流与 ETF 结构、真实的链上异动分析。" +
      "无条件剔除（is_noise=true）：任何币价涨跌播报、'突破 XX 美元'、喊单与预测、空投与撸毛、名人发币、meme 币。",
  },
];

/** 便捷索引 */
export const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t]),
);

export const CORE_TOPICS = TOPICS.filter((t) => t.core).sort((a, b) => a.order - b.order);
export const EXTENDED_TOPICS = TOPICS.filter((t) => !t.core).sort((a, b) => a.order - b.order);
export const SORTED_TOPICS = [...TOPICS].sort((a, b) => a.order - b.order);
export const TOPIC_IDS = TOPICS.map((t) => t.id);

/**
 * 综合评分权重 —— 想调整口味就改这里。
 * score = importance*W.importance + novelty*W.novelty + actionability*W.actionability + depth*W.depth
 * 四项之和应为 1。
 */
export const SCORE_WEIGHTS = {
  importance: 0.4,
  novelty: 0.25,
  actionability: 0.2,
  depth: 0.15,
} as const;

/** 评分后的微调规则 */
export const SCORE_ADJUSTMENTS = {
  /** 来源权重直接加到综合分上（sources.ts 里每个源的 weight，范围 -0.5 ~ +0.5） */
  useSourceWeight: true,
  /** 领域权重也加到综合分上（topics.ts 里的 weight） */
  useTopicWeight: true,
  /** 同一事件被 N 家报道时的加分 */
  coverageBonus: { threshold: 3, bonus: 0.3 },
  /** 综合分 ≥ 此值的条目标记为「必读」 */
  mustReadThreshold: 8.0,
} as const;

/** 全站每日总条数上限（防止某天源特别多时页面过长） */
export const DAILY_TOTAL_CAP = 42;

/**
 * 送给 AI 之前的规则预筛 —— 成本控制的主要杠杆。
 *
 * 抓取一天通常有 1000+ 条（arXiv 一个源就三百多），全量送模型评估
 * 每天要花掉 $1 以上。这里先用纯规则（来源权重 + 报道家数 + 新鲜度）
 * 把每个领域压到 maxItems 的若干倍，再交给 AI 精评。
 *
 * 调大 = 更不容易漏掉好内容，但更贵；调小 = 更省，但更依赖来源权重的准确性。
 */
export const PREFILTER = {
  /** 每个领域保留 maxItems × 此倍数 条进入 AI 评估 */
  multiplier: 5,
  /** 单领域进入 AI 评估的绝对上限 */
  capPerTopic: 40,
  /** 送去分流时，正文截断到多少字符（分流只需判断值不值得读） */
  triageChars: 240,
  /** 送去精写时，正文截断到多少字符 */
  enrichChars: 1200,
} as const;

/** 当天入选条目少于此数则认为管道异常，workflow 应当 fail 且不发布 */
export const MIN_ITEMS_TO_PUBLISH = 5;
