/**
 * 步骤 2：AI 评估
 *
 *   npm run curate
 *
 * 两段式，为了在 $0.3/天 预算内处理一千多条：
 *   预筛（纯规则）→ 分流（Sonnet，只出评分，输出极短）→ 精写（Sonnet，只对入选条目出中文标题/摘要/为什么重要）
 *
 * 降级路径：
 *   - 无 API key 或全部调用失败 → degradedMode，纯规则排序，页面顶部会显示「今日为降级模式」
 *   - 单批失败 → 该批标 degraded=true，用规则分兜底，其余批次不受影响
 */
import "dotenv/config";
import { DAILY_TOTAL_CAP, PREFILTER, SCORE_ADJUSTMENTS, SCORE_WEIGHTS, TOPIC_BY_ID, TOPICS } from "../config/topics.ts";
import type { Topic } from "../config/topics.ts";
import {
  MODEL_CURATE,
  callModel,
  emptyUsage,
  hasApiKey,
  reportCost,
} from "./lib/anthropic.ts";
import type { CurateOutput, CuratedItem, FetchOutput, RawItem, Scores, UsageStats } from "./lib/types.ts";
import { cachePath, estimateReadMinutes, log, readJson, truncate, writeJson } from "./lib/util.ts";

const BATCH_SIZE = 25;

// ─────────────────────── 评分与排序 ───────────────────────

function weightedScore(s: Scores): number {
  return (
    s.importance * SCORE_WEIGHTS.importance +
    s.novelty * SCORE_WEIGHTS.novelty +
    s.actionability * SCORE_WEIGHTS.actionability +
    s.depth * SCORE_WEIGHTS.depth
  );
}

function adjust(base: number, item: RawItem, topic: Topic | undefined): number {
  let s = base;
  if (SCORE_ADJUSTMENTS.useSourceWeight) s += item.sourceWeight;
  if (SCORE_ADJUSTMENTS.useTopicWeight && topic) s += topic.weight;
  if (item.coverageCount >= SCORE_ADJUSTMENTS.coverageBonus.threshold) {
    s += SCORE_ADJUSTMENTS.coverageBonus.bonus;
  }
  return Math.round(Math.max(0, Math.min(10, s)) * 100) / 100;
}

const clamp10 = (n: unknown): number =>
  Math.max(1, Math.min(10, Math.round(typeof n === "number" && Number.isFinite(n) ? n : 5)));

/** 无 AI 时的规则分：来源权重 + 报道家数 + 新鲜度 + 正文长度（长文通常更有料） */
function ruleScore(item: RawItem, topic: Topic | undefined): Scores {
  const ageHours = (Date.now() - Date.parse(item.publishedAt)) / 3600_000;
  const freshness = Math.max(0, 1 - ageHours / 24); // 0~1
  const coverage = Math.min(1, (item.coverageCount - 1) / 4); // 0~1
  const weightNorm = (item.sourceWeight + 0.5) / 1.0; // -0.5~0.5 → 0~1
  const depthHint = Math.min(1, item.content.length / 1500);

  const base = 4 + weightNorm * 2.5 + coverage * 2 + freshness * 1;
  return {
    importance: clamp10(base + coverage * 1.5),
    novelty: clamp10(3 + freshness * 4),
    actionability: clamp10(base - 1),
    depth: clamp10(3 + depthHint * 4 + (topic?.core ? 0.5 : 0)),
  };
}

// ─────────────────────── 预筛 ───────────────────────

