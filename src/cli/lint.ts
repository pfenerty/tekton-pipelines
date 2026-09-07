import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { lintCommandForFile, languageNameForFile } from '../lib/script/from-file';

/** Extensions the linter recognises, matching the languages `scriptFromFile` supports. */
export const LINTABLE_EXTENSIONS = ['.bash', '.sh', '.nu', '.py'];

/** Result of a lint run. */
export interface LintResult {
  checked: number;
  failures: string[];
  /** Linters that are not installed — reported, but not a failure. */
  skipped: string[];
}

/** Collects lintable script files under `target` (a file or a directory), depth-first. */
export function collectScripts(target: string, acc: string[] = []): string[] {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      collectScripts(path.join(target, entry), acc);
    }
  } else if (LINTABLE_EXTENSIONS.includes(path.extname(target).toLowerCase())) {
    acc.push(target);
  }
  return acc;
}

/**
 * Runs each script file through its language's linter (shellcheck / nu-check / py_compile).
 *
 * A linter that is not installed is skipped rather than failed, so this is safe to run
 * anywhere; install the linters for full coverage.
 */
export function lintScripts(targets: string[], log: (msg: string) => void): LintResult {
  const files = targets.flatMap(t => collectScripts(t));
  const result: LintResult = { checked: 0, failures: [], skipped: [] };
  for (const file of files) {
    const cmd = lintCommandForFile(file);
    const res = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
    if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') {
      const label = `${languageNameForFile(file)} (${cmd[0]})`;
      if (!result.skipped.includes(label)) result.skipped.push(label);
      log(`SKIP ${file} — linter "${cmd[0]}" not installed`);
      continue;
    }
    result.checked++;
    if (res.status !== 0) {
      result.failures.push(file);
      log(`FAIL ${file}`);
      if (res.stdout) log(res.stdout.trimEnd());
      if (res.stderr) log(res.stderr.trimEnd());
    }
  }
  return result;
}
