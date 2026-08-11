import { scriptLabel, type ScriptLanguage, type ScriptCtx } from './types';

/**
 * Nushell scripting language plugin.
 *
 * The preamble provides the `log` helper previously copy-pasted as `nuHeader`
 * in consumers. Nushell's `exit` terminates the process immediately and cannot
 * be trapped, so the captured-exit contract runs the body inside `def main []`
 * wrapped in `try/catch`: clean completion yields `0`, a raised nushell error
 * yields `1`. Bodies should still signal failure by raising (`error make`) or
 * by letting an external command fail, since that is what produces a readable
 * message — but `exit` is no longer a trap: the reporter also reads Tekton's
 * own per-step exit code, which is recorded by the entrypoint and so survives a
 * body that terminates before this wrapper runs. The contract file keeps the
 * *worst* code seen across a task's steps (a later success cannot mask an
 * earlier failure); the step re-exits its own.
 */
export class Nushell implements ScriptLanguage {
  readonly name = 'nushell';
  readonly shebang = '#!/usr/bin/env nu';

  private preamble(): string {
    return [
      this.shebang,
      `def log [msg: string] { print $"[(date now | format date '%H:%M:%S')] ($msg)" }`,
    ].join('\n');
  }

  wrap(body: string, ctx: ScriptCtx): string {
    if (!ctx.captureExitCode) {
      return `${this.preamble()}\n${body}`;
    }
    return [
      this.preamble(),
      // See Sh.wrap: the contract file is shared across steps that may run as
      // different uids, so seed it and make it group/other-writable before the
      // body. Both statements are best-effort — a non-owner's chmod fails, and
      // by then the owner has already opened the file up.
      `if not ("${ctx.exitCodePath}" | path exists) { try { "0" | save -f ${ctx.exitCodePath} } }`,
      `try { ^chmod 0666 ${ctx.exitCodePath} }`,
      'def main [] {',
      body,
      '}',
      // Attribute the failure. nushell's message for a failed external command is the
      // generic "External command had a non-zero exit code", which on a report-only task
      // is the entire signal — see ScriptCtx.taskName. Task and step names are Kubernetes
      // names (alphanumeric + dash), so they cannot introduce the bare parentheses that
      // nushell would evaluate inside an interpolated string.
      `let __tek_rc = (try { main; 0 } catch { |e| print $"error${scriptLabel(ctx)}: ($e.msg)"; 1 })`,
      `let __tek_prev = (try { open --raw ${ctx.exitCodePath} | str trim | into int } catch { 0 })`,
      'let __tek_worst = ([$__tek_prev $__tek_rc] | math max)',
      `$"($__tek_worst)" | save -f ${ctx.exitCodePath}`,
      'exit $__tek_rc',
    ].join('\n');
  }

  lintCommand(file: string): string[] {
    // `nu-check` returns a validity boolean; wrap it so the process exit code
    // reflects pass/fail (unlike `nu --ide-check`, which always exits 0).
    return ['nu', '-c', `if (nu-check ${JSON.stringify(file)}) { exit 0 } else { exit 1 }`];
  }
}
