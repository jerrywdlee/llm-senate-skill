// milestones.js
// Stage-wise conclusion management.
// - Freeze a snapshot as milestone_NNN.md
// - Append to conclusion.md
// - Provide "Established Premises" block for next round context

import fs from 'node:fs';
import path from 'node:path';

const PAD = (n) => String(n).padStart(3, '0');

export function listMilestones(sessionDir) {
  if (!fs.existsSync(sessionDir)) return [];
  return fs
    .readdirSync(sessionDir)
    .filter((f) => /^milestone_\d{3}\.md$/.test(f))
    .sort();
}

export function nextMilestoneNumber(sessionDir) {
  const existing = listMilestones(sessionDir);
  return existing.length + 1;
}

export function freezeMilestone(sessionDir, { title, body, round }) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const n = nextMilestoneNumber(sessionDir);
  const file = path.join(sessionDir, `milestone_${PAD(n)}.md`);
  const ts = new Date().toISOString();
  const content = [
    `# Milestone ${n}: ${title}`,
    ``,
    `- Frozen at: ${ts}`,
    `- Round: ${round ?? 'n/a'}`,
    ``,
    body.trim(),
    ``,
  ].join('\n');
  fs.writeFileSync(file, content, 'utf8');
  rebuildConclusion(sessionDir);
  return { number: n, file };
}

export function rebuildConclusion(sessionDir) {
  const milestones = listMilestones(sessionDir);
  const parts = milestones.map((f) => fs.readFileSync(path.join(sessionDir, f), 'utf8').trim());
  const conclusion = parts.join('\n\n---\n\n') + '\n';
  fs.writeFileSync(path.join(sessionDir, 'conclusion.md'), conclusion, 'utf8');
}

export function readConclusion(sessionDir) {
  const p = path.join(sessionDir, 'conclusion.md');
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8').trim();
}

export function establishedPremisesBlock(sessionDir) {
  const c = readConclusion(sessionDir);
  if (!c) return '';
  return [
    '## Established Premises (DO NOT RE-DEBATE)',
    'The following points are FROZEN. Reopening them is allowed ONLY if you cite a',
    'NEW fact that directly contradicts a frozen statement.',
    '',
    c,
    '',
  ].join('\n');
}

export function rollback(sessionDir, n) {
  const milestones = listMilestones(sessionDir);
  for (const f of milestones) {
    const num = parseInt(f.match(/^milestone_(\d{3})\.md$/)[1], 10);
    if (num >= n) {
      fs.renameSync(path.join(sessionDir, f), path.join(sessionDir, f.replace(/\.md$/, '.archived.md')));
    }
  }
  rebuildConclusion(sessionDir);
}
