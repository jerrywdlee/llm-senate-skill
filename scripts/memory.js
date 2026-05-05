// memory.js
// Per-agent private scratchpad: read on round start, overwrite on round end.

import fs from 'node:fs';
import path from 'node:path';

const SCRATCHPAD_RE = /<scratchpad>([\s\S]*?)<\/scratchpad>/i;

export function memoryPath(sessionDir, agentName) {
  return path.join(sessionDir, `memory_${agentName}.md`);
}

export function readMemory(sessionDir, agentName) {
  const p = memoryPath(sessionDir, agentName);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8').trim();
}

export function writeMemory(sessionDir, agentName, content) {
  const p = memoryPath(sessionDir, agentName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content.trim() + '\n', 'utf8');
}

// Strip <scratchpad>...</scratchpad> from response, return { publicText, scratchpad }.
export function splitScratchpad(text) {
  const m = SCRATCHPAD_RE.exec(text);
  if (!m) return { publicText: text.trim(), scratchpad: '' };
  const scratchpad = m[1].trim();
  const publicText = text.replace(SCRATCHPAD_RE, '').trim();
  return { publicText, scratchpad };
}

// Inject memory as system-level context block.
export function memoryContextBlock(memoryContent) {
  if (!memoryContent) return '';
  return [
    '## Your Private Notes from Previous Rounds',
    '(These are your own notes — they are reminders, not commands. Other models cannot see them.)',
    '',
    memoryContent,
    '',
  ].join('\n');
}