/** 纯规则预筛：每个领域按规则分取前 N 条送 AI */
function prefilter(items: RawItem[]): { kept: RawItem[]; dropped: number } {
  const byTopic = new Map<string, RawItem[]>();
  for (const it of items) {
    (byTopic.get(it.topic) ?? byTopic.set(it.topic, []).get(it.topic)!).push(it);
  }

  const kept: RawItem[] = [];
  for (const [topicId, list] of byTopic) {
    const topic = TOPIC_BY_ID[topicId];
    if (!topic) continue;
    const limit = Math.min(topic.maxItems * PREFILTER.multiplier, PREFILTER.capPerTopic);
    const ranked = list
      .map((it) => ({ it, s: adjust(weightedScore(ruleScore(it, topic)), it, topic) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.it);
    kept.push(...ranked);
    if (list.length > ranked.length) {
      log.info(`  ${topic.name}：${list.length} → ${ranked.length} 条进入 AI 评估`);
    }
  }
  return { kept, dropped: items.length - kept.length };
}

// ─────────────────────── 阶段 A：分流 ───────────────────────

const SCORING_RUBRIC = `【评分口径 —— 必须严格遵守】
- importance 重要性 = 影响范围 × 持续时间。影响整个行业/持续半年以上 = 8+；单个公司的日常公告/产品小更新 = 3 以下。
- novelty 新颖度 = 这是新信息还是旧闻复读？已被广泛报道多日的话题降到 3 以下；真正的首次披露 = 8+。
- actionability 可行动性 = 读完能否改变一个具体判断或决策。能 = 高分；只是"知道一下" = 低分。
- depth 深度 = 有一手数据/独家信源/严密论证 = 高；通稿改写、无信源转述 = 低。

【必须打成 is_noise: true 直接过滤掉的】
1. 公关通稿与融资软文（"XX 完成 A 轮"且无实质业务信息）
2. "XX 公司宣布战略合作"类无实质内容的公告
3. 名人八卦、个人恩怨
4. 加密货币喊单、币价涨跌播报、空投撸毛
5. 标题党（"震惊""重磅""突发"但内容空洞）
6. 纯观点没有新信息的评论
7. 同一事件的第 N 次转载
8. 产品评测、优惠促销、榜单排名

宁可少给，不要凑数。一批里大部分是噪音是完全正常的，不要为了让结果好看而抬高分数。`;

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          importance: { type: "integer" },
          novelty: { type: "integer" },
          actionability: { type: "integer" },
          depth: { type: "integer" },
          is_noise: { type: "boolean" },
          type: { type: "string", enum: ["快讯", "深度", "数据", "观点", "论文"] },
          read_minutes: { type: "integer" },
        },
        required: ["id", "importance", "novelty", "actionability", "depth", "is_noise", "type", "read_minutes"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

interface TriageResult {
  items: Array<{
    id: string;
    importance: number;
    novelty: number;
    actionability: number;
    depth: number;
    is_noise: boolean;
    type: string;
    read_minutes: number;
  }>;
}

function triageSystem(topic: Topic): string {
  return `你是一位为高强度信息工作者服务的资深内容主编。读者每天早上只有 30 分钟，你的职责是从几百条资讯里挑出真正值得读的，并且诚实地告诉他哪些不值得。

当前领域：${topic.name}
领域定位：${topic.description}
${topic.guidance}

${SCORING_RUBRIC}

【本次任务】
对每条资讯打四项分（1-10 整数），判断是否为噪音，标注类型与预计阅读分钟数。
- read_minutes：快讯 1-2，普通报道 3-5，深度长文 8-20。
- type：快讯 / 深度 / 数据 / 观点 / 论文，五选一。
- 只做判断，不要写摘要，不要解释理由。
- 必须为输入里的每一条都返回一个结果，id 原样返回，数量必须一致。`;
}

function triagePayload(items: RawItem[]): string {
  return items
    .map((it, i) => {
      const bits = [
        `[${i + 1}] id=${it.id}`,
        `来源：${it.sourceName}${it.coverageCount > 1 ? `（另有 ${it.coverageCount - 1} 家报道同一事件）` : ""}`,
        `标题：${it.title}`,
      ];
      const snippet = truncate(it.content, PREFILTER.triageChars);
      if (snippet) bits.push(`摘要：${snippet}`);
      return bits.join("\n");
    })
    .join("\n\n");
}

// ─────────────────────── 阶段 B：精写 ───────────────────────

const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title_zh: { type: "string" },
          summary: { type: "string" },
          why_it_matters: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title_zh", "summary", "why_it_matters", "tags"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

interface EnrichResult {
  items: Array<{
    id: string;
    title_zh: string;
    summary: string;
    why_it_matters: string;
    tags: string[];
  }>;
}

function enrichSystem(topic: Topic): string {
  const paperRule =
    topic.id === "papers"
      ? `\n【本领域特殊要求】summary 必须用一句话讲清「它证明了什么、为什么重要」。严禁复制粘贴论文摘要，严禁堆砌术语。读者不是这个方向的研究者。`
      : "";
  return `你是一位为高强度信息工作者服务的资深内容主编，正在为「${topic.name}」栏目撰写今日入选条目的中文导读。

对每条资讯输出：
- title_zh：中文标题。英文源需翻译，要像中文媒体的标题，不要直译腔，不要保留英文语序。已经是中文的可以润色但不要改变原意。不超过 40 字。
- summary：2-3 句话说清「发生了什么」和「关键数字是什么」。有数字一定要带上数字。不要写"该文章讨论了…"这种废话开头，直接说事。
- why_it_matters：**一句话**。这件事对趋势/行业/读者的判断意味着什么。这是全站最重要的一行，要有信息量、有观点，不要写"值得关注"" 影响深远"这类空话。
- tags：2-4 个中文短标签，比如「美联储」「推理成本」「先进封装」。不要用宽泛的词如「科技」「商业」。${paperRule}

写作要求：克制、专业、有判断。像一份给聪明人看的晨间简报，不是门户网站的推送。
必须为输入里的每一条都返回结果，id 原样返回，数量必须一致。`;
}

function enrichPayload(items: RawItem[]): string {
  return items
    .map((it, i) => {
      const bits = [
        `[${i + 1}] id=${it.id}`,
        `来源：${it.sourceName}${it.paywall ? "（正文有付费墙，只能基于以下内容判断）" : ""}`,
        `${it.coverageCount > 1 ? `报道家数：${it.coverageCount}\n` : ""}原标题：${it.title}`,
      ];
      const snippet = truncate(it.content, PREFILTER.enrichChars);
      if (snippet) bits.push(`正文/摘要：${snippet}`);
      return bits.join("\n");
    })
    .join("\n\n");
}

// ─────────────────────── 主流程 ───────────────────────

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function toCurated(
  item: RawItem,
  scores: Scores,
  extra: Partial<CuratedItem>,
  degraded: boolean,
): CuratedItem {
  const topic = TOPIC_BY_ID[item.topic];
  return {
    ...item,
    titleZh: extra.titleZh || item.title,
    summary: extra.summary || truncate(item.content, 180),
    whyItMatters: extra.whyItMatters || "",
    tags: extra.tags ?? [],
    scores,
    readMinutes: extra.readMinutes ?? estimateReadMinutes(item.content || item.title),
    type: extra.type ?? "快讯",
    isNoise: extra.isNoise ?? false,
    score: adjust(weightedScore(scores), item, topic),
    degraded,
  };
}

async function main() {
  const fetched = await readJson<FetchOutput>(cachePath("fetch.json"));
  if (!fetched) {
    log.error("找不到 .cache/fetch.json，请先运行 npm run fetch");
    process.exit(1);
  }

  const usage = emptyUsage();
  let degradedMode = false;
  let degradedReason: string | undefined;

  log.step(`AI 评估 ${fetched.date} · 抓到 ${fetched.items.length} 条`);

  // ── 预筛 ──
  const { kept, dropped } = prefilter(fetched.items);
  log.ok(`规则预筛：${fetched.items.length} → ${kept.length} 条（滤掉 ${dropped} 条低权重条目）`);

  if (!hasApiKey()) {
    degradedMode = true;
    degradedReason = process.env.DEGRADED === "1"
      ? "手动指定 DEGRADED=1，跳过 AI 环节"
      : "未配置 ANTHROPIC_API_KEY，跳过 AI 环节";
    log.warn(`降级模式：${degradedReason}`);
  }

  const byTopic = new Map<string, RawItem[]>();
  for (const it of kept) {
    (byTopic.get(it.topic) ?? byTopic.set(it.topic, []).get(it.topic)!).push(it);
  }

  const curated: CuratedItem[] = [];

  // ── 阶段 A：分流 ──
  if (!degradedMode) {
    let batchIndex = 0;
    const totalBatches = [...byTopic.values()].reduce(
      (n, l) => n + Math.ceil(l.length / BATCH_SIZE),
      0,
    );

    for (const [topicId, list] of byTopic) {
      const topic = TOPIC_BY_ID[topicId];
      if (!topic) continue;
      const system = triageSystem(topic);

      for (const batch of chunk(list, BATCH_SIZE)) {
        batchIndex++;
        const label = `分流 ${batchIndex}/${totalBatches}（${topic.name}，${batch.length} 条）`;
        const res = await callModel<TriageResult>(
          {
            model: MODEL_CURATE,
            system,
            userContent: triagePayload(batch),
            schema: TRIAGE_SCHEMA,
            maxTokens: 8000,
            effort: "low",
            disableThinking: true,
            cacheSystem: true,
            label,
          },
          usage,
        );

        const byId = new Map(res?.items.map((r) => [r.id, r]) ?? []);
        for (const item of batch) {
          const r = byId.get(item.id);
          if (!r) {
            // 该批失败或模型漏了这条 → 规则分兜底
            curated.push(toCurated(item, ruleScore(item, topic), {}, true));
            continue;
          }
          curated.push(
            toCurated(
              item,
              {
                importance: clamp10(r.importance),
                novelty: clamp10(r.novelty),
                actionability: clamp10(r.actionability),
                depth: clamp10(r.depth),
              },
              {
                isNoise: !!r.is_noise,
                type: (r.type as CuratedItem["type"]) ?? "快讯",
                readMinutes: Math.max(1, Math.min(40, Math.round(r.read_minutes || 3))),
              },
              false,
            ),
          );
        }
        if (res) log.ok(`${label} 完成`);
      }
    }

    // 全部调用都失败 → 整体降级
    if (usage.calls === 0) {
      degradedMode = true;
      degradedReason = "所有 AI 调用均失败，已回退到纯规则排序";
      log.error(degradedReason);
    }
  } else {
    for (const item of kept) {
      curated.push(toCurated(item, ruleScore(item, TOPIC_BY_ID[item.topic]), {}, true));
    }
  }

  const noiseCount = curated.filter((c) => c.isNoise).length;
  log.info(`分流结果：${curated.length} 条已评分，其中 ${noiseCount} 条判为噪音`);

  // ── 挑出真正要发布的条目 ──
  const survivors = curated.filter((c) => !c.isNoise);
  const selected: CuratedItem[] = [];
  for (const topic of TOPICS) {
    const pool = survivors
      .filter((c) => c.topic === topic.id && c.score >= topic.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topic.maxItems);
    selected.push(...pool);
  }
  selected.sort((a, b) => b.score - a.score);
  const finalSelection = selected.slice(0, DAILY_TOTAL_CAP);
  log.ok(`入选 ${finalSelection.length} 条（各领域按门槛与条数上限筛选后）`);

  // ── 阶段 B：只对入选条目精写 ──
  if (!degradedMode && finalSelection.length) {
    const selByTopic = new Map<string, CuratedItem[]>();
    for (const it of finalSelection) {
      (selByTopic.get(it.topic) ?? selByTopic.set(it.topic, []).get(it.topic)!).push(it);
    }

    let i = 0;
    const total = [...selByTopic.values()].reduce((n, l) => n + Math.ceil(l.length / 12), 0);
    for (const [topicId, list] of selByTopic) {
      const topic = TOPIC_BY_ID[topicId];
      if (!topic) continue;
      const system = enrichSystem(topic);

      for (const batch of chunk(list, 12)) {
        i++;
        const label = `精写 ${i}/${total}（${topic.name}，${batch.length} 条）`;
        const res = await callModel<EnrichResult>(
          {
            model: MODEL_CURATE,
            system,
            userContent: enrichPayload(batch),
            schema: ENRICH_SCHEMA,
            maxTokens: 8000,
            effort: "medium",
            disableThinking: true,
            cacheSystem: true,
            label,
          },
          usage,
        );

        if (!res) {
          for (const it of batch) it.degraded = true;
          continue;
        }
        const byId = new Map(res.items.map((r) => [r.id, r]));
        for (const it of batch) {
          const r = byId.get(it.id);
          if (!r) {
            it.degraded = true;
            continue;
          }
          it.titleZh = r.title_zh?.trim() || it.title;
          it.summary = r.summary?.trim() || it.summary;
          it.whyItMatters = r.why_it_matters?.trim() || "";
          it.tags = (r.tags ?? []).filter(Boolean).slice(0, 4);
        }
        log.ok(`${label} 完成`);
      }
    }
  }

  const output: CurateOutput = {
    generatedAt: new Date().toISOString(),
    date: fetched.date,
    degradedMode,
    ...(degradedReason ? { degradedReason } : {}),
    // 只把入选条目往下传，历史归档不需要留几百条噪音
    items: finalSelection,
    usage,
  };
  await writeJson(cachePath("curate.json"), output);

  log.step("成本");
  for (const line of reportCost(usage)) log.info(line);
  log.ok("已写入 .cache/curate.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("评估阶段异常：", err);
    process.exit(1);
  });
