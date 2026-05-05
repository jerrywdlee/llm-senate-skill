#!/usr/bin/env node
// bin/install.js — installer for the llm-senate skill.
//
// This script is invoked in two ways:
//   1. `npx llm-senate` (or `npx github:jerrywdlee/llm-senate-skill`)
//      → runs from the npm cache; copies skill into <project>/.agents/skills/senate/
//   2. `npx skills add jerrywdlee/llm-senate-skill`
//      → the external `skills` CLI clones the repo and invokes this file
//
// Behavior:
//   - Resolves PACKAGE_DIR (where the skill source lives) via __dirname/..
//   - Resolves PROJECT_DIR (where to install config files) from --dest,
//     env SKILL_INSTALL_DIR, or process.cwd().
//   - Copies SKILL files into <PROJECT_DIR>/.agents/skills/senate/  (skips bin/, .git, node_modules, .tmp, .senate)
//   - Drops senate.toml.example -> <PROJECT_DIR>/senate.toml (if missing)
//   - Drops .env.example -> <PROJECT_DIR>/.env (if missing)
//   - Ensures <PROJECT_DIR>/.gitignore contains `.env` and `.senate/`
//   - Prints next-step instructions
//
// Re-run safe (idempotent). Pass --force to overwrite existing files.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, '..');

const args = parseArgs(process.argv.slice(2));
const force = args.has('force');
const verbose = args.has('verbose');

const projectDir = path.resolve(
  args.get('dest') || process.env.SKILL_INSTALL_DIR || process.cwd()
);
const SKILL_NAME = 'senate';
const installDir = path.join(projectDir, '.agents', 'skills', SKILL_NAME);

const SKIP = new Set(['node_modules', '.git', '.tmp', '.senate', 'bin']);
const COPY_TOP = ['SKILL.md', 'skill.json', 'README.md', 'LICENSE', 'scripts', 'references', 'assets'];

function parseArgs(argv) {
  const map = new Map();
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) flags.add(key);
    else { map.set(key, next); i++; }
  }
  // Helper: .has() / .get() unified
  return {
    has: (k) => flags.has(k) || map.has(k),
    get: (k) => map.get(k),
  };
}

function log(msg) { console.log(msg); }
function vlog(msg) { if (verbose) console.log(msg); }

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (SKIP.has(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    if (fs.existsSync(dst) && !force) { vlog(`[keep] ${dst}`); return; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    vlog(`[wrote] ${dst}`);
  }
}

function copySkillFiles() {
  log(`Installing skill files → ${installDir}`);
  fs.mkdirSync(installDir, { recursive: true });
  for (const top of COPY_TOP) {
    const src = path.join(PACKAGE_DIR, top);
    if (!fs.existsSync(src)) continue;
    copyRecursive(src, path.join(installDir, top));
  }
}

function installDepsIfMissing() {
  // The skill needs node_modules to run. We ship dependencies via npm install on the
  // installed copy. A package.json is included so consumers can `npm install` inside
  // the skill folder if they want, but to make zero-config installs work we do it here.
  const skillPkg = path.join(installDir, 'package.json');
  // Write a minimal runtime package.json into the installed copy.
  if (!fs.existsSync(skillPkg) || force) {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'));
    const runtime = {
      name: pkg.name,
      version: pkg.version,
      private: true,
      type: 'module',
      dependencies: pkg.dependencies,
    };
    fs.writeFileSync(skillPkg, JSON.stringify(runtime, null, 2) + '\n');
    vlog(`[wrote] ${skillPkg}`);
  }

  if (fs.existsSync(path.join(installDir, 'node_modules')) && !force) {
    log('[keep] dependencies already installed inside skill');
    return;
  }
  log(`Installing skill dependencies (npm install)…`);
  // On Windows, npm is a .cmd shim; spawning it without a shell can fail under
  // restricted PowerShell execution policies. Use shell:true for portability.
  const isWindows = process.platform === 'win32';
  const r = spawnSync(
    isWindows ? 'npm.cmd' : 'npm',
    ['install', '--silent', '--no-audit', '--no-fund'],
    { cwd: installDir, stdio: 'inherit', shell: isWindows },
  );
  if (r.status !== 0) {
    log(`[warn] npm install failed inside ${installDir}. You can retry manually.`);
  }
}

function copyTemplate(srcRel, dstRel, label) {
  const src = path.join(PACKAGE_DIR, srcRel);
  const dst = path.join(projectDir, dstRel);
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dst) && !force) { log(`[keep] ${label}: ${dst}`); return; }
  fs.copyFileSync(src, dst);
  log(`[wrote] ${label}: ${dst}`);
}

function ensureGitignore(line) {
  const giPath = path.join(projectDir, '.gitignore');
  let body = '';
  if (fs.existsSync(giPath)) body = fs.readFileSync(giPath, 'utf8');
  if (body.split(/\r?\n/).some((l) => l.trim() === line)) return;
  const append = (body && !body.endsWith('\n') ? '\n' : '') + line + '\n';
  fs.appendFileSync(giPath, append);
  log(`[gitignore] +${line}`);
}

async function main() {
  log('llm-senate · skill installer');
  log(`  package: ${PACKAGE_DIR}`);
  log(`  target : ${projectDir}`);
  log('');

  copySkillFiles();
  // Bring in node_modules so `node .agents/skills/senate/scripts/senate.js` works without a second step.
  installDepsIfMissing();

  copyTemplate('assets/senate.toml.example', 'senate.toml', 'senate.toml');
  copyTemplate('assets/.env.example', '.env', '.env');

  const dataDir = path.join(projectDir, '.senate');
  if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir, { recursive: true }); log(`[wrote] .senate/`); }

  ensureGitignore('.env');
  ensureGitignore('.senate/');

  log('');
  log('Done. Next steps:');
  log('  1. Edit senate.toml and .env at the project root.');
  log(`  2. Open this project in VS Code; Copilot will discover SKILL.md under .agents/skills/senate/.`);
  log('  3. Type /senate in your AI agent chat to start a debate.');
}

// Top-level await would require extra setup; keep promise chain.
main().catch((err) => { console.error('install failed:', err); process.exit(1); });
