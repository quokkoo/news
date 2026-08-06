# 每日新闻精读

> 我一大早只有 30 分钟。这个站替我从几百条资讯里挑出真正值得读的，并告诉我该花多久读。

线上地址：**<https://quokkoo.github.io/news/>** · [RSS 订阅](https://quokkoo.github.io/news/feed.xml) · [历史归档](https://quokkoo.github.io/news/archive)

**本站按规则模型自动排序，不接入 AI**：不需要任何 API key，没有调用成本。每天北京时间
**7:00 前**自动完成抓取、排序、生成、部署，全流程零人工干预。

（代码库里其实保留了一套完整的可选 AI 精选路径——中文标题润色、摘要、「为什么重要」——
默认关闭。想打开见文末[《可选：启用 AI 精选》](#可选启用-ai-精选进阶)。）

---

## 它每天做什么

```
95 个 RSS 源
   ↓  fetch      并发抓取 · 24h 窗口 · URL 规范化 + 标题模糊去重 · 记录报道家数
~1200 条
   ↓  规则排序    按来源权重 + 报道家数 + 新鲜度打分，每个领域按门槛与条数上限截取
~40 条
   ↓  brief       生成「今日概览」（按条数/栏目/预计阅读时间自动拼句）+ 排序分最高的 Top 3
   ↓  build-data   写 data/YYYY-MM-DD.json、更新归档索引、生成 feed.xml
静态站点
```

排序公式在 `config/topics.ts` 里可调。**没有 AI 生成的中文润色或「为什么重要」**——
标题是 RSS 原标题，摘要是原文内容的前 N 字精简，卡片和首页顶部横幅都会如实标注这一点，
不会假装这是编辑判断。

---

## 目录结构

```
config/
  topics.ts          领域配置 —— 增删栏目、调评分权重只改这里
  sources.ts         RSS 源配置 —— 增删源只改这里
scripts/
  fetch.ts           抓取 + 去重
  curate.ts          规则排序（保留了可选的 AI 精选路径，默认不启用）
  brief.ts           今日概览生成（规则拼句；启用 AI 后会替换为真正的主编导读）
  build-data.ts      写数据文件 + RSS
  check-sources.ts   源可达性体检
  lib/               类型、工具、Anthropic 调用层（仅 AI 路径用到）
src/                 Astro 站点
data/
  YYYY-MM-DD.json    每日归档（提交回仓库，可回溯）
  index.json         日期索引
  source-health.json 各源近 7 天成功率
.github/workflows/daily.yml
```

---

## 怎么改

### 加一个新领域

编辑 `config/topics.ts`，往 `TOPICS` 数组里加一项：

```ts
{
  id: "space",                    // 唯一 id，同时是筛选值和 URL 锚点，只用小写字母和连字符
  name: "航天与太空经济",
  description: "一句话定位，显示在栏目标题下方。",
  core: false,                    // true = 每天必出；false = 内容不够当天整个栏目隐藏
  maxItems: 3,                    // 每日最多几条
  targetMinutes: [3, 5],          // 时长徽章。null = 不限时
  weight: 0.0,                    // 领域权重，直接加到综合分（-1 ~ +1）
  minScore: 5.8,                  // 入选门槛，低于此分不显示
  minItemsToShow: 2,              // 扩展栏目专用：不够这么多条就整个隐藏
  order: 13,                      // 首页排序
  accent: { light: "#3730a3", dark: "#a5b4fc" },
  guidance: "优先：…… 剔除：……",   // 只在启用 AI 精选时生效，默认模式下不使用
},
```

然后去 `config/sources.ts` 给它挂上源（`topic: "space"`）。不用改任何其他文件。

### 加一个新 RSS 源

编辑 `config/sources.ts`，往 `SOURCES` 数组里加一项：

```ts
{
  id: "my-source",        // 唯一 id
  name: "显示名称",
  url: "https://example.com/feed.xml",
  topic: "ai",            // 必须是 config/topics.ts 里存在的 Topic.id
  weight: 0.2,            // 来源权重，直接加到综合分。权威一手信源给正值，聚合站给负值
  lang: "en",             // "zh" | "en"
  paywall: true,          // 可选：正文有付费墙，会额外 -0.5 并在卡片上标「付费」
  enabled: false,         // 可选：暂时不抓
  cap: 40,                // 可选：单次最多解析多少条（有些源一次吐几千条）
  note: "为什么给这个权重 / 已知问题",
},
```

提交前先跑一次体检：

```bash
npm run check-sources
```

它会实测每个源的可达性、条目数和最新条目时间，并把可达但已 3 周未更新的源标出来。
**不要凭印象填 feed 地址** —— 很多站点的 `/feed` 已经下线了。

已经实测过不可用的源记录在 `config/sources.ts` 的 `REJECTED_SOURCES` 里，附了原因和替代方案，
省得以后又去试一遍。

### 调整评分权重

`config/topics.ts` 底部：

```ts
export const SCORE_WEIGHTS = {
  importance: 0.4,      // 重要性：影响范围 × 持续时间
  novelty: 0.25,        // 新颖度：新信息还是旧闻复读
  actionability: 0.2,   // 可行动性：读完能否改变一个具体判断
  depth: 0.15,          // 深度：一手数据/独家 vs 通稿改写
};                      // 四项之和应为 1

export const SCORE_ADJUSTMENTS = {
  useSourceWeight: true,                              // 是否叠加来源权重
  useTopicWeight: true,                               // 是否叠加领域权重
  coverageBonus: { threshold: 3, bonus: 0.3 },        // ≥3 家报道加分
  mustReadThreshold: 8.0,                             // 达到此分标「必读」小圆点
};
```

**在不启用 AI 的默认模式下**，这四项分数由 `scripts/curate.ts` 里的 `ruleScore()` 纯规则计算
（来源权重 + 报道家数 + 新鲜度 + 正文长度），不是 AI 打的分。综合分公式和权重生效方式相同：
`importance×0.4 + novelty×0.25 + actionability×0.2 + depth×0.15`，再叠加来源权重、领域权重和
报道家数加分。

想让内容更少更精 → 调高各领域的 `minScore`；想要更多 → 调低，或调大 `maxItems`。

---

## 本地调试

```bash
npm install
```

**四个步骤可以单独跑**，中间产物落在 `.cache/`，方便局部重试。全部免费，不需要任何密钥：

```bash
npm run fetch        # → .cache/fetch.json
npm run curate       # → .cache/curate.json
npm run brief        # → .cache/brief.json
npm run build-data   # → data/*.json + public/feed.xml

npm run pipeline     # 以上四步串起来
```

跑一次 `pipeline` 之后 `data/` 里就有真数据了，调页面样式时只需要：

```bash
npm run dev          # 本地开发服务器 http://localhost:4321/news/
npm run build        # 构建到 dist/
npm run preview      # 预览构建产物
```

---

## 健壮性设计

| 情况 | 行为 |
|---|---|
| 单个源抓取失败 | 跳过并记录，其余源不受影响；连续 3 天失败会在 Job Summary 里点名 |
| 当天入选 < 5 条 | 判定为抓取异常：不写任何数据文件，workflow 标红，**线上保持昨天的版本** |
| 任一步骤失败 | 后续构建与部署步骤跳过，已发布的站点不受影响 |

`data/source-health.json` 记录每个源近 7 天的成功率，即使当天管道失败也会提交回仓库。

（如果启用了[可选 AI 精选](#可选启用-ai-精选进阶)，还会有额外的重试/降级机制，见该节。）

---

## 关于数据源

`config/sources.ts` 里共配置 99 个源，其中 95 个默认启用、4 个默认关闭。全部在 2026-08-06
逐个实测过可达性 —— 没有一个是凭印象填的。

**明确不可用、没有采用的**（记录在 `REJECTED_SOURCES`）：

| 源 | 原因 | 替代 |
|---|---|---|
| The Information | HTTP 403，付费墙无公开 feed | 无，用 Semafor + Axios 部分覆盖 |
| Barron's | HTTP 404/403，Dow Jones 已下线该 feed | WSJ Markets + WSJ Business |
| Harvard Business Review | ECONNRESET，`hbr.org/feed` 也 404 | The Generalist + Stratechery |
| a16z / a16z crypto | 全部 feed 路径 404 | Sequoia + Not Boring / Blockworks |
| 晚点 LatePost | TLS 证书链不完整 | 虎嗅 + 钛媒体 |
| 甲子光年 | 域名不解析 | 钛媒体 |
| 财新网 | 返回 HTML 而非 XML | 华尔街见闻 + FT中文网 |
| Lawfare / IEA / Latitude Media / AnandTech / Sherwood | 403 或官方 feed 已下线 | 同栏目其他源补足 |
| Papers with Code / alphaXiv | 无 RSS | arXiv 直连 |
| **RSSHub 公共实例** | `rsshub.app` 全部路径 403，已限流 | **不采用**（不稳定）；需要的话请自建实例 |

**默认关闭、等 CI 验证的**（`enabled: false`）：量子位、机器之心、36氪、晚点 —— 这些在开发机上
抓不到（反爬或地域限制），但 GitHub Actions 的美国 runner 可能可以。第一次自动运行后查看
`data/source-health.json`，能通就把 `enabled` 改成 `true`。

**付费墙源**（WSJ、Bloomberg、FT中文网、日经亚洲、Stratechery、SemiAnalysis、STAT、Endpoints 等）
的 RSS 只有标题和导语，卡片摘要就基于这些内容截断，卡片上会标「付费」。它们的来源权重额外 -0.5。

---

## 站点交互

- **10 分钟模式**（顶栏开关）：只显示 Top 3 + 每个核心栏目分数最高的 1 条，扩展栏目整个折叠。
  选择存 localStorage。
- **领域筛选**：顶部 chip 组，可多选，纯前端过滤不刷新。移动端固定在屏幕底部，拇指可达。
- **深色模式**：默认跟随系统 `prefers-color-scheme`，手动切换后存 localStorage。两套主题独立调过。
- **无 JS 可读**：所有内容服务端渲染，关掉 JS 只是失去开关和筛选，阅读不受影响；
  深色模式仍会跟随系统。
- 无外部 CDN，字体使用系统字体栈，前端 JS 约 3KB。

---

## 部署

首次配置（已完成的话不用再做）：

```bash
gh api -X POST repos/quokkoo/news/pages -f build_type=workflow
gh workflow run daily.yml
gh run watch
```

不需要设置任何 secret ——默认模式没有 AI 调用。之后完全自动，想临时手动跑一次：

```bash
gh workflow run daily.yml
```

---

## 可选：启用 AI 精选（进阶）

代码库保留了完整的两段式 AI 精选路径（分流打分 → 精写中文标题/摘要/为什么重要 → 主编导读），
默认关闭。想打开：

```bash
cp .env.example .env      # 填入 ANTHROPIC_API_KEY（.env 已被 gitignore，不会提交）
npm run pipeline
```

**成本设计**：一天实抓约 1200 条，`config/topics.ts` 里的 `PREFILTER` 会先用规则把每个领域压到
条数上限的 5 倍（约 230 条）送 `claude-sonnet-5` 分流打分（每条约 30 token，很便宜），再只对
最终入选的约 40 条用 `claude-sonnet-5` 精写中文内容，最后用 `claude-opus-5` 生成一次主编导读。
设计目标 ≤ $0.3/天，实际消耗会打印在终端和（如果在 CI 里跑）Job Summary 里。

还想更便宜，可以把分流阶段换成 Haiku：

```bash
MODEL_CURATE=claude-haiku-4-5 npm run curate
```

**要在 GitHub Actions 里也用 AI**，需要自己改 `.github/workflows/daily.yml`，把
`ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` 加回「运行数据管道」步骤的 `env:`，
再设置 secret：

```bash
gh secret set ANTHROPIC_API_KEY          # 在终端里粘贴，不要写进任何文件
```

**启用 AI 后的健壮性机制**（默认规则模式不涉及，因为压根不调用 API）：

| 情况 | 行为 |
|---|---|
| Anthropic 返回 429 / 529 | 指数退避重试 3 次（2s / 4s / 8s + 抖动） |
| 单批 AI 调用最终失败 | 该批降级为规则分，标 `degraded: true`，卡片上显示「未评估」，其余批次照常 |
| API key 缺失或全部调用失败 | 整体回退为纯规则排序，页面顶部显示提示横幅，**站点照常出** |
| 模型返回非法 JSON / 被截断 / 拒答 | 当作该批失败处理，走规则兜底，不会崩掉管道 |

即使开着 AI，规则排序始终是安全网——任何一步的 AI 调用失败都不会让站点开天窗。
