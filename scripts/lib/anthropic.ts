import Anthropic from "@anthropic-ai/sdk";
import type { UsageStats } from "./types.ts";
import { log, sleep } from "./util.ts";

/**
 * Anthropic 调用层。
 *
 * 设计要点：
 * - structured outputs（output_config.format）强制 JSON schema，不用正则解析模型输出。
 * - 自己实现指数退避（客户端 maxRetries 关掉），这样 429/529 的重试过程能打进日志。
 * - 单批失败不抛到外层，返回 null，由调用方降级。
 * - 全程累计 token 与预估费用，供成本告警使用。
 */

/** 每百万 token 美元单价。核对日期 2026-08-06。 */
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Sonnet 5 标准价 $3/$15；2026-08-31 前为促销价 $2/$10。
  "claude-sonnet-5": { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** Sonnet 5 促销价结束日期（之后回到 $3/$15） */
const SONNET_INTRO_ENDS = Date.parse("2026-09-01T00:00:00Z");

function priceFor(model: string) {
  const p = PRICING[model] ?? PRICING["claude-sonnet-5"]!;
  if (model === "claude-sonnet-5" && Date.now() >= SONNET_INTRO_ENDS) {
    return { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };
  }
  return p;
}

export const MODEL_CURATE = process.env.MODEL_CURATE || "claude-sonnet-5";
export const MODEL_BRIEF = process.env.MODEL_BRIEF || "claude-opus-5";

/** 成本告警阈值（美元 / 天） */
export const COST_TARGET_USD = 0.3;
export const COST_ALERT_USD = 1.0;

export function emptyUsage(): UsageStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    calls: 0,
    failedCalls: 0,
    estimatedCostUsd: 0,
    byModel: {},
  };
}

export function mergeUsage(a: UsageStats, b: UsageStats): UsageStats {
  const out = emptyUsage();
  out.inputTokens = a.inputTokens + b.inputTokens;
  out.outputTokens = a.outputTokens + b.outputTokens;
  out.cacheReadTokens = a.cacheReadTokens + b.cacheReadTokens;
  out.cacheWriteTokens = a.cacheWriteTokens + b.cacheWriteTokens;
  out.calls = a.calls + b.calls;
  out.failedCalls = a.failedCalls + b.failedCalls;
  out.estimatedCostUsd = a.estimatedCostUsd + b.estimatedCostUsd;
  for (const src of [a.byModel, b.byModel]) {
    for (const [m, v] of Object.entries(src)) {
      const cur = out.byModel[m] ?? { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0 };
      cur.inputTokens += v.inputTokens;
      cur.outputTokens += v.outputTokens;
      cur.calls += v.calls;
      cur.costUsd += v.costUsd;
      out.byModel[m] = cur;
    }
  }
  return out;
}

/** 是否具备调用条件 */
export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.DEGRADED !== "1";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      // 自己做退避，关掉 SDK 内置重试，避免两层重试叠加放大延迟
      maxRetries: 0,
      timeout: 180_000,
    });
  }
  return client;
}

export interface CallOptions {
  model: string;
  system: string;
  userContent: string;
  /** structured outputs 的 JSON schema。给了就强制该格式。 */
  schema?: Record<string, unknown>;
  maxTokens?: number;
  /** low | medium | high | xhigh | max */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** 关掉思考（批量打分不需要，省 token）。Opus 5 只在 effort ≤ high 时允许关闭。 */
  disableThinking?: boolean;
  /** 缓存 system 块（同一领域多批复用） */
  cacheSystem?: boolean;
  label: string;
}

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/**
 * 调用一次模型。成功返回解析后的 JSON（或纯文本），失败返回 null。
 * 绝不抛异常到外层——单批失败必须降级而不是让整个管道崩掉。
 */
