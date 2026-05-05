Languages: [English](../../README.md) | 日本語

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

```bash
# Harness-Insight 流の `npx skills add` で:
npx skills add jerrywdlee/llm-senate-skill

# あるいは直接:
npx github:jerrywdlee/llm-senate-skill
```

これで以下が配置される:

```
~/.agents/skills/senate/     # SKILL 本体（ユーザーグローバル）
<project>/
  senate.toml                # 自動生成（git 管理 OK、${VAR} プレースホルダのみ）
  .env.example               # コピーして .env を作る（git 管理外）
  .gitignore                 # .senate/ と .env を追記
```

> `senate.toml` と `.env` はインストール時にそれぞれ `assets/senate.toml.example`・`assets/.env.example` から自動コピーされます。
> 既に存在する場合は上書きされません。再生成するには `--force` を付けてください。

## Quick Start

インストール後は **AI Agent のチャット欄でスラッシュコマンドを打つだけ** で
動きます（Agent が `SKILL.md` を読み、内部で `node` スクリプトを呼びます）。

```bash
# 1) シークレットを設定
cp .env.example .env
# .env を編集して各プロバイダの base_url / API キーを書く

# 2) senate.toml を編集
#    - 使う [providers.*] と [[senator]] だけ残す
#    - 使わない provider セクションはコメントアウトすること
#      （存在しない環境変数を ${VAR} で参照するとエラーになる）
```

そして VS Code Chat / Copilot / Codex / Antigravity 等で:

```text
/senate <討論する内容>            # 標準フロー全体（Step 1〜7）を実行
# alias:
/debate <討論する内容>
/llm-senate <討論する内容>
```

`/senate` を単独で実行した場合（かつ `critique|converge|milestone|finalize` の
サブコマンドでない場合）は、Agent は討論を開始せず、まず
「討論する内容を入力してください」と再質問します。

サブコマンドを直接呼ぶことも可能:

```text
/senate critique  --session feat-rate-limiter --input ./spec.md
/senate converge  --session feat-rate-limiter
/senate milestone --session feat-rate-limiter --title "API contract frozen"
/senate finalize  --session feat-rate-limiter
```

> Agent は `/senate critique` を受けると、内部的に
> `node ~/.agents/skills/senate/scripts/senate.js critique ...` を実行します。
> シェルから直接 `node ...` を叩くことも可能ですが、Agent 経由のほうが
> Chair 役（synthesis-prompt.md の解釈と current.md の改訂）を兼ねられるため
> 推奨です。

### Standard Flow

`/senate` を実行すると Agent は次の手順を踏みます:

1. **CRITIQUE** — Senators が並列に critique → `synthesis-prompt.md` 生成
2. **CHAIR SYNTHESIS** — Agent 自身が synthesis-prompt.md を読み、自身の批判 +
   採否判断を行い `current.md` に改訂版を書く
3. **CONVERGE** — Senators が改訂版を収束チェック（Early Agreement Verification 込み）
4. **MILESTONE** — 全員 AGREED なら凍結
5. **LOOP / FINALIZE** — 残論点があれば 1 に戻り、完了したら `output.md` を生成


## Configuration Sketch

> **❗ 使わない provider セクションはコメントアウトしてください。**
> `.env` に定義されていない環境変数を `${VAR}` で参照するとランタイムエラーになります。
> 完全な設定例は [`assets/senate.toml.example`](../../assets/senate.toml.example) を参照。

```toml
[senate]
intensity = "neutral"
preserve_intent = true
max_rounds = 5
early_agreement_round_threshold = 2

[providers.azure]
kind = "azure-direct"
base_url    = "${AZURE_OPENAI_ENDPOINT}"
api_key     = "${AZURE_OPENAI_API_KEY}"
api_version = "${AZURE_OPENAI_API_VERSION}"

[providers.google]
kind = "openai-compat"
base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
api_key  = "${GEMINI_API_KEY}"

# 使わない provider はコメントアウト:
# [providers.local]
# kind = "openai-compat"
# base_url = "${LOCAL_LLM_BASE_URL}"
# api_key  = "${LOCAL_LLM_API_KEY}"

[[senator]]
name = "azure-gpt"
provider = "azure"
model = "gpt-5.2"
role = "architect"       # システム設計・スケーラビリティ视点

[[senator]]
name = "gemini"
provider = "google"
model = "gemini-2.5-pro"
role = "security"        # 脆弱性・UX・プライバシー视点
```

### Senator Role 一覧

`role` は Senator の視点を決めるフィールドで、`assets/prompts/role_<role>.md` が
システムプロンプトに注入されます。省略すると汎用レビュアーとして動作します。

| role | 视点 |
|---|---|
| `architect` | 論理的整合性・スケーラビリティ・エッジケース・契約明確性 |
| `security` | 脆弱性 (OWASP)・プライバシー・UX・信頼境界 |
| `innovator` | 前提疑い・新規角度・極端条件テスト |
| `pm` | ユーザー価値・スコープ・成功指標 |
| `sre` | 運用性・障害影響・ロールバック・可観測性 |

> Note:
> Azure 上に Host された Grok は `kind = "azure-direct"` ではなく
> `kind = "openai-compat"` で設定してください。

## Documentation

- [SKILL.md](../../SKILL.md) — Agent 向けの正式エントリポイント
- [references/architecture.md](../../references/architecture.md)
- [references/prompts.md](../../references/prompts.md)
- [references/memory-and-milestones.md](../../references/memory-and-milestones.md)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE).
