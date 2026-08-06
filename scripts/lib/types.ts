/** 管道各阶段的数据结构。fetch → curate → brief → build-data 依次读写 .cache/ 下的中间产物。 */

/** fetch.ts 的输出：原始抓取条目 */
export interface RawItem {
  id: string;
  title: string;
  url: string;
  /** 规范化后的 URL，用于去重 */
  canonicalUrl: string;
  /** RSS 里的摘要 / 或抓取的正文片段 */
  content: string;
  /** 发布时间，ISO 字符串。缺失时用抓取时间 */
  publishedAt: string;
  /** 发布时间是否是推断出来的（RSS 没给） */
  publishedAtInferred: boolean;
  sourceId: string;
  sourceName: string;
  topic: string;
  lang: "zh" | "en";
  paywall: boolean;
  /** 来源权重（已含付费墙扣分） */
  sourceWeight: number;
  /** 有几家报道了同一事件（含自己） */
  coverageCount: number;
  /** 其余报道同一事件的来源 */
  alsoCovered: Array<{ sourceName: string; url: string }>;
}

export interface FetchOutput {
  generatedAt: string;
  date: string;
  items: RawItem[];
  stats: {
    sourcesTotal: number;
    sourcesOk: number;
    sourcesFailed: number;
    itemsRaw: number;
    itemsInWindow: number;
    itemsAfterDedupe: number;
    articlesExtracted: number;
    durationMs: number;
  };
  sourceResults: SourceResult[];
}

export interface SourceResult {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  itemCount: number;
  inWindowCount: number;
  durationMs: number;
  error?: string;
}

/** curate.ts 给每条打的分 */
export interface Scores {
  importance: number;
  novelty: number;
  actionability: number;
  depth: number;
}

/** curate.ts 的输出：评估后的条目 */
export interface CuratedItem extends RawItem {
  titleZh: string;
  summary: string;
  whyItMatters: string;
  tags: string[];
  scores: Scores;
  readMinutes: number;
  type: "快讯" | "深度" | "数据" | "观点" | "论文";
  isNoise: boolean;
  /** 综合分（含各项微调） */
  score: number;
  /** 该批次 AI 调用失败，降级为仅标题 */
  degraded: boolean;
}

export interface CurateOutput {
  generatedAt: string;
  date: string;
  /** 全局降级：没有 API key 或全部调用失败，走纯规则排序 */
  degradedMode: boolean;
  degradedReason?: string;
  items: CuratedItem[];
  usage: UsageStats;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
  failedCalls: number;
  estimatedCostUsd: number;
  byModel: Record<
    string,
    { inputTokens: number; outputTokens: number; calls: number; costUsd: number }
  >;
}

/** brief.ts 的输出：主编导读 */
export interface DailyBrief {
  /** 100–150 字的当日全景判断 */
  overview: string;
  /** 今天只读三条 */
  topPicks: Array<{ itemId: string; reason: string }>;
  /** 今天可以跳过什么 */
  skip: string;
  /** 是否为降级生成（无 AI） */
  degraded: boolean;
}

/** build-data.ts 的最终输出：data/YYYY-MM-DD.json */
export interface DailyData {
  date: string;
  generatedAt: string;
  degradedMode: boolean;
  degradedReason?: string;
  brief: DailyBrief;
  /** 按领域分组，已排序并截断到 maxItems */
  sections: Section[];
  /** Top 3 的 item id（对应 brief.topPicks） */
  topPickIds: string[];
  stats: {
    itemsConsidered: number;
    itemsPublished: number;
    itemsFiltered: number;
    sourcesOk: number;
    sourcesFailed: number;
    totalReadMinutes: number;
    usage: UsageStats;
  };
}

export interface Section {
  topicId: string;
  name: string;
  description: string;
  core: boolean;
  targetMinutes: [number, number] | null;
  accent: { light: string; dark: string };
  items: PublishedItem[];
}

/** 站点渲染用的精简条目（去掉 content 等大字段） */
export interface PublishedItem {
  id: string;
  title: string;
  titleZh: string;
  url: string;
  summary: string;
  whyItMatters: string;
  sourceName: string;
  publishedAt: string;
  topic: string;
  tags: string[];
  type: string;
  readMinutes: number;
  score: number;
  scores: Scores;
  coverageCount: number;
  alsoCovered: Array<{ sourceName: string; url: string }>;
  mustRead: boolean;
  paywall: boolean;
  degraded: boolean;
}

/** data/index.json */
export interface ArchiveIndex {
  updatedAt: string;
  days: Array<{
    date: string;
    itemCount: number;
    topPickTitles: string[];
    degradedMode: boolean;
  }>;
}

/** data/source-health.json */
export interface SourceHealth {
  updatedAt: string;
  sources: Record<
    string,
    {
      name: string;
      /** 最近 7 天，最新的在前。true = 成功 */
      history: Array<{ date: string; ok: boolean; itemCount: number; error?: string }>;
      consecutiveFailures: number;
      successRate7d: number;
    }
  >;
}
