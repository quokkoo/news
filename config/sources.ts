/**
 * RSS/Atom 源配置 —— 增删源只改这个文件。
 *
 * 所有 url 都在 2026-08-06 用 scripts/check-sources.ts 实测过可达性。
 * 随时可以重新验证：  npm run check-sources
 *
 * weight  : 来源权重，直接加到综合分上（建议 -0.5 ~ +0.5）。权威一手信源给正值，聚合/低信噪比给负值。
 * paywall : 正文有付费墙（RSS 只有标题+导语）。按用户设定统一额外 -0.5。
 * enabled : false = 暂时不抓。用于「本地网络抓不到、但 CI 的美国 runner 可能能抓」的源。
 * cap     : 单个源单次最多解析多少条（有些源一次吐几千条，先截断再按 24h 过滤）。
 */

export interface Source {
  id: string;
  name: string;
  url: string;
  /** 对应 config/topics.ts 里的 Topic.id */
  topic: string;
  weight: number;
  lang: "zh" | "en";
  paywall?: boolean;
  enabled?: boolean;
  cap?: number;
  /** 备注：为什么给这个权重 / 已知问题 */
  note?: string;
}

/** 付费墙源的额外扣分（用户设定：保留但降权） */
export const PAYWALL_PENALTY = -0.5;

/** 单个源解析条数默认上限 */
export const DEFAULT_CAP = 60;

