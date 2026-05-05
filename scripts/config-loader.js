// config-loader.js
// Load TOML, then lazily resolve ${ENV_VAR} placeholders ONLY in the parts
// of the config that are actually used (referenced providers + [senate] /
// [storage] / [intensity_overrides]). This makes commented-out provider
// blocks containing ${...} placeholders harmless.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import TOML from '@iarna/toml';

const PLACEHOLDER_RE = /\$\{([A-Z0-9_]+)\}/g;

export function loadEnv(envPath) {
  if (envPath && fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    return;
  }
  const fallback = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(fallback)) dotenv.config({ path: fallback });
}

// Substitute ${VAR} in a string. Throws on missing/empty for the referenced
// var, with a contextual hint about *where* the placeholder lives.
function substitute(str, contextHint) {
  return str.replace(PLACEHOLDER_RE, (_match, key) => {
    const v = process.env[key];
    if (v === undefined || v === '') {
      throw new Error(
        `${contextHint} references \${${key}} but it is unset/empty in environment (.env). ` +
          `Either set it, or remove the senator/provider that requires it.`,
      );
    }
    return v;
  });
}

// Walk an object and substitute ${VAR} in any string leaf in-place.
function substituteDeep(obj, contextHint) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === 'string') obj[i] = substitute(v, `${contextHint}[${i}]`);
      else if (v && typeof v === 'object') substituteDeep(v, `${contextHint}[${i}]`);
    }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') obj[k] = substitute(v, `${contextHint}.${k}`);
    else if (v && typeof v === 'object') substituteDeep(v, `${contextHint}.${k}`);
  }
}

export function loadConfig(tomlPath, envPath) {
  loadEnv(envPath);
  if (!fs.existsSync(tomlPath)) {
    throw new Error(`Config file not found: ${tomlPath}`);
  }
  const raw = fs.readFileSync(tomlPath, 'utf8');
  // Parse first — TOML.parse strips comments, so any ${VAR} inside `#` lines
  // never reach us. Placeholders remain as literal strings inside string
  // values until we resolve them below.
  const cfg = TOML.parse(raw);

  validateStructure(cfg);

  // Resolve ${VAR} only in sections we will actually use.
  if (cfg.senate)               substituteDeep(cfg.senate,               '[senate]');
  if (cfg.storage)              substituteDeep(cfg.storage,              '[storage]');
  if (cfg.intensity_overrides)  substituteDeep(cfg.intensity_overrides,  '[intensity_overrides]');

  // Only resolve placeholders for providers referenced by at least one senator.
  const referenced = new Set(cfg.senator.map((s) => s.provider));
  for (const name of referenced) {
    const p = cfg.providers[name];
    if (!p || typeof p !== 'object' || Object.keys(p).length === 0) {
      throw new Error(
        `config: senator references provider "${name}" but [providers.${name}] is empty or undefined. ` +
          `Uncomment / fill in its keys (kind, base_url, api_key) in senate.toml.`,
      );
    }
    if (!p.kind) {
      throw new Error(
        `config: [providers.${name}] is missing required key "kind" (e.g. "azure-direct" | "openai-compat" | "openrouter" | "litellm").`,
      );
    }
    substituteDeep(p, `[providers.${name}]`);
  }

  return cfg;
}

function validateStructure(cfg) {
  if (!cfg.senate) throw new Error('config: missing [senate]');
  const intensity = cfg.senate.intensity;
  if (!['cooperative', 'neutral', 'adversarial'].includes(intensity)) {
    throw new Error(`config: senate.intensity must be cooperative|neutral|adversarial (got: ${intensity})`);
  }
  if (!cfg.providers || typeof cfg.providers !== 'object') {
    throw new Error('config: missing [providers.*] section');
  }
  if (!Array.isArray(cfg.senator) || cfg.senator.length === 0) {
    throw new Error('config: at least one [[senator]] entry required');
  }
  for (const s of cfg.senator) {
    if (!s.name) throw new Error('config: [[senator]] missing name');
    if (!s.model) throw new Error(`config: senator "${s.name}" missing model`);
    if (!s.provider) throw new Error(`config: senator "${s.name}" missing provider`);
    if (!cfg.providers[s.provider]) {
      throw new Error(
        `config: senator "${s.name}" references provider "${s.provider}" which is not defined in [providers.*]`,
      );
    }
  }
}

// Resolve { providerCfg, senatorCfg } pairs ready for the LLM client.
export function resolveSenators(cfg) {
  return cfg.senator.map((s) => ({
    senator: s,
    provider: cfg.providers[s.provider],
  }));
}

// Re-exported for tests/diagnostics.
export { substitute as expandEnv };