export async function callModel<T>(
  opts: CallOptions,
  usage: UsageStats,
): Promise<T | null> {
  const c = getClient();
  const price = priceFor(opts.model);

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.cacheSystem
      ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
      : opts.system,
    messages: [{ role: "user", content: opts.userContent }],
  };

  const outputConfig: Record<string, unknown> = {};
  if (opts.schema) {
    outputConfig["format"] = { type: "json_schema", schema: opts.schema };
  }
  if (opts.effort) outputConfig["effort"] = opts.effort;
  if (Object.keys(outputConfig).length) body["output_config"] = outputConfig;

  if (opts.disableThinking) body["thinking"] = { type: "disabled" };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await c.messages.create(body as never);

      // 记账
      const u = res.usage;
      const inTok = u.input_tokens ?? 0;
      const outTok = u.output_tokens ?? 0;
      const cr = u.cache_read_input_tokens ?? 0;
      const cw = u.cache_creation_input_tokens ?? 0;
      const cost =
        (inTok * price.input + outTok * price.output + cr * price.cacheRead + cw * price.cacheWrite) /
        1_000_000;
      usage.inputTokens += inTok;
      usage.outputTokens += outTok;
      usage.cacheReadTokens += cr;
      usage.cacheWriteTokens += cw;
      usage.calls += 1;
      usage.estimatedCostUsd += cost;
      const m = (usage.byModel[opts.model] ??= {
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
        costUsd: 0,
      });
      m.inputTokens += inTok + cr + cw;
      m.outputTokens += outTok;
      m.calls += 1;
      m.costUsd += cost;

      // 安全分类器可能拒答；此时不该当成解析失败
      if (res.stop_reason === "refusal") {
        log.warn(`${opts.label}: 模型拒答（${res.stop_details?.category ?? "unknown"}），该批降级`);
        usage.failedCalls += 1;
        return null;
      }
      if (res.stop_reason === "max_tokens") {
        log.warn(`${opts.label}: 输出被 max_tokens 截断，该批降级`);
        usage.failedCalls += 1;
        return null;
      }

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (!opts.schema) return text as unknown as T;

      try {
        return JSON.parse(text) as T;
      } catch {
        log.warn(`${opts.label}: 返回内容不是合法 JSON（长度 ${text.length}），该批降级`);
        usage.failedCalls += 1;
        return null;
      }
    } catch (err) {
      const status =
        err instanceof Anthropic.APIError ? err.status : undefined;
      const retryable =
        err instanceof Anthropic.APIConnectionError ||
        (status !== undefined && RETRYABLE_STATUS.has(status));

      if (!retryable || attempt === MAX_ATTEMPTS) {
        usage.failedCalls += 1;
        log.error(
          `${opts.label}: 第 ${attempt}/${MAX_ATTEMPTS} 次失败${status ? `（HTTP ${status}）` : ""}：` +
            (err instanceof Error ? err.message : String(err)),
        );
        return null;
      }

      // 指数退避 + 抖动：2s / 4s / 8s
      const delay = 2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 800);
      log.warn(
        `${opts.label}: 第 ${attempt}/${MAX_ATTEMPTS} 次失败${status ? `（HTTP ${status}）` : ""}，${(delay / 1000).toFixed(1)}s 后重试`,
      );
      await sleep(delay);
    }
  }
  return null;
}

/** 打印成本报表，超阈值告警 */
export function reportCost(usage: UsageStats): string[] {
  const lines: string[] = [];
  lines.push(
    `API 调用：${usage.calls} 次成功路径 / ${usage.failedCalls} 次失败或降级`,
  );
  for (const [model, v] of Object.entries(usage.byModel)) {
    lines.push(
      `  ${model}: ${v.calls} 次，输入 ${v.inputTokens.toLocaleString()} tok，输出 ${v.outputTokens.toLocaleString()} tok，约 $${v.costUsd.toFixed(4)}`,
    );
  }
  lines.push(`预估总费用：$${usage.estimatedCostUsd.toFixed(4)}（目标 ≤ $${COST_TARGET_USD}/天）`);
  if (usage.estimatedCostUsd > COST_ALERT_USD) {
    lines.push(`🚨 成本告警：今日消耗 $${usage.estimatedCostUsd.toFixed(4)} 已超过 $${COST_ALERT_USD} 阈值`);
  } else if (usage.estimatedCostUsd > COST_TARGET_USD) {
    lines.push(`⚠️ 今日消耗超出 $${COST_TARGET_USD} 目标，但仍在 $${COST_ALERT_USD} 告警线内`);
  }
  return lines;
}