export const SOURCES: Source[] = [
  // ══════════════════ 1. 宏观经济与资本市场 ══════════════════
  { id: "wsj-markets", name: "WSJ Markets", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", topic: "macro", weight: 0.4, lang: "en", paywall: true },
  { id: "wsj-world", name: "WSJ World News", url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews", topic: "macro", weight: 0.3, lang: "en", paywall: true },
  { id: "wsj-business", name: "WSJ Business", url: "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness", topic: "macro", weight: 0.35, lang: "en", paywall: true },
  { id: "bloomberg-markets", name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss", topic: "macro", weight: 0.4, lang: "en", paywall: true },
  { id: "bloomberg-economics", name: "Bloomberg Economics", url: "https://feeds.bloomberg.com/economics/news.rss", topic: "macro", weight: 0.4, lang: "en", paywall: true },
  { id: "cnbc-economy", name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", topic: "macro", weight: 0.1, lang: "en" },
  { id: "cnbc-finance", name: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", topic: "macro", weight: 0.0, lang: "en" },
  { id: "marketwatch-top", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", topic: "macro", weight: -0.1, lang: "en", note: "信噪比一般，靠 AI 过滤" },
  { id: "ftchinese", name: "FT中文网", url: "http://www.ftchinese.com/rss/feed", topic: "macro", weight: 0.35, lang: "zh", paywall: true },
  { id: "wallstreetcn", name: "华尔街见闻", url: "https://dedicated.wallstreetcn.com/rss.xml", topic: "macro", weight: 0.15, lang: "zh", cap: 80 },
  { id: "eastmoney", name: "东方财富", url: "http://rss.eastmoney.com/rss_partener.xml", topic: "macro", weight: -0.2, lang: "zh", cap: 80, note: "量大质杂，权重压低" },
  { id: "fed-press", name: "美联储公告", url: "https://www.federalreserve.gov/feeds/press_all.xml", topic: "macro", weight: 0.5, lang: "en", note: "一手信源" },
  { id: "ecb-press", name: "欧洲央行公告", url: "https://www.ecb.europa.eu/rss/press.html", topic: "macro", weight: 0.5, lang: "en", note: "一手信源" },
  { id: "calculated-risk", name: "Calculated Risk", url: "https://feeds.feedburner.com/CalculatedRisk", topic: "macro", weight: 0.25, lang: "en", note: "美国房地产与就业数据解读" },
  { id: "reuters-gnews", name: "Reuters（经 Google News）", url: "https://news.google.com/rss/search?q=site:reuters.com+business+OR+economy+when:1d&hl=en-US&gl=US&ceid=US:en", topic: "macro", weight: 0.1, lang: "en", cap: 40, note: "Reuters 官方 feed 已停，用 Google News 定向查询替代" },

  // ══════════════════ 2. 前沿科技与 AI 产业 ══════════════════
  { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", topic: "ai", weight: 0.0, lang: "en" },
  { id: "theverge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", topic: "ai", weight: 0.1, lang: "en" },
  { id: "arstechnica", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", topic: "ai", weight: 0.25, lang: "en" },
  { id: "hn-front", name: "Hacker News", url: "https://hnrss.org/frontpage?points=150", topic: "ai", weight: 0.2, lang: "en", note: "150 分以上门槛，已经过社区筛选" },
  { id: "hn-best", name: "Hacker News Best", url: "https://hnrss.org/best?points=200", topic: "ai", weight: 0.25, lang: "en" },
  { id: "mit-tr", name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", topic: "ai", weight: 0.3, lang: "en" },
  { id: "openai-news", name: "OpenAI", url: "https://openai.com/news/rss.xml", topic: "ai", weight: 0.45, lang: "en", cap: 30, note: "一手信源" },
  { id: "deepmind", name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", topic: "ai", weight: 0.45, lang: "en", cap: 30, note: "一手信源" },
  { id: "google-research", name: "Google Research", url: "https://research.google/blog/rss/", topic: "ai", weight: 0.35, lang: "en", cap: 30 },
  { id: "huggingface", name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", topic: "ai", weight: 0.3, lang: "en", cap: 40 },
  { id: "import-ai", name: "Import AI", url: "https://importai.substack.com/feed", topic: "ai", weight: 0.45, lang: "en", note: "Jack Clark 周更，质量极高" },
  { id: "latent-space", name: "Latent Space", url: "https://www.latent.space/feed", topic: "ai", weight: 0.35, lang: "en" },
  { id: "interconnects", name: "Interconnects", url: "https://www.interconnects.ai/feed", topic: "ai", weight: 0.4, lang: "en", note: "Nathan Lambert，后训练与开源模型" },
  { id: "simonwillison", name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", topic: "ai", weight: 0.3, lang: "en", cap: 40 },
  { id: "semafor-tech", name: "Semafor", url: "https://www.semafor.com/rss.xml", topic: "ai", weight: 0.1, lang: "en", cap: 60 },
  { id: "ifanr", name: "爱范儿", url: "https://www.ifanr.com/feed", topic: "ai", weight: -0.1, lang: "zh" },
  { id: "geekpark", name: "极客公园", url: "https://www.geekpark.net/rss", topic: "ai", weight: 0.0, lang: "zh" },
  { id: "cnbeta", name: "cnBeta", url: "https://www.cnbeta.com.tw/backend.php", topic: "ai", weight: -0.3, lang: "zh", cap: 80, note: "聚合站，量大质低，靠 AI 过滤" },
  { id: "solidot", name: "Solidot", url: "https://www.solidot.org/index.rss", topic: "ai", weight: 0.1, lang: "zh" },

  // ══════════════════ 3. 商业模式与行业深度 ══════════════════
  { id: "stratechery", name: "Stratechery", url: "https://stratechery.com/feed/", topic: "business", weight: 0.5, lang: "en", paywall: true, note: "每周一篇免费，其余付费" },
  { id: "the-generalist", name: "The Generalist", url: "https://www.generalist.com/feed", topic: "business", weight: 0.35, lang: "en" },
  { id: "huxiu", name: "虎嗅", url: "https://rss.huxiu.com/", topic: "business", weight: 0.05, lang: "zh", cap: 80, note: "www.huxiu.com/rss/0.xml 已失效，用 rss.huxiu.com" },
  { id: "tmtpost", name: "钛媒体", url: "https://www.tmtpost.com/rss.xml", topic: "business", weight: 0.0, lang: "zh" },
  { id: "axios", name: "Axios", url: "https://api.axios.com/feed/", topic: "business", weight: 0.15, lang: "en", cap: 60 },
  { id: "exponential-view", name: "Exponential View", url: "https://www.exponentialview.co/feed", topic: "business", weight: 0.3, lang: "en" },

  // ══════════════════ 4. 深度长文与思考 ══════════════════
  { id: "paulgraham", name: "Paul Graham", url: "http://www.aaronsw.com/2002/feeds/pgessays.rss", topic: "longform", weight: 0.5, lang: "en", cap: 20 },
  { id: "notboring", name: "Not Boring", url: "https://www.notboring.co/feed", topic: "longform", weight: 0.25, lang: "en" },
  { id: "sequoia", name: "Sequoia Capital", url: "https://www.sequoiacap.com/feed/", topic: "longform", weight: 0.3, lang: "en" },
  { id: "acx", name: "Astral Codex Ten", url: "https://www.astralcodexten.com/feed", topic: "longform", weight: 0.35, lang: "en" },
  { id: "marginalrevolution", name: "Marginal Revolution", url: "https://marginalrevolution.com/feed", topic: "longform", weight: 0.2, lang: "en", cap: 30 },
  { id: "benedictevans", name: "Benedict Evans", url: "https://www.ben-evans.com/benedictevans?format=rss", topic: "longform", weight: 0.45, lang: "en", cap: 20 },
  { id: "oneusefulthing", name: "One Useful Thing", url: "https://www.oneusefulthing.org/feed", topic: "longform", weight: 0.35, lang: "en", note: "Ethan Mollick，AI 实证应用" },
  { id: "construction-physics", name: "Construction Physics", url: "https://www.construction-physics.com/feed", topic: "longform", weight: 0.35, lang: "en" },
  { id: "noahpinion", name: "Noahpinion", url: "https://www.noahpinion.blog/feed", topic: "longform", weight: 0.25, lang: "en" },
  { id: "pragmatic-engineer", name: "The Pragmatic Engineer", url: "https://blog.pragmaticengineer.com/rss/", topic: "longform", weight: 0.3, lang: "en", paywall: true },

  // ══════════════════ 5. 半导体与硬件供应链 ══════════════════
  { id: "semianalysis", name: "SemiAnalysis", url: "https://semianalysis.com/feed/", topic: "semi", weight: 0.5, lang: "en", paywall: true, cap: 20, note: "深度最高，但更新不频繁且多为付费" },
  { id: "digitimes", name: "DigiTimes Asia", url: "https://www.digitimes.com/rss/daily.xml", topic: "semi", weight: 0.3, lang: "en", paywall: true, cap: 80 },
  { id: "eetimes", name: "EE Times", url: "https://www.eetimes.com/feed/", topic: "semi", weight: 0.2, lang: "en" },
  { id: "nikkei-asia", name: "日经亚洲", url: "https://asia.nikkei.com/rss/feed/nar", topic: "semi", weight: 0.35, lang: "en", paywall: true, cap: 60 },
  { id: "tomshardware", name: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", topic: "semi", weight: -0.2, lang: "en", cap: 60, note: "消费硬件为主，靠 AI 过滤评测稿" },
  { id: "trendforce", name: "TrendForce", url: "https://www.trendforce.com/news/feed", topic: "semi", weight: 0.3, lang: "en", cap: 30, note: "更新不频繁（实测最新条目 36 天前）" },
  { id: "semiconductor-digest", name: "Semiconductor Digest", url: "https://www.semiconductor-digest.com/feed/", topic: "semi", weight: 0.1, lang: "en", cap: 40 },

  // ══════════════════ 6. 地缘政治与政策监管 ══════════════════
  { id: "politico", name: "Politico", url: "https://rss.politico.com/politics-news.xml", topic: "geopolitics", weight: 0.0, lang: "en", cap: 40 },
  { id: "foreignaffairs", name: "Foreign Affairs", url: "https://www.foreignaffairs.com/rss.xml", topic: "geopolitics", weight: 0.4, lang: "en", paywall: true },
  { id: "scmp-china", name: "南华早报", url: "https://www.scmp.com/rss/4/feed", topic: "geopolitics", weight: 0.15, lang: "en", cap: 60 },
  { id: "gnews-export-controls", name: "出口管制（Google News）", url: "https://news.google.com/rss/search?q=(export+controls+OR+tariff+OR+antitrust)+(semiconductor+OR+AI+OR+chip)+when:1d&hl=en-US&gl=US&ceid=US:en", topic: "geopolitics", weight: 0.05, lang: "en", cap: 40, note: "定向查询，补足官方 feed 缺失" },

  // ══════════════════ 7. 能源与气候科技 ══════════════════
  { id: "canarymedia", name: "Canary Media", url: "https://www.canarymedia.com/feed", topic: "energy", weight: 0.3, lang: "en", cap: 40 },
  { id: "carbonbrief", name: "Carbon Brief", url: "https://www.carbonbrief.org/feed/", topic: "energy", weight: 0.3, lang: "en" },
  { id: "utilitydive", name: "Utility Dive", url: "https://www.utilitydive.com/feeds/news/", topic: "energy", weight: 0.25, lang: "en", note: "数据中心用电与电网议题的主力源" },
  { id: "heatmap", name: "Heatmap News", url: "https://heatmap.news/feeds/feed.xml", topic: "energy", weight: 0.25, lang: "en", cap: 40, note: "官方 /feed 已 404，改用 /feeds/feed.xml" },

  // ══════════════════ 8. 生物医药与健康科技 ══════════════════
  { id: "statnews", name: "STAT News", url: "https://www.statnews.com/feed/", topic: "bio", weight: 0.35, lang: "en", paywall: true },
  { id: "endpoints", name: "Endpoints News", url: "https://endpts.com/feed/", topic: "bio", weight: 0.35, lang: "en", paywall: true },
  { id: "fiercepharma", name: "FiercePharma", url: "https://www.fiercepharma.com/rss/xml", topic: "bio", weight: 0.15, lang: "en" },
  { id: "nature-news", name: "Nature News", url: "https://www.nature.com/nature.rss", topic: "bio", weight: 0.4, lang: "en", cap: 60 },
  { id: "science-news", name: "Science News", url: "https://www.science.org/rss/news_current.xml", topic: "bio", weight: 0.4, lang: "en" },
  { id: "fda-press", name: "FDA 公告", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", topic: "bio", weight: 0.45, lang: "en", note: "一手信源" },

  // ══════════════════ 9. 开源与开发者生态 ══════════════════
  { id: "github-blog", name: "GitHub Blog", url: "https://github.blog/feed/", topic: "dev", weight: 0.25, lang: "en" },
  { id: "hn-show", name: "Hacker News Show HN", url: "https://hnrss.org/show?points=100", topic: "dev", weight: 0.2, lang: "en", note: "100 分门槛，找值得 star 的新项目" },
  { id: "infoq-en", name: "InfoQ", url: "https://feed.infoq.com/", topic: "dev", weight: 0.15, lang: "en" },
  { id: "infoq-cn", name: "InfoQ 中文", url: "https://www.infoq.cn/feed", topic: "dev", weight: 0.1, lang: "zh" },
  { id: "changelog", name: "Changelog", url: "https://changelog.com/feed", topic: "dev", weight: 0.15, lang: "en", cap: 40 },
  { id: "golang-blog", name: "Go Blog", url: "https://go.dev/blog/feed.atom", topic: "dev", weight: 0.35, lang: "en", cap: 20, note: "一手信源，更新不频繁" },
  { id: "rust-blog", name: "Rust Blog", url: "https://blog.rust-lang.org/feed.xml", topic: "dev", weight: 0.35, lang: "en", cap: 20, note: "一手信源" },
  { id: "thenewstack", name: "The New Stack", url: "https://thenewstack.io/feed/", topic: "dev", weight: 0.1, lang: "en", cap: 40 },
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", topic: "dev", weight: -0.2, lang: "zh", note: "偏消费向，权重压低" },

  // ══════════════════ 10. 学术前沿速递 ══════════════════
  { id: "arxiv-ai", name: "arXiv cs.AI", url: "http://export.arxiv.org/rss/cs.AI", topic: "papers", weight: 0.2, lang: "en", cap: 120 },
  { id: "arxiv-lg", name: "arXiv cs.LG", url: "http://export.arxiv.org/rss/cs.LG", topic: "papers", weight: 0.2, lang: "en", cap: 120 },
  { id: "arxiv-cl", name: "arXiv cs.CL", url: "http://export.arxiv.org/rss/cs.CL", topic: "papers", weight: 0.2, lang: "en", cap: 120 },
  { id: "arxiv-econ", name: "arXiv econ.GN", url: "http://export.arxiv.org/rss/econ.GN", topic: "papers", weight: 0.1, lang: "en", cap: 40 },
  { id: "arxiv-qbio", name: "arXiv q-bio", url: "http://export.arxiv.org/rss/q-bio", topic: "papers", weight: 0.1, lang: "en", cap: 40 },
  { id: "nature-research", name: "Nature 研究论文", url: "https://www.nature.com/nature/current_issue/rss", topic: "papers", weight: 0.4, lang: "en", cap: 60, note: "/nature/articles.rss 返回 HTML，改用 current_issue/rss" },

  // ══════════════════ 11. 消费、出海与品牌 ══════════════════
  { id: "restofworld", name: "Rest of World", url: "https://restofworld.org/feed/latest/", topic: "consumer", weight: 0.4, lang: "en", note: "新兴市场科技报道，一手性强" },
  { id: "bof", name: "Business of Fashion", url: "https://www.businessoffashion.com/feed/", topic: "consumer", weight: 0.15, lang: "en", paywall: true, cap: 60 },
  { id: "modernretail", name: "Modern Retail", url: "https://www.modernretail.co/feed/", topic: "consumer", weight: 0.2, lang: "en" },
  { id: "technode", name: "TechNode", url: "https://technode.com/feed/", topic: "consumer", weight: 0.15, lang: "en", cap: 60, note: "中国科技公司英文报道" },

  // ══════════════════ 12. 加密与金融科技 ══════════════════
  { id: "theblock", name: "The Block", url: "https://www.theblock.co/rss.xml", topic: "crypto", weight: 0.2, lang: "en" },
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", topic: "crypto", weight: -0.1, lang: "en", note: "币价噪音多，靠 AI 严格过滤" },
  { id: "blockworks", name: "Blockworks", url: "https://blockworks.co/feed", topic: "crypto", weight: 0.1, lang: "en", cap: 40 },
  { id: "bankless", name: "Bankless", url: "https://www.bankless.com/feed", topic: "crypto", weight: 0.0, lang: "en", cap: 40, note: "newsletter.banklesshq.com 证书错误，改用主站" },
  { id: "fintech-weekly", name: "Fintech Business Weekly", url: "https://fintechbusinessweekly.substack.com/feed", topic: "crypto", weight: 0.35, lang: "en", note: "支付与银行监管，质量高" },

  // ══════════════════ 默认关闭：本地网络抓不到，CI 可能可以 ══════════════════
  // 第一次 CI 跑完后看 data/source-health.json，能通就把 enabled 改成 true。
  { id: "qbitai", name: "量子位", url: "https://www.qbitai.com/feed", topic: "ai", weight: 0.1, lang: "zh", enabled: false, note: "本地 ECONNRESET，疑似反爬或地域限制" },
  { id: "jiqizhixin", name: "机器之心", url: "https://www.jiqizhixin.com/rss", topic: "ai", weight: 0.15, lang: "zh", enabled: false, note: "本地返回 HTML 而非 XML" },
  { id: "36kr", name: "36氪", url: "https://36kr.com/feed", topic: "business", weight: -0.1, lang: "zh", enabled: false, note: "本地返回 HTML，疑似反爬" },
  { id: "latepost", name: "晚点 LatePost", url: "https://www.latepost.com/rss", topic: "business", weight: 0.4, lang: "zh", enabled: false, note: "TLS 证书链不完整（UNABLE_TO_GET_ISSUER_CERT_LOCALLY）" },
];

/**
 * 已知不可用、明确不采用的源 —— 留档，避免以后又去试一遍。
 * 这些都是实测过的，不是猜的。
 */
export const REJECTED_SOURCES = [
  { name: "The Information", url: "https://www.theinformation.com/feed", reason: "HTTP 403，付费墙无公开 feed", alt: "无。用 Semafor + Axios 部分覆盖" },
  { name: "Barron's", url: "https://feeds.content.dowjones.io/public/rss/RSSBarronsTopStories", reason: "HTTP 404 / 403，Dow Jones 已下线该 feed", alt: "WSJ Markets + WSJ Business" },
  { name: "Harvard Business Review", url: "https://feeds.hbr.org/harvardbusiness", reason: "ECONNRESET；hbr.org/feed 返回 404", alt: "The Generalist + Stratechery" },
  { name: "a16z", url: "https://a16z.com/feed/", reason: "HTTP 404，/feed /feed/atom /wp-json 全部失效", alt: "Sequoia + Not Boring" },
  { name: "a16z crypto", url: "https://a16zcrypto.com/feed/", reason: "HTTP 404", alt: "Blockworks + Fintech Business Weekly" },
  { name: "甲子光年", url: "https://www.jiazi.tech/rss", reason: "ENOTFOUND，域名不解析", alt: "钛媒体 + 虎嗅" },
  { name: "财新网", url: "https://www.caixin.com/rss/all.xml", reason: "返回 HTML 而非 XML", alt: "华尔街见闻 + FT中文网" },
  { name: "Lawfare", url: "https://www.lawfaremedia.org/feeds/articles.rss", reason: "HTTP 403（Cloudflare）", alt: "Foreign Affairs + Politico" },
  { name: "IEA", url: "https://www.iea.org/rss/news", reason: "HTTP 404，官方 feed 已下线", alt: "Carbon Brief + Utility Dive" },
  { name: "Latitude Media", url: "https://www.latitudemedia.com/news/rss.xml", reason: "HTTP 404", alt: "Canary Media" },
  { name: "AnandTech", url: "https://www.anandtech.com/rss/", reason: "网站已停更，feed 返回 HTML", alt: "Tom's Hardware + EE Times" },
  { name: "Papers with Code", url: "https://paperswithcode.com/latest?format=rss", reason: "返回 HTML，站点已并入 Hugging Face", alt: "arXiv 直连" },
  { name: "alphaXiv", url: "https://www.alphaxiv.org/feed", reason: "无 RSS，返回 HTML", alt: "arXiv 直连" },
  { name: "RSSHub 公共实例", url: "https://rsshub.app/*", reason: "全部路径返回 HTTP 403，公共实例已限流", alt: "不采用。需要的话请自建实例" },
  { name: "第一财经", url: "https://www.yicai.com/api/...", reason: "只有 JSON API，无 RSS", alt: "华尔街见闻 + 东方财富" },
  { name: "Sherwood News", url: "https://sherwood.news/feed/", reason: "HTTP 404", alt: "Axios" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", reason: "feed 可达但已停更（最新条目 79 天前）", alt: "TechCrunch + The Verge" },
];

export const ENABLED_SOURCES = SOURCES.filter((s) => s.enabled !== false);

export const SOURCE_BY_ID: Record<string, Source> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
);

/** 抓取参数 */
export const FETCH_CONFIG = {
  concurrency: 8,
  timeoutMs: 15_000,
  /** 只保留过去多少小时内发布的条目 */
  windowHours: 24,
  /** 标题模糊去重的 Jaccard 阈值 */
  dedupeThreshold: 0.8,
  /** 正文抓取：只对缺少摘要的条目做，且最多抓这么多条（控制耗时） */
  articleExtractLimit: 30,
  /** 正文截断长度 */
  articleMaxChars: 2000,
  userAgent:
    "Mozilla/5.0 (compatible; QuokkooNewsBot/1.0; +https://quokkoo.github.io/news/)",
} as const;
