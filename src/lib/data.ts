/** 构建期从 data/ 读取 JSON。纯静态构建，运行时不需要这些代码。 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArchiveIndex, DailyData, PublishedItem } from "../../scripts/lib/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(ROOT, "data");

export function listDates(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
}

export function loadDay(date: string): DailyData | null {
  const p = join(DATA_DIR, `${date}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as DailyData;
}

export function loadLatest(): DailyData | null {
  const [latest] = listDates();
  return latest ? loadDay(latest) : null;
}

export function loadArchive(): ArchiveIndex {
  const p = join(DATA_DIR, "index.json");
  if (!existsSync(p)) return { updatedAt: new Date().toISOString(), days: [] };
  return JSON.parse(readFileSync(p, "utf8")) as ArchiveIndex;
}

/** 2026-08-06 → 8 月 6 日 · 星期四 */
export function formatDateCN(date: string): string {
  // 取当天 12:00 UTC（北京 20:00），确保星期几不受时区偏移影响
  const week = ["日", "一", "二", "三", "四", "五", "六"][
    new Date(`${date}T12:00:00Z`).getUTCDay()
  ];
  const [, m, day] = date.split("-");
  return `${Number(m)} 月 ${Number(day)} 日 · 星期${week}`;
}

/** ISO 时间 → 相对北京时间的「今天 08:30」/「8月5日 21:04」 */
export function formatTime(iso: string, refDate: string): string {
  const t = new Date(iso);
  const bj = new Date(t.getTime() + 8 * 3600_000);
  const hh = String(bj.getUTCHours()).padStart(2, "0");
  const mm = String(bj.getUTCMinutes()).padStart(2, "0");
  const dayStr = bj.toISOString().slice(0, 10);
  if (dayStr === refDate) return `${hh}:${mm}`;
  return `${Number(dayStr.slice(5, 7))}/${Number(dayStr.slice(8, 10))} ${hh}:${mm}`;
}

/** 在 10 分钟模式下保留的条目：Top 3 + 每个核心栏目分数最高的 1 条 */
export function tenMinuteKeepIds(day: DailyData): Set<string> {
  const keep = new Set(day.topPickIds);
  for (const s of day.sections) {
    if (!s.core) continue;
    const top = s.items[0];
    if (top) keep.add(top.id);
  }
  return keep;
}

export function totalMinutes(items: PublishedItem[]): number {
  return items.reduce((n, i) => n + i.readMinutes, 0);
}
