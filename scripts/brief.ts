/**
 * 步骤 3：主编导读
 *
 *   npm run brief
 *
 * 每天一次 claude-opus-5 调用，产出首页顶部的「今日导读」：
 * 全景判断 + 今天只读三条 + 今天可以跳过什么。
 *
 * 降级：无 key / 调用失败时，用规则拼一段诚实的导读（不假装有观点）。
 */
import "dotenv/config";
import { TOPIC_BY_ID } from "../config/topics.ts";
import { MODEL_BRIEF, callModel, emptyUsage, hasApiKey, mergeUsage, reportCost } from "./lib/anthropic.ts";
import type { CurateOutput, CuratedItem, DailyBrief } from "./lib/types.ts";
import { cachePath, log, readJson, writeJson } from "./lib/util.ts";

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    top_picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "reason"],
        additionalProperties: false,
      },
    },
    skip: { type: "string" },
  },
  required: ["overview", "top_picks", "skip"],
  additionalProperties: false,
};

interface BriefResult {
  overview: string;
  top_picks: Array<{ id: string; reason: string }>;
  skip: string;
}

const SYSTEM = `你是一份高质量晨间简报的主编。读者是一位时间极度稀缺的信息工作者：每天早上只有 30 分钟，需要你替他判断今天的信息里什么真正重要。

请基于今天全部入选条目，产出三样东西：

1. **overview（100-150 字）**：当日全景判断。要有观点——今天最重要的信号是什么？几件看似不相关的事之间有没有关联？不要罗列条目，不要写"今天有以下几个方面的新闻"。像一个有判断力的人在跟朋友说"今天你只要知道这些"。

2. **top_picks（恰好 3 条）**：从条目里挑出"今天只读这三条"。每条给一句推荐理由（不超过 40 字），说明为什么是它。id 必须原样使用输入里给出的 id。三条应尽量来自不同领域，除非某个领域今天确实压倒性重要。

3. **skip（一句话）**：今天可以跳过什么。例如"AI 圈今天全是发布会通稿，扫一眼标题就够"。如果没什么明显可跳过的，就说明今天信噪比还行。

【最重要的一条纪律】
如果今天确实没什么大事，就诚实地说出来——比如"今天信息量不大，10 分钟读完 Top 3 即可"。**绝不要为了凑内容而拔高事件的重要性。** 读者信任你的前提，是你愿意说"今天没什么值得读的"。

语气：克制、专业、有判断力。不用感叹号，不用"重磅""震撼"这类词。`;

function buildPayload(items: CuratedItem[]): string {
  const lines = items.map((it) => {
    const topic = TOPIC_BY_ID[it.topic]?.name ?? it.topic;
    const why = it.whyItMatters ? `\n  为什么重要：${it.whyItMatters}` : "";
    const cov = it.coverageCount > 1 ? `，${it.coverageCount} 家报道` : "";
    return `id=${it.id} [${topic}｜综合分 ${it.score.toFixed(1)}${cov}]\n  ${it.titleZh}${why}`;
  });
  return `今日入选条目共 ${items.length} 条：\n\n${lines.join("\n\n")}`;
}

/** 降级导读：不假装有洞察，只如实说明情况 */
function fallbackBrief(items: CuratedItem[], reason: string): DailyBrief {
  const top = items.slice(0, 3);
  const topics = [...new Set(items.map((i) => TOPIC_BY_ID[i.topic]?.name).filter(Boolean))];
  const minutes = items.reduce((n, i) => n + i.readMinutes, 0);

  const overview =
    items.length === 0
      ? "今天没有抓取到足够的内容，可能是数据源出了问题。"
      : `今日为降级模式（${reason}），以下排序基于来源权重与报道家数，未经 AI 评估，请自行判断。` +
        `共收录 ${items.length} 条，覆盖 ${topics.slice(0, 4).join("、")}${topics.length > 4 ? "等" : ""} ${topics.length} 个领域，` +
        `全部读完约需 ${minutes} 分钟。建议先看下面 Top 3。`;

  return {
    overview,
    topPicks: top.map((it) => ({
      itemId: it.id,
      reason: `${it.sourceName}${it.coverageCount > 1 ? ` 等 ${it.coverageCount} 家报道` : ""}，综合排序最高`,
    })),
    skip: "降级模式下无法判断哪些可跳过，建议按领域快速扫标题。",
    degraded: true,
  };
}

async function main() {
  const curated = await readJson<CurateOutput>(cachePath("curate.json"));
  if (!curated) {
    log.error("找不到 .cache/curate.json，请先运行 npm run curate");
    process.exit(1);
  }

  const items = curated.items;
  log.step(`生成今日导读 · ${items.length} 条入选`);

  const usage = emptyUsage();
  let brief: DailyBrief;

  if (curated.degradedMode || !hasApiKey() || items.length === 0) {
    const reason = curated.degradedReason ?? "未配置 API key";
    brief = fallbackBrief(items, reason);
    log.warn(`降级导读：${reason}`);
  } else {
    const res = await callModel<BriefResult>(
      {
        model: MODEL_BRIEF,
        system: SYSTEM,
        userContent: buildPayload(items),
        schema: BRIEF_SCHEMA,
        maxTokens: 4000,
        effort: "medium",
        label: "今日导读（opus）",
      },
      usage,
    );

    if (!res) {
      brief = fallbackBrief(items, "主编导读调用失败");
      log.warn("导读调用失败，已降级");
    } else {
      const validIds = new Set(items.map((i) => i.id));
      const picks = (res.top_picks ?? [])
        .filter((p) => validIds.has(p.id))
        .slice(0, 3)
        .map((p) => ({ itemId: p.id, reason: p.reason?.trim() ?? "" }));

      // 模型给的 id 对不上就用分数最高的补齐，保证首页 Top 3 一定有内容
      for (const it of items) {
        if (picks.length >= Math.min(3, items.length)) break;
        if (!picks.some((p) => p.itemId === it.id)) {
          picks.push({ itemId: it.id, reason: "今日综合分最高的条目之一" });
        }
      }

      brief = {
        overview: res.overview?.trim() ?? "",
        topPicks: picks,
        skip: res.skip?.trim() ?? "",
        degraded: false,
      };
      log.ok(`导读已生成（${brief.overview.length} 字，Top ${brief.topPicks.length}）`);
      log.info(`  ${brief.overview}`);
    }
  }

  await writeJson(cachePath("brief.json"), {
    date: curated.date,
    generatedAt: new Date().toISOString(),
    brief,
    usage: mergeUsage(curated.usage, usage),
  });

  if (usage.calls) {
    for (const line of reportCost(usage)) log.info(line);
  }
  log.ok("已写入 .cache/brief.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("导读阶段异常：", err);
    process.exit(1);
  });
