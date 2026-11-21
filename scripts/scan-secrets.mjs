import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'tmp']);
const IGNORE_FILES = new Set(['package-lock.json', 'scan-secrets.mjs']);

const PATTERNS = [
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Local Windows User Path', regex: /[A-Za-z]:[/\\]{1,2}Users[/\\]{1,2}/g },
  { name: 'Git Co-Authored-By', regex: /Co-Authored-By:/gi },
  { name: 'AI Tool Attribution', regex: /\b(Claude|Anthropic|OpenAI|Codex|Antigravity)\b/g },
  { name: 'LvSyn Private Backend URL', regex: /lvsyn-(worker|agent|api)\.[a-z0-9.-]+/gi },
  { name: 'Personal Gmail Address', regex: /[a-z0-9._%+-]+@gmail\.com/gi },
];

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (entry.isFile() && !IGNORE_FILES.has(entry.name)) {
      if (/\.(png|jpg|jpeg|webp|mp4|webm|ico|woff2?)$/i.test(entry.name)) continue;
      results.push(full);
    }
  }
  return results;
}

const findings = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  for (const p of PATTERNS) {
    const matches = content.match(p.regex);
    if (matches) {
      findings.push({ scope: 'working_tree', file: rel, rule: p.name, sample: matches[0] });
    }
  }
}

try {
  const gitMeta = execSync('git log --all --format="%an <%ae>%n%B"', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const gitDiff = execSync(
    'git log --all -p -- . ":(exclude)scripts/scan-secrets.mjs" ":(exclude)package-lock.json"',
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
  const gitAll = `${gitMeta}\n${gitDiff}`;
  for (const p of PATTERNS) {
    const matches = gitAll.match(p.regex);
    if (matches) {
      findings.push({ scope: 'git_history', file: 'git log --all', rule: p.name, sample: matches[0] });
    }
  }
} catch {
  // No commits yet
}

if (findings.length > 0) {
  console.error('SECRET / HYGIENE SCAN FAILED:');
  for (const f of findings) {
    console.error(` - [${f.scope}] ${f.file} :: ${f.rule} (${f.sample})`);
  }
  process.exit(1);
}

console.log('SECRET / HYGIENE SCAN PASSED: 0 findings across working tree and full git history.');
