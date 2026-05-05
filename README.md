Languages: English | [日本語](./docs/i18n/README.ja.md)

# llm-senate-skill

An installable Agent SKILL that runs multiple heterogeneous LLMs as
**Senators** in parallel debate, while the Agent executing the SKILL
(GitHub Copilot / OpenAI Codex / Antigravity, etc.) itself serves as the
**Chair** — actively critiquing, synthesizing, and counter-arguing to build
consensus incrementally.

The design combines ideas from
[karpathy/llm-council](https://github.com/karpathy/llm-council)
(Chair synthesis & anonymous peer review) and
[zscole/adversarial-spec](https://github.com/zscole/adversarial-spec)
(Active Chair, Early Agreement Verification, Intent Preservation) into a
hybrid architecture.

## Highlights

- **The Chair is the Agent itself**, not an external LLM
  (reuses the native LLM of Copilot / Codex / Antigravity)
- **Heterogeneous providers in parallel**: Azure GPT, Google Gemini, xAI Grok,
  OpenRouter, local Ollama / vLLM — all in a single round
- **Adversarial intensity** mode enforces Intent Preservation
- **Early Agreement Verification** prevents shallow consensus in early rounds
- **Milestone** freezes each resolved topic — no re-debating
- **Per-senator scratchpad** memory maintains consistent lines of attack across rounds

## Install

```bash
# Via the Harness-Insight `npx skills add`:
npx skills add jerrywdlee/llm-senate-skill

# Or directly:
npx github:jerrywdlee/llm-senate-skill
```

This creates the following layout:

```
~/.agents/skills/senate/     # SKILL source (user-global)
<project>/
  senate.toml                # Auto-generated (git-safe — uses ${VAR} placeholders only)
  .env.example               # Copy to .env (git-ignored)
  .gitignore                 # .senate/ and .env appended
```

> `senate.toml` and `.env` are auto-copied from `assets/senate.toml.example` and
> `assets/.env.example` respectively during install.
> Existing files are never overwritten. Pass `--force` to regenerate.

## Quick Start

After installation, just type a slash command in your **AI Agent's chat** and it
works (the Agent reads `SKILL.md` and invokes `node` scripts internally).

```bash
# 1) Set up secrets
cp .env.example .env
# Edit .env and fill in base_url / API keys for each provider

# 2) Edit senate.toml
#    - Keep only the [providers.*] and [[senator]] entries you use
#    - Comment out unused provider sections
#      (referencing undefined env vars via ${VAR} causes a runtime error)
```

Then in VS Code Chat / Copilot / Codex / Antigravity:

```text
/senate <topic to debate>         # Runs the full flow (Steps 1–7)
# aliases:
/debate <topic to debate>
/llm-senate <topic to debate>
```

If `/senate` is invoked without content (and without a subcommand like
`critique|converge|milestone|finalize`), the Agent will ask you to provide a
topic before starting.

You can also call subcommands directly:

```text
/senate critique  --session feat-rate-limiter --input ./spec.md
/senate converge  --session feat-rate-limiter
/senate milestone --session feat-rate-limiter --title "API contract frozen"
/senate finalize  --session feat-rate-limiter
```

> When the Agent receives `/senate critique`, it internally runs
> `node ~/.agents/skills/senate/scripts/senate.js critique ...`.
> You can also run `node ...` directly from the shell, but using the Agent is
> recommended because it also serves as the Chair (interpreting
> synthesis-prompt.md and revising current.md).

### Standard Flow

Running `/senate` triggers the following steps:

1. **CRITIQUE** — Senators critique in parallel → `synthesis-prompt.md` generated
2. **CHAIR SYNTHESIS** — The Agent reads synthesis-prompt.md, adds its own
   critique + adjudication, and writes the revised proposal to `current.md`
3. **CONVERGE** — Senators check the revision for convergence (with Early Agreement Verification)
4. **MILESTONE** — If all AGREED, freeze the topic
5. **LOOP / FINALIZE** — If topics remain, go back to 1; otherwise generate `output.md`


## Configuration Sketch

> **❗ Comment out any provider sections you don't use.**
> Referencing undefined environment variables via `${VAR}` causes a runtime error.
> See [`assets/senate.toml.example`](assets/senate.toml.example) for the full template.

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

# Comment out unused providers:
# [providers.local]
# kind = "openai-compat"
# base_url = "${LOCAL_LLM_BASE_URL}"
# api_key  = "${LOCAL_LLM_API_KEY}"

[[senator]]
name = "azure-gpt"
provider = "azure"
model = "gpt-5.2"
role = "architect"       # System design & scalability perspective

[[senator]]
name = "gemini"
provider = "google"
model = "gemini-2.5-pro"
role = "security"        # Vulnerability, UX & privacy perspective
```

### Senator Roles

The `role` field determines a Senator's perspective. The corresponding
`assets/prompts/role_<role>.md` is injected as a system prompt.
If omitted, the Senator acts as a general-purpose reviewer.

| role | Perspective |
|---|---|
| `architect` | Logical consistency, scalability, edge cases, contract clarity |
| `security` | Vulnerabilities (OWASP), privacy, UX, trust boundaries |
| `innovator` | Challenge assumptions, novel angles, extreme-condition testing |
| `pm` | User value, scope, success metrics |
| `sre` | Operability, failure impact, rollback, observability |

> Note:
> For Grok hosted on Azure, use `kind = "openai-compat"` instead of
> `kind = "azure-direct"`.

## Documentation

- [SKILL.md](SKILL.md) — Formal entry point for the Agent
- [references/architecture.md](references/architecture.md)
- [references/prompts.md](references/prompts.md)
- [references/memory-and-milestones.md](references/memory-and-milestones.md)

## License

Apache License 2.0 — see [LICENSE](LICENSE).
