// config-loader.js
// Load TOML with ${ENV_VAR} placeholder substitution (envsubst-style).
// Reads .env from the project root, expands placeholders, then parses TOML.
// Schema (post-refactor): named [providers.<name>] presets + [[senator]] list.

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

export function expandEnv(input) {
  return input.replace(PLACEHOLDER_RE, (match, key) => {
    if (!(key in process.env) || process.env[key] === '') {
      throw new Error(
        `Config references \${${key}} but it is unset/empty in environment (.env). ` +
          `Either set it, or remove the senator/provider that requires it.`,
      );
    }
    return process.env[key];
  });
}

export function loadConfig(tomlPath, envPath) {
  loadEnv(envPath);
  if (!fs.existsSync(tomlPath)) {
    throw new Error(`Config file not found: ${tomlPath}`);
  }
  const raw = fs.readFileSync(tomlPath, 'utf8');

  // Only expand placeholders for providers actually referenced by senators.
  // Strategy: parse twice — first parse raw TOML to find which provider keys
  // are referenced, then expand only those sections. Simpler: expand the whole
  // file but make expansion lazy via a try/catch that lists missing vars.
  // Implementation: expand globally; missing vars throw with a clear message.
  const expanded = expandEnv(raw);
  const cfg = TOML.parse(expanded);
  validate(cfg);
  return cfg;
}

function validate(cfg) {
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
