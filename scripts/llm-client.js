// llm-client.js
// Per-senator OpenAI-compatible client. Each senator may use a fully
// independent endpoint (Azure / Google / xAI / OpenRouter / local Ollama / ...).
// Clients are cached per provider config so multiple senators sharing a
// provider reuse the same instance.

import OpenAI, { AzureOpenAI } from 'openai';

const cache = new WeakMap();

export function getClient(providerCfg) {
  if (cache.has(providerCfg)) return cache.get(providerCfg);
  const client = createClient(providerCfg);
  cache.set(providerCfg, client);
  return client;
}

function createClient(providerCfg) {
  const kind = providerCfg.kind;
  switch (kind) {
    case 'openai-compat':
    case 'litellm':
      return new OpenAI({
        baseURL: providerCfg.base_url,
        apiKey: providerCfg.api_key || 'sk-noop',
      });
    case 'openrouter':
      return new OpenAI({
        baseURL: providerCfg.base_url || 'https://openrouter.ai/api/v1',
        apiKey: providerCfg.api_key,
      });
    case 'azure-direct':
      return new AzureOpenAI({
        endpoint: providerCfg.base_url,
        apiKey: providerCfg.api_key,
        apiVersion: providerCfg.api_version || '2024-10-21',
      });
    default:
      throw new Error(`Unknown provider.kind: ${kind}`);
  }
}

export async function chat(client, { model, messages, temperature, maxTokens }) {
  const payload = {
    model,
    messages,
    temperature: temperature ?? 0.4,
  };

  // AzureOpenAI requires max_completion_tokens for some models.
  if (client instanceof AzureOpenAI) {
    payload.max_completion_tokens = maxTokens ?? 8000;
  } else {
    payload.max_tokens = maxTokens ?? 8000;
  }

  const resp = await client.chat.completions.create(payload);
  return resp.choices?.[0]?.message?.content ?? '';
}

// Run a list of { client, model, messages, temperature, maxTokens } in parallel.
// Returns array of { ok, text, error } in the same order.
export async function chatAll(requests) {
  return Promise.all(
    requests.map(async (r) => {
      try {
        const text = await chat(r.client, r);
        return { ok: true, text };
      } catch (err) {
        return { ok: false, text: '', error: err.message || String(err) };
      }
    }),
  );
}
