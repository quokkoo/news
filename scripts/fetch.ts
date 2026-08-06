/**
 * 步骤 1：抓取
 *
 *   npm run fetch
 *
 * 从 config/sources.ts 读取全部启用的源并发抓取，按 24h 窗口过滤，
 * 两级去重（URL 规范化 + 标题模糊匹配），补抓缺摘要条目的正文，
 * 输出 .cache/fetch.json 与 data/source-health.json。
 */
import "dotenv/config";
import Parser from "rss-parser";
import { extract } from "@extractus/article-extractor";
import { ENABLED_SOURCES, FETCH_CONFIG, DEFAULT_CAP, PAYWALL_PENALTY, SOURCES } from "../config/sources.ts";
import type { Source } from "../config/sources.ts";
import type { FetchOutput, RawItem, SourceHealth, SourceResult } from "./lib/types.ts";
import {
  DATA_DIR,
  beijingDate,
  cachePath,
  canonicalizeUrl,
  hashId,
  jaccard,
  log,
  mapWithConcurrency,
  readJson,
  stripHtml,
  titleTokens,
  truncate,
  writeJson,
} from "./lib/util.ts";
import { join } from "node:path";

const parser = new Parser({
  timeout: FETCH_CONFIG.timeoutMs,
  headers: {
    "user-agent": FETCH_CONFIG.userAgent,
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:date", "dcDate"],
    ],
  },
});

interface FetchedSource {
  source: Source;
  items: RawItem[];
  result: SourceResult;
}

