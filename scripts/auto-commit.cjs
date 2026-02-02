#!/usr/bin/env node
/**
 * Auto-commit: add + commit + push no repositório Git atual (padrão: sobe pro GitHub).
 * Uso: auto-commit.exe [caminho-do-repo]   → commit + push
 *      auto-commit.exe --no-push [caminho] → só commit
 * Se caminho não for passado, usa o diretório atual.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const noPush = args.includes('--no-push');
const push = !noPush;
const repoPath = args.filter((a) => a !== '--no-push')[0] || process.cwd();
const resolvedPath = path.isAbsolute(repoPath) ? path.resolve(repoPath) : path.resolve(process.cwd(), repoPath);

const runOpts = (opts = {}) => ({ encoding: 'utf8', cwd: resolvedPath, stdio: opts.silent ? 'pipe' : 'inherit', ...opts });

function run(cmd, opts = {}) {
  return execSync(cmd, runOpts(opts));
}

function runSilent(cmd) {
  try {
    return run(cmd, { silent: true });
  } catch {
    return null;
  }
}

function gitCommit(message) {
  const r = spawnSync('git', ['commit', '-m', message], { cwd: resolvedPath, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status == null ? 1 : r.status);
}

function main() {
  const gitDir = path.join(resolvedPath, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    console.error('[auto-commit] Não é um repositório Git:', resolvedPath);
    process.exit(1);
  }

  console.log('[auto-commit] Repositório:', resolvedPath);
  console.log('[auto-commit] Adicionando alterações...');
  run('git add .');

  const status = runSilent('git status --short');
  if (!status || status.trim() === '') {
    console.log('[auto-commit] Nada para commitar. Saindo.');
    process.exit(0);
  }

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const message = `chore: auto commit ${timestamp}`;
  console.log('[auto-commit] Commit:', message);
  gitCommit(message);

  if (push) {
    console.log('[auto-commit] Enviando para o remote...');
    run('git push');
  }

  console.log('[auto-commit] Concluído.');
}

main();
