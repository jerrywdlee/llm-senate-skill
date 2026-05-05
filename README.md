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

インストール後は **AI Agent のチャット欄でスラッシュコマンドを打つだけ** で
動きます（Agent が `SKILL.md` を読み、内部で `node` スクリプトを呼びます）。

```text
# 1) シークレットを設定
Copy-Item .env.example .env       # PowerShell
# .env を編集して各プロバイダの base_url / API キーを書く

# 2) senate.toml で senators を定義（[providers.*] と [[senator]]）
```

そして VS Code Chat / Copilot / Codex / Antigravity 等で:

```text
/llm-senate <討論する内容>        # 標準フロー全体（Step 1〜7）を実行
# alias:
/senate <討論する内容>
/debate <討論する内容>
```

`/llm-senate` を単独で実行した場合（かつ `critique|converge|milestone|finalize` の
サブコマンドでない場合）は、Agent は討論を開始せず、まず
「討論する内容を入力してください」と再質問します。

サブコマンドを直接呼ぶことも可能:

```text
/llm-senate critique  --session feat-rate-limiter --input ./spec.md
/llm-senate converge  --session feat-rate-limiter
/llm-senate milestone --session feat-rate-limiter --title "API contract frozen"
/llm-senate finalize  --session feat-rate-limiter
```

> Agent は `/llm-senate critique` を受けると、内部的に
> `node .skills/llm-senate/scripts/senate.js critique ...` を実行します。
> シェルから直接 `node ...` を叩くことも可能ですが、Agent 経由のほうが
> Chair 役（synthesis-prompt.md の解釈と current.md の改訂）を兼ねられるため
> 推奨です。

### Standard Flow

`/llm-senate` を実行すると Agent は次の手順を踏みます:

1. **CRITIQUE** — Senators が並列に critique → `synthesis-prompt.md` 生成
2. **CHAIR SYNTHESIS** — Agent 自身が synthesis-prompt.md を読み、自身の批判 +
   採否判断を行い `current.md` に改訂版を書く
3. **CONVERGE** — Senators が改訂版を収束チェック（Early Agreement Verification 込み）
4. **MILESTONE** — 全員 AGREED なら凍結
5. **LOOP / FINALIZE** — 残論点があれば 1 に戻り、完了したら `output.md` を生成


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

> Note:
> Azure 上に Host された Grok は `kind = "azure-direct"` ではなく
> `kind = "openai-compat"` で設定してください。

## Documentation

- [SKILL.md](SKILL.md) — Agent 向けの正式エントリポイント
- [references/architecture.md](references/architecture.md)
- [references/prompts.md](references/prompts.md)
- [references/memory-and-milestones.md](references/memory-and-milestones.md)

## License

Apache License 2.0 — see [LICENSE](LICENSE).
