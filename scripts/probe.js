#!/usr/bin/env node
// probe.js
// Quick connectivity check for all senators defined in senate.toml.

import { loadConfig, resolveSenators } from './config-loader.js';
import { getClient, chatAll } from './llm-client.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function truncate(s, n = 120) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || 'senate.toml';
  const envPath = args.env;
  const modelOverride = args.model;
  const timeoutMs = Number(args.timeout || 20000);
  const dryRun = !!args['dry-run'];

  const cfg = loadConfig(configPath, envPath);
  const pairs = resolveSenators(cfg);

  if (pairs.length === 0) {
    console.error('No senators found in config.');
    process.exit(2);
  }

  console.log(`\n=== llm-senate probe ===`);
  console.log(`config: ${configPath}`);
  console.log(`senators: ${pairs.length}`);
  console.log(`timeout: ${timeoutMs}ms`);
  if (dryRun) {
    console.log('mode: dry-run (no network calls)\n');
    for (const { senator, provider } of pairs) {
      console.log(`- ${senator.name}`);
      console.log(`  provider=${senator.provider} kind=${provider.kind}`);
      console.log(`  model=${modelOverride || senator.model}`);
    }
    return;
  }

  const probeMessages = [
    { role: 'system', content: 'You are a probe endpoint. Reply with exactly: PONG' },
    { role: 'user', content: 'PING' },
  ];

  const requests = pairs.map(({ senator, provider }) => ({
    client: getClient(provider),
    model: modelOverride || senator.model,
    temperature: 0,
    maxTokens: 16,
    messages: probeMessages,
  }));

  const wrapTimeout = (p) =>
    Promise.race([
      p,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);

  const wrapped = requests.map((r) =>
    wrapTimeout(chatAll([r])).then((arr) => arr[0]).catch((err) => ({ ok: false, text: '', error: err.message })),
  );

  const results = await Promise.all(wrapped);

  let failed = 0;
  console.log('');
  for (let i = 0; i < results.length; i++) {
    const { senator, provider } = pairs[i];
    const r = results[i];
    const model = modelOverride || senator.model;
    if (r.ok) {
      const sample = truncate((r.text || '').replace(/\s+/g, ' ').trim(), 80);
      console.log(`[OK]   ${senator.name}  provider=${senator.provider} kind=${provider.kind} model=${model}`);
      console.log(`       sample="${sample}"`);
    } else {
      failed++;
      console.log(`[FAIL] ${senator.name}  provider=${senator.provider} kind=${provider.kind} model=${model}`);
      console.log(`       reason="${truncate(r.error || 'unknown error', 220)}"`);
    }
  }

  console.log(`\nsummary: total=${results.length}, ok=${results.length - failed}, fail=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('ERROR:', err.message || String(err));
  process.exit(1);
});
