/**
 * 步骤 4：输出
 *
 *   npm run build-data
 *
 * 写 data/YYYY-MM-DD.json、更新 data/index.json、生成 public/feed.xml。
 *
 * 零结果保护：入选条目 < MIN_ITEMS_TO_PUBLISH 时不写入任何文件并以非 0 退出，
 * workflow 会标红，但站点仍然停留在昨天的版本——绝不发布一个空站。
 */
import "dotenv/config";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { MIN_ITEMS_TO_PUBLISH, SCORE_ADJUSTMENTS, SORTED_TOPICS, TOPIC_BY_ID } from "../config/topics.ts";
import type { ArchiveIndex, CurateOutput, CuratedItem, DailyBrief, DailyData, PublishedItem, Section, UsageStats } from "./lib/types.ts";
import {
  DATA_DIR,
  PUBLIC_DIR,
  appendJobSummary,
  beijingTimeLabel,
  cachePath,
  escapeXml,
  log,
  readJson,
  writeJson,
} from "./lib/util.ts";

const SITE = "https://quokkoo.github.io/news";

function toPublished(it: CuratedItem, topPickIds: Set<string>): PublishedItem {
  return {
    id: it.id,
    title: it.title,
    titleZh: it.titleZh,
    url: it.url,
    summary: it.summary,
    whyItMatters: it.whyItMatters,
    sourceName: it.sourceName,
    publishedAt: it.publishedAt,
    topic: it.topic,
    tags: it.tags,
    type: it.type,
    readMinutes: it.readMinutes,
    score: it.score,
    scores: it.scores,
    coverageCount: it.coverageCount,
    alsoCovered: it.alsoCovered.slice(0, 5),
    mustRead: it.score >= SCORE_ADJUSTMENTS.mustReadThreshold || topPickIds.has(it.id),
    paywall: it.paywall,
    degraded: it.degraded,
  };
}

function buildSections(items: CuratedItem[], topPickIds: Set<string>): Section[] {
  const sections: Section[] = [];
  for (const topic of SORTED_TOPICS) {
    const list = items
      .filter((i) => i.topic === topic.id)
      .sort((a, b) => b.score - a.score);

    // 核心栏目只要有内容就显示；扩展栏目条数不够当天整个隐藏
    if (!list.length) continue;
    if (!topic.core && list.length < topic.minItemsToShow) {
      log.info(`  隐藏扩展栏目「${topic.name}」：只有 ${list.length} 条，低于 ${topic.minItemsToShow} 条门槛`);
      continue;
    }

    sections.push({
      topicId: topic.id,
      name: topic.name,
      description: topic.description,
      core: topic.core,
      targetMinutes: topic.targetMinutes,
      accent: topic.accent,
      items: list.map((i) => toPublished(i, topPickIds)),
    });
  }
  return sections;
}

