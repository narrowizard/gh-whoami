# gh-whoami

[English](README.md) | 简体中文

从公开数据（profile、仓库、star、merged PR）生成一份有证据支撑的 GitHub 个人主页 README。

## 快速开始

需要 Node.js ≥ 20 和一个 LLM API key。无需 OAuth——GitHub 公开数据未认证即可拉取。

```bash
export ANTHROPIC_API_KEY=…        # 或 OPENAI_API_KEY / LLM_*，见下方配置
npx gh-whoami <你的用户名>
```

审阅 `output/<user>-README.md` 草稿，然后把它发布为你的 profile README：

1. 创建一个**公开**仓库，名字与你的用户名完全相同（`<user>/<user>`）——GitHub 会弹出 "You've found a secret!" 的彩蛋提示。
2. 在仓库根目录添加 `README.md`，把草稿内容粘贴进去。
3. 提交后，你的 GitHub 个人主页就会展示它。

完整规则与边界情况（2020 年 7 月前的老仓库、可见性变化）见官方文档 [Managing your profile README](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/managing-your-profile-readme)。

`GITHUB_TOKEN` 可选但建议配置（GitHub 限额从 60 提升到 5000 req/h）。

## 工作原理

核心设计：**digest 的分层 = LLM 的措辞权限**。原始 API 数据先被压缩成确定性的分层 digest，LLM 只看得到它——模型只能陈述证据允许的内容，编造不了贡献。

```
GitHub API ──► collect ──► digest (确定性统计) ──► LLM (单次, 规则约束) ──► README 草稿
               顺序调用     分层证据 + coverage       防幻觉规则            人工审查后发布
```

1. **收集** — 6 个公开数据源，无需任何 OAuth 授权：用户资料、仓库列表、star 列表（带时间戳）、search API 查询 merged PR、公开 events（可选，常为空）、现有 profile README。
2. **Digest** — 一切归约为计算出来的事实：语言分布、主题指纹（近期加权）、star 时间线、品味画像、分级贡献证据；空缺的数据源在 coverage 中显式声明，而不是留给模型猜。
3. **生成** — 单次 LLM 调用把 digest 写成 README，规则把证据层级映射为措辞权限。
4. **审查** — 工具打印证据摘要，且永不自动 push。你自己审阅、自己发布。

## 证据分级

| 层级 | 数据 | 允许的措辞 |
|---|---|---|
| **T1** | 上游仓库 merged PR（search API 实证；仅保留 ≥1k★ 仓库，其余降级为 coverage 注记） | `contributor (n merged PRs)` |
| **T2** | 自己的活跃原创仓库 | 能力描述，不涉及"贡献"字样 |
| **T3** | fork | 仅"参与生态 / 关注"，禁止 contributor |

其他生成规则（见 `src/prompt.ts`）：推测最多 2 处且必须带 🔮 图标；语言与主题只能来自 digest 条目；coverage 标记为空的维度禁止推测；原 README 仅作内容与风格参考，不是必须复刻的模板。

## 用法

```bash
npx gh-whoami <username> [--out output] [--max-stars 2000] [--no-llm] [--verbose] [--dotenv <path>]
```

`GITHUB_TOKEN` 可选（未认证 60 req/h，认证后 5000 req/h），但建议配置——footprint 过滤需要额外查一些仓库的 star 数。LLM 凭据从环境变量或 `.env` 文件解析（见下方配置）。

### 从源码运行

```bash
git clone https://github.com/narrowizard/gh-whoami && cd gh-whoami
npm install && npm run build
node dist/cli.js <username>
```

## 配置

LLM 端点从环境变量解析（或 env 文件——复制 `.env.example`；真实环境变量优先）。默认加载工作目录下的 `.env`；传入 `--dotenv <path>` 可指定其他文件（文件不存在会报错）。支持三种风格，`LLM_*` 优先级最高：

```bash
# Anthropic 协议（含各类本地网关）
ANTHROPIC_BASE_URL=…
ANTHROPIC_AUTH_TOKEN=…   # 或 ANTHROPIC_API_KEY，二选一
ANTHROPIC_MODEL=…

# OpenAI 协议（DeepSeek、GLM、OpenRouter 等）
OPENAI_BASE_URL=…
OPENAI_API_KEY=…
OPENAI_MODEL=…

# 通用变量（显式指定 provider）
LLM_PROVIDER=openai|anthropic
LLM_BASE_URL=…
LLM_API_KEY=…
LLM_MODEL=…
```

`--no-llm` 只产出 digest JSON，不调用任何 LLM。采集阶段会按数据源打印进度；`--verbose` 会额外打印每个 GitHub API 请求及剩余限流额度。

## 输出

- `<user>-digest.json` — 完整分层 digest：可检查、可复用、可缓存
- `<user>-README.md` — 生成的草稿，末尾带确定性的 gh-whoami 归属页脚

## 局限

- star 是收藏不是使用——设计上就是弱信号；只挖掘仓库 `topics` 标签，不碰描述里的营销话术
- 公开 events 经常为空（活跃在私有仓库或其他平台）；digest 在 coverage 里声明这一点而不是瞎猜
- 未认证时 search API 限 10 次/分钟——单个用户 1-2 次调用，够用
- 思考型模型可能在写正文前烧光 token 预算；报错会携带 `stop_reason`，需要时调大 `max_tokens`
