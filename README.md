# llm-senate-skill

異質な複数 LLM を **Senator** として並列討論させ、SKILL を実行する Agent
（GitHub Copilot / OpenAI Codex / Antigravity 等）自身が **Chair（司会）** として
能動的に批判・統合・反論しながら段階的に合意形成する、インストール可能な Agent
SKILL です。

設計思想は [karpathy/llm-council](https://github.com/karpathy/llm-council)
（Chair 統合・匿名相互レビュー）と
[zscole/adversarial-spec](https://github.com/zscole/adversarial-spec)
（Active Chair・Early Agreement Verification・Intent Preservation）を組み合わせた
ハイブリッド構成です。

## Highlights

- **Chair は外部 LLM ではなく、SKILL を呼び出している Agent 自身** が務める
  （Copilot / Codex / Antigravity の固有 LLM をそのまま流用）
- **異種プロバイダ並列**: Azure GPT・Google Gemini・xAI Grok・OpenRouter 経由・
  ローカル Ollama / vLLM などを同一 round で混在させられる
- **Adversarial intensity** モードで Intent Preservation を強制
- **Early Agreement Verification** で序盤の安易な合意を防止
- **Milestone** で論点ごとに段階凍結 → 再蒸し返し禁止
- **Per-senator scratchpad** メモリで多ラウンドの一貫した攻め筋を保持

## Install

```pwsh
# Harness-Insight 流の `npx skills add` で:
npx skills add jerrywdlee/llm-senate-skill

# あるいは直接:
npx github:jerrywdlee/llm-senate-skill
```

これで以下が配置される:

```
<project>/
  .skills/llm-senate/        # SKILL 本体
  senate.toml                # git 管理 OK（${VAR} プレースホルダのみ）
  .env.example               # コピーして .env を作る（git 管理外）
  .gitignore                 # data/ と .env を追記
```

## Quick Start

```pwsh
# 1) シークレット設定
Copy-Item .env.example .env
# .env を編集して各プロバイダの base_url / API キーを書く

# 2) senate.toml で senators を定義
#    [providers.*] と [[senator]] を編集

# 3) Phase 1: 並列 critique → 司会用 synthesis-prompt.md 生成
node .skills/llm-senate/scripts/senate.js critique `
  --session feat-rate-limiter `
  --input .\spec.md

# 4) Chair（＝この Agent 自身）が
#      data/feat-rate-limiter/synthesis-prompt.md を読み、
#      data/feat-rate-limiter/current.md に改訂版を書く

# 5) Phase 2: 改訂版の収束チェック（早期合意は追撃検証）
node .skills/llm-senate/scripts/senate.js converge --session feat-rate-limiter

# 6) 全員 AGREED → milestone 凍結
node .skills/llm-senate/scripts/senate.js milestone `
  --session feat-rate-limiter `
  --title "Rate limiter API contract frozen"

# 7) 仕上げ
node .skills/llm-senate/scripts/senate.js finalize --session feat-rate-limiter
```

## Configuration Sketch

```toml
[senate]
intensity = "neutral"
preserve_intent = true
max_rounds = 5
early_agreement_round_threshold = 2

[providers.azure]
kind = "azure-direct"
base_url = "${AZURE_OPENAI_ENDPOINT}"
api_key  = "${AZURE_OPENAI_API_KEY}"

[providers.google]
kind = "openai-compat"
base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
api_key  = "${GEMINI_API_KEY}"

[providers.local]
kind = "openai-compat"
base_url = "${LOCAL_LLM_BASE_URL}"   # e.g. http://localhost:11434/v1
api_key  = "${LOCAL_LLM_API_KEY}"

[[senator]]
name = "azure-gpt"
provider = "azure"
model = "gpt-5.2"
role = "architect"

[[senator]]
name = "gemini"
provider = "google"
model = "gemini-2.5-pro"
role = "security"

[[senator]]
name = "local-gemma"
provider = "local"
model = "gemma3:12b"
role = "sre"
```

## Documentation

- [SKILL.md](SKILL.md) — Agent 向けの正式エントリポイント
- [references/architecture.md](references/architecture.md)
- [references/prompts.md](references/prompts.md)
- [references/memory-and-milestones.md](references/memory-and-milestones.md)

## License

Apache License 2.0 — see [LICENSE](LICENSE).
