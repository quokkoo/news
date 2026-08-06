/**
 * 源可达性体检
 *
 *   npm run check-sources            # 检查已启用的源
 *   npm run check-sources -- --all   # 连同 enabled:false 的一起检查
 *
 * 加新源之后先跑这个，确认能拿到条目再提交，避免把一个假的 feed 地址写进配置。
 */
import { SOURCES, FETCH_CONFIG } from "../config/sources.ts";
import type { Source } from "../config/sources.ts";
import { mapWithConcurrency } from "./lib/util.ts";

const includeDisabled = process.argv.includes("--all");
const targets = SOURCES.filter((s) => includeDisabled || s.enabled !== false);

interface Row {
  source: Source;
  status: string;
  items: number;
  freshHours: string;
  detail: string;
}

async function probe(source: Source): Promise<Row> {
  try {
    const res = await fetch(source.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_CONFIG.timeoutMs),
      headers: {
        "user-agent": FETCH_CONFIG.userAgent,
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    const body = await res.text();
    const items =
      (body.match(/<item[\s>]/g) ?? []).length + (body.match(/<entry[\s>]/g) ?? []).length;
    const isXml = /<(rss|feed|rdf:RDF)[\s>]/i.test(body);
    const dates = [...body.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]+)</g)]
      .map((m) => Date.parse(m[1]!))
      .filter((n) => !Number.isNaN(n));
    const freshHours = dates.length
      ? ((Date.now() - Math.max(...dates)) / 3.6e6).toFixed(1)
      : "?";

    let status = "FAIL";
    if (res.ok && isXml && items > 0) status = "OK";
    else if (res.ok && isXml) status = "EMPTY";
    else if (res.ok) status = "NOT-XML";
    else status = `HTTP${res.status}`;

    return { source, status, items, freshHours, detail: res.headers.get("content-type") ?? "" };
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name;
    return { source, status: "ERROR", items: 0, freshHours: "?", detail: String(code) };
  }
}

const pad = (s: unknown, n: number) => String(s).padEnd(n).slice(0, n);

const rows = await mapWithConcurrency(targets, 10, probe);
rows.sort((a, b) => a.source.topic.localeCompare(b.source.topic) || a.source.id.localeCompare(b.source.id));

console.log(pad("TOPIC", 13) + pad("STATUS", 9) + pad("ITEMS", 7) + pad("最新(h)", 10) + pad("SOURCE", 26) + "DETAIL");
console.log("─".repeat(100));
for (const r of rows) {
  const mark = r.status === "OK" ? "  " : "! ";
  console.log(
    mark + pad(r.source.topic, 11) + pad(r.status, 9) + pad(r.items, 7) +
    pad(r.freshHours, 10) + pad(`${r.source.name} (${r.source.id})`, 26) + r.detail,
  );
}

const bad = rows.filter((r) => r.status !== "OK");
console.log(`\n共 ${rows.length} 个源：${rows.length - bad.length} 个正常，${bad.length} 个异常`);
if (bad.length) {
  console.log("\n异常明细（修好或从 config/sources.ts 移除）：");
  for (const r of bad) console.log(`  [${r.status}] ${r.source.name}  ${r.source.url}  ${r.detail}`);
}

// 陈旧提醒：feed 能访问但很久没更新
const stale = rows.filter((r) => r.status === "OK" && Number(r.freshHours) > 24 * 21);
if (stale.length) {
  console.log("\n以下源可达但已 3 周未更新，考虑替换：");
  for (const r of stale) console.log(`  ${r.source.name}：最新条目 ${(Number(r.freshHours) / 24).toFixed(0)} 天前`);
}

process.exit(bad.length ? 1 : 0);