async function fetchSource(source: Source): Promise<FetchedSource> {
  const t0 = Date.now();
  const cap = source.cap ?? DEFAULT_CAP;
  const now = Date.now();
  const cutoff = now - FETCH_CONFIG.windowHours * 3600_000;

  try {
    const feed = await parser.parseURL(source.url);
    const entries = (feed.items ?? []).slice(0, cap);
    const items: RawItem[] = [];

    for (const e of entries) {
      const link = e.link ?? e.guid ?? "";
      if (!link || !/^https?:/i.test(link)) continue;
      const title = stripHtml(e.title ?? "").trim();
      if (!title) continue;

      const rawDate = e.isoDate ?? e.pubDate ?? (e as { dcDate?: string }).dcDate;
      const parsed = rawDate ? Date.parse(rawDate) : NaN;
      const inferred = Number.isNaN(parsed);
      // 缺发布时间的按抓取时间处理（视为刚发布）
      const publishedMs = inferred ? now : parsed;

      // UTC 毫秒直接比较，天然跨时区正确
      if (publishedMs < cutoff) continue;
      // 少数源会给未来时间，容忍 2h 时钟漂移后仍在未来的丢弃
      if (publishedMs > now + 2 * 3600_000) continue;

      const content = stripHtml(
        (e as { contentEncoded?: string }).contentEncoded ??
          e.contentSnippet ??
          e.content ??
          e.summary ??
          "",
      );

      const canonical = canonicalizeUrl(link);
      items.push({
        id: hashId(source.id, canonical),
        title,
        url: link,
        canonicalUrl: canonical,
        content: truncate(content, FETCH_CONFIG.articleMaxChars),
        publishedAt: new Date(publishedMs).toISOString(),
        publishedAtInferred: inferred,
        sourceId: source.id,
        sourceName: source.name,
        topic: source.topic,
        lang: source.lang,
        paywall: !!source.paywall,
        sourceWeight: source.weight + (source.paywall ? PAYWALL_PENALTY : 0),
        coverageCount: 1,
        alsoCovered: [],
      });
    }

    return {
      source,
      items,
      result: {
        sourceId: source.id,
        sourceName: source.name,
        ok: true,
        itemCount: entries.length,
        inWindowCount: items.length,
        durationMs: Date.now() - t0,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      source,
      items: [],
      result: {
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        itemCount: 0,
        inWindowCount: 0,
        durationMs: Date.now() - t0,
        error: msg.slice(0, 200),
      },
    };
  }
}

/**
 * 去重。
 * 1) 先按规范化 URL 精确去重
 * 2) 再按标题 token 集合做 Jaccard 模糊匹配（> 阈值视为同一事件）
 * 保留来源权重更高的一条作为主条目，其余记入 alsoCovered 并累加 coverageCount。
 */
function dedupe(items: RawItem[]): RawItem[] {
  // 权重高的排前面，这样它天然成为主条目
  const sorted = [...items].sort((a, b) => b.sourceWeight - a.sourceWeight);

  const byUrl = new Map<string, RawItem>();
  for (const it of sorted) {
    const existing = byUrl.get(it.canonicalUrl);
    if (!existing) {
      byUrl.set(it.canonicalUrl, it);
    } else if (existing.sourceId !== it.sourceId) {
      existing.coverageCount += 1;
      existing.alsoCovered.push({ sourceName: it.sourceName, url: it.url });
    }
  }

  const kept: Array<{ item: RawItem; tokens: Set<string> }> = [];
  for (const it of byUrl.values()) {
    const tokens = titleTokens(it.title);
    // token 太少（超短标题）不做模糊匹配，避免误杀
    if (tokens.size >= 3) {
      let merged = false;
      for (const k of kept) {
        if (jaccard(tokens, k.tokens) > FETCH_CONFIG.dedupeThreshold) {
          if (k.item.sourceId !== it.sourceId) {
            k.item.coverageCount += 1;
            k.item.alsoCovered.push({ sourceName: it.sourceName, url: it.url });
          }
          merged = true;
          break;
        }
      }
      if (merged) continue;
    }
    kept.push({ item: it, tokens });
  }

  return kept.map((k) => k.item);
}

/** 对缺摘要的条目抓原文正文。失败就只用标题，不阻塞流程。 */
async function enrich(items: RawItem[]): Promise<number> {
  const needs = items
    .filter((i) => i.content.length < 120 && !i.paywall)
    .sort((a, b) => b.sourceWeight - a.sourceWeight)
    .slice(0, FETCH_CONFIG.articleExtractLimit);

  if (!needs.length) return 0;
  log.info(`补抓正文：${needs.length} 条缺摘要`);

  let ok = 0;
  await mapWithConcurrency(needs, 5, async (item) => {
    try {
      const art = await extract(item.url, {}, { signal: AbortSignal.timeout(15_000) });
      const body = stripHtml(art?.content ?? "");
      if (body.length > item.content.length) {
        item.content = truncate(body, FETCH_CONFIG.articleMaxChars);
        ok++;
      }
    } catch {
      /* 抓不到就算了，标题足够 AI 判断是否值得读 */
    }
  });
  return ok;
}

/** 更新源健康度档案（滚动保留 7 天） */
async function updateHealth(results: SourceResult[], date: string): Promise<string[]> {
  const path = join(DATA_DIR, "source-health.json");
  const prev = (await readJson<SourceHealth>(path)) ?? { updatedAt: "", sources: {} };
  const next: SourceHealth = { updatedAt: new Date().toISOString(), sources: {} };

  for (const r of results) {
    const old = prev.sources[r.sourceId];
    const history = [
      { date, ok: r.ok, itemCount: r.inWindowCount, ...(r.error ? { error: r.error } : {}) },
      ...(old?.history ?? []).filter((h) => h.date !== date),
    ].slice(0, 7);

    let consecutive = 0;
    for (const h of history) {
      if (h.ok) break;
      consecutive++;
    }
    next.sources[r.sourceId] = {
      name: r.sourceName,
      history,
      consecutiveFailures: consecutive,
      successRate7d: history.filter((h) => h.ok).length / history.length,
    };
  }
  // 保留已禁用源的历史记录，避免开关一次就丢档案
  for (const [id, v] of Object.entries(prev.sources)) {
    if (!next.sources[id]) next.sources[id] = v;
  }

  await writeJson(path, next);

  const warnings: string[] = [];
  for (const [id, v] of Object.entries(next.sources)) {
    if (v.consecutiveFailures >= 3) {
      warnings.push(`\`${id}\`（${v.name}）已连续 ${v.consecutiveFailures} 天失败`);
    }
  }
  return warnings;
}

async function main() {
  const t0 = Date.now();
  const date = beijingDate();
  log.step(`抓取 ${date} · ${ENABLED_SOURCES.length} 个源（共配置 ${SOURCES.length} 个）`);

  const fetched = await mapWithConcurrency(
    ENABLED_SOURCES,
    FETCH_CONFIG.concurrency,
    (s) => fetchSource(s),
  );

  const results = fetched.map((f) => f.result);
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  for (const r of failed) {
    log.warn(`${r.sourceName} (${r.sourceId}): ${r.error}`);
  }

  const all = fetched.flatMap((f) => f.items);
  log.ok(`${okCount}/${ENABLED_SOURCES.length} 个源成功，24h 内共 ${all.length} 条`);

  const deduped = dedupe(all);
  log.ok(`去重后 ${deduped.length} 条（合并 ${all.length - deduped.length} 条重复报道）`);

  const multi = deduped.filter((i) => i.coverageCount > 1).length;
  if (multi) log.info(`其中 ${multi} 条被多家同时报道`);

  const extracted = await enrich(deduped);
  if (extracted) log.ok(`成功补抓 ${extracted} 篇正文`);

  const warnings = await updateHealth(results, date);
  for (const w of warnings) log.warn(w.replace(/`/g, ""));

  const output: FetchOutput = {
    generatedAt: new Date().toISOString(),
    date,
    items: deduped,
    stats: {
      sourcesTotal: ENABLED_SOURCES.length,
      sourcesOk: okCount,
      sourcesFailed: failed.length,
      itemsRaw: all.length,
      itemsInWindow: all.length,
      itemsAfterDedupe: deduped.length,
      articlesExtracted: extracted,
      durationMs: Date.now() - t0,
    },
    sourceResults: results,
  };

  await writeJson(cachePath("fetch.json"), output);
  log.ok(`已写入 .cache/fetch.json（耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
}

main()
  .then(() => {
    // article-extractor / undici 的 keep-alive 连接池会挂住事件循环，显式退出
    process.exit(0);
  })
  .catch((err) => {
    log.error("抓取阶段异常：", err);
    process.exit(1);
  });