async function buildFeed(data: DailyData): Promise<void> {
  const items = data.sections.flatMap((s) => s.items);
  const now = new Date(data.generatedAt).toUTCString();

  const entries = items
    .map((it) => {
      const topicName = TOPIC_BY_ID[it.topic]?.name ?? it.topic;
      const desc = [
        it.summary,
        it.whyItMatters ? `\n\n为什么重要：${it.whyItMatters}` : "",
        `\n\n来源：${it.sourceName} · ${topicName} · 约 ${it.readMinutes} 分钟`,
      ].join("");
      return `    <item>
      <title>${escapeXml(it.titleZh)}</title>
      <link>${escapeXml(it.url)}</link>
      <guid isPermaLink="false">${escapeXml(it.id)}</guid>
      <pubDate>${new Date(it.publishedAt).toUTCString()}</pubDate>
      <category>${escapeXml(topicName)}</category>
      <description>${escapeXml(desc)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>每日新闻精读</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>每天早上 7 点前更新：从几百条资讯里挑出真正值得读的，并告诉你为什么值得读、该花多久读。</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <item>
      <title>【${data.date} 今日导读】</title>
      <link>${SITE}/</link>
      <guid isPermaLink="false">brief-${data.date}</guid>
      <pubDate>${now}</pubDate>
      <description>${escapeXml(data.brief.overview)}</description>
    </item>
${entries}
  </channel>
</rss>
`;
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(join(PUBLIC_DIR, "feed.xml"), xml, "utf8");
}

async function rebuildIndex(): Promise<number> {
  const files = (await readdir(DATA_DIR).catch(() => []))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();

  const days: ArchiveIndex["days"] = [];
  for (const f of files) {
    const d = await readJson<DailyData>(join(DATA_DIR, f));
    if (!d) continue;
    const all = d.sections.flatMap((s) => s.items);
    const topIds = new Set(d.topPickIds ?? []);
    days.push({
      date: d.date,
      itemCount: all.length,
      topPickTitles: all.filter((i) => topIds.has(i.id)).map((i) => i.titleZh).slice(0, 3),
      degradedMode: d.degradedMode,
    });
  }

  await writeJson(join(DATA_DIR, "index.json"), {
    updatedAt: new Date().toISOString(),
    days,
  } satisfies ArchiveIndex);
  return days.length;
}

async function main() {
  const curated = await readJson<CurateOutput>(cachePath("curate.json"));
  const briefCache = await readJson<{ brief: DailyBrief; usage: UsageStats }>(cachePath("brief.json"));
  if (!curated || !briefCache) {
    log.error("缺少 .cache/curate.json 或 .cache/brief.json，请先运行 npm run curate && npm run brief");
    process.exit(1);
  }

  const items = curated.items;
  log.step(`生成 ${curated.date} 的数据文件`);

  // ── 零结果保护 ──
  if (items.length < MIN_ITEMS_TO_PUBLISH) {
    const msg =
      `入选条目仅 ${items.length} 条，低于 ${MIN_ITEMS_TO_PUBLISH} 条最低门槛。` +
      `通常意味着抓取环节出了问题。本次不写入任何数据文件，站点保持昨天的版本。`;
    log.error(msg);
    await appendJobSummary(`## ❌ 今日未发布\n\n${msg}\n`);
    process.exit(1);
  }

  const topPickIds = new Set(briefCache.brief.topPicks.map((p) => p.itemId));
  const sections = buildSections(items, topPickIds);
  const published = sections.flatMap((s) => s.items);

  const data: DailyData = {
    date: curated.date,
    generatedAt: new Date().toISOString(),
    degradedMode: curated.degradedMode,
    ...(curated.degradedReason ? { degradedReason: curated.degradedReason } : {}),
    brief: briefCache.brief,
    sections,
    topPickIds: [...topPickIds].filter((id) => published.some((p) => p.id === id)),
    stats: {
      itemsConsidered: items.length,
      itemsPublished: published.length,
      itemsFiltered: items.length - published.length,
      sourcesOk: 0,
      sourcesFailed: 0,
      totalReadMinutes: published.reduce((n, i) => n + i.readMinutes, 0),
      usage: briefCache.usage,
    },
  };

  // 把抓取阶段的源统计补进来（fetch.json 可能已被清理，缺了也不影响出站）
  const fetched = await readJson<{ stats: { sourcesOk: number; sourcesFailed: number } }>(
    cachePath("fetch.json"),
  );
  if (fetched) {
    data.stats.sourcesOk = fetched.stats.sourcesOk;
    data.stats.sourcesFailed = fetched.stats.sourcesFailed;
  }

  await writeJson(join(DATA_DIR, `${curated.date}.json`), data);
  const dayCount = await rebuildIndex();
  await buildFeed(data);

  log.ok(`data/${curated.date}.json：${published.length} 条，${sections.length} 个分区`);
  log.ok(`data/index.json：共 ${dayCount} 天归档`);
  log.ok("public/feed.xml 已生成");

  // ── GitHub Actions 摘要 ──
  const usage = briefCache.usage;
  const health = await readJson<import("./lib/types.ts").SourceHealth>(join(DATA_DIR, "source-health.json"));
  const sick = Object.entries(health?.sources ?? {})
    .filter(([, v]) => v.consecutiveFailures >= 3)
    .map(([id, v]) => `- \`${id}\`（${v.name}）连续 ${v.consecutiveFailures} 天失败，7 日成功率 ${(v.successRate7d * 100).toFixed(0)}%`);

  const lines = [
    `## ${data.degradedMode ? "⚠️ 降级模式" : "✅"} ${curated.date} 简报已生成`,
    "",
    `- 构建时间：${beijingTimeLabel()}`,
    `- 入选 **${published.length}** 条，分布在 **${sections.length}** 个栏目，全部读完约 **${data.stats.totalReadMinutes}** 分钟`,
    `- 数据源：${data.stats.sourcesOk} 个成功 / ${data.stats.sourcesFailed} 个失败`,
    `- API 消耗：输入 ${(usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens).toLocaleString()} tok，输出 ${usage.outputTokens.toLocaleString()} tok，预估 **$${usage.estimatedCostUsd.toFixed(4)}**`,
    ...(data.degradedMode ? ["", `> 降级原因：${data.degradedReason ?? "未知"}`] : []),
    ...(usage.estimatedCostUsd > 1 ? ["", `> 🚨 **成本告警**：今日 $${usage.estimatedCostUsd.toFixed(4)} 已超过 $1 阈值`] : []),
    "",
    "### 今日导读",
    "",
    data.brief.overview,
    "",
    ...(sick.length ? ["### ⚠️ 需要关注的数据源", "", ...sick, ""] : []),
  ];
  await appendJobSummary(lines.join("\n"));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("输出阶段异常：", err);
    process.exit(1);
  });
