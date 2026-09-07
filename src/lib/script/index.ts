import { Sh } from './sh';
import { Bash } from './bash';
import { Nushell } from './nushell';
import { Python } from './python';
import { scriptLabel, EXIT_CODE_PATH } from './types';
import type { ScriptLanguage, ScriptCtx } from './types';

export type { ScriptLanguage, ScriptCtx } from './types';
export { EXIT_CODE_PATH, stepExitCodePath } from './types';
export { Sh } from './sh';
export { Bash } from './bash';
export { Nushell } from './nushell';
export { Python } from './python';

/** Names of the built-in script languages. */
export type LanguageName = 'sh' | 'bash' | 'nushell' | 'python';

const LANGUAGES: Record<LanguageName, ScriptLanguage> = {
  sh: new Sh(),
  bash: new Bash(),
  nushell: new Nushell(),
  python: new Python(),
};

/** Resolves a language name to its plugin, throwing on an unknown name. */
export function languageFor(name: LanguageName): ScriptLanguage {
  const lang = LANGUAGES[name];
  if (!lang) {
    throw new Error(`Unknown script language "${name}" (expected one of ${Object.keys(LANGUAGES).join(', ')})`);
  }
  return lang;
}

/** Per-body opt-outs from a framework guard. */
export interface ScriptOptions {
  /**
   * Permit a non-zero `exit` in a body the exit-code contract wraps. Only nushell rejects
   * one by default (its `exit` is untrappable and bypasses the wrapper); set by
   * {@link unsafeAllowExit} so the decision is visible at the call site.
   */
  allowExit?: boolean;
}

/** A script body paired with the {@link ScriptLanguage} that should render it. */
export class Script {
  constructor(
    readonly language: ScriptLanguage,
    readonly body: string,
    readonly options: ScriptOptions = {},
  ) {}
}

/**
 * States that a non-zero `exit` in this body is deliberate, so nushell renders it instead of
 * failing synthesis.
 *
 * The exit still terminates the process before the capture wrapper runs: the failure reaches
 * the status reporter through Tekton's own per-step exit code, but with no `error [task/step]`
 * line to explain it. Prefer `error make {msg: "..."}`; reach for this only when the exit code
 * itself carries meaning (a watchdog signalling a specific code, say).
 *
 * @example
 * ```ts
 * script: unsafeAllowExit(nu`if $over_budget { exit 99 }`)
 * ```
 */
export function unsafeAllowExit(script: Script): Script {
  return new Script(script.language, script.body, { ...script.options, allowExit: true });
}

/**
 * A body emitted verbatim — no shebang, no preamble, no exit-code capture.
 *
 * The framework's contract only holds for bodies it wraps, so opting out has to be a stated
 * decision rather than a side effect of a string starting with `#!`. Use it when the step
 * writes {@link EXIT_CODE_PATH} itself, or runs an interpreter tektonic has no plugin for.
 *
 * @example
 * ```ts
 * script: rawScript(`#!/usr/bin/env nu\n# writes the contract file itself\n...`)
 * ```
 */
export class RawScript {
  constructor(readonly body: string) {}
}

/** Marks a body as deliberately unwrapped. See {@link RawScript}. */
export function rawScript(body: string): RawScript {
  return new RawScript(body);
}

/** Object form accepted by `TaskStepSpec.script`, e.g. `{ language: 'python', body: '…' }`. */
export interface ScriptObject {
  language: LanguageName;
  body: string;
}

/** Anything accepted by `TaskStepSpec.script`. */
export type ScriptInput = string | Script | ScriptObject | RawScript;

/**
 * Removes surrounding blank lines and the common leading indentation from a
 * template body, preserving relative indentation (important for Python). Tabs
 * are normalised to four spaces first.
 */
export function dedent(text: string): string {
  const lines = text.replace(/\t/g, '    ').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indents = lines
    .filter((l) => l.trim().length)
    .map((l) => (l.match(/^ */) ?? [''])[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

function interpolate(strings: TemplateStringsArray, values: unknown[]): string {
  let out = '';
  strings.forEach((s, i) => {
    out += s + (i < values.length ? String(values[i]) : '');
  });
  return out;
}

function tag(language: ScriptLanguage) {
  return (strings: TemplateStringsArray, ...values: unknown[]): Script =>
    new Script(language, dedent(interpolate(strings, values)));
}

/** Tagged-template helper authoring a POSIX sh step body, e.g. ``sh`echo hi` ``. */
export const sh = tag(LANGUAGES.sh);
/** Tagged-template helper authoring a bash step body, e.g. ``bash`echo hi` ``. */
export const bash = tag(LANGUAGES.bash);
/** Tagged-template helper authoring a nushell step body, e.g. ``nu`print hi` ``. */
export const nu = tag(LANGUAGES.nushell);
/** Tagged-template helper authoring a python step body, e.g. ``py`print("hi")` ``. */
export const py = tag(LANGUAGES.python);

/** Object-form helper: `script({ language: 'python', body: '…' })`. */
export function script(spec: ScriptObject): Script {
  return new Script(languageFor(spec.language), dedent(spec.body));
}

/**
 * Resolves a {@link ScriptInput} to the final step `script` string at synth time.
 *
 * - A {@link Script} (from a tag or {@link script}) is rendered by its language.
 * - A {@link ScriptObject} is rendered by the named language.
 * - A {@link RawScript} is emitted verbatim — the explicit opt-out from wrapping.
 * - A raw string that begins with a shebang is passed through unchanged, except in a task
 *   that reports status: there, passing through silently drops the exit-code contract the
 *   reporter depends on, so it is rejected in favour of a language tag or {@link rawScript}.
 * - A raw string without a shebang is rendered with `defaultLanguage` if one is
 *   set, otherwise passed through unchanged.
 */
export function renderScript(
  input: ScriptInput,
  ctx: ScriptCtx,
  defaultLanguage?: LanguageName,
): string {
  if (input instanceof RawScript) return input.body;
  if (typeof input === 'string') {
    if (input.startsWith('#!')) {
      if (ctx.captureExitCode) {
        throw new Error(
          `tektonic${scriptLabel(ctx)}: a raw '#!' script string is emitted verbatim, so it ` +
            `silently opts out of the exit-code contract this task's status reporter reads — ` +
            `a failure here can report green. Author the body with a language tag (sh/bash/nu/py) ` +
            `so the contract is applied, or wrap it in rawScript() if the step writes ` +
            `${EXIT_CODE_PATH} itself.`,
        );
      }
      return input;
    }
    if (defaultLanguage) return languageFor(defaultLanguage).wrap(dedent(input), ctx);
    return input;
  }
  if (input instanceof Script) {
    return input.language.wrap(input.body, { ...ctx, allowExit: input.options.allowExit });
  }
  return languageFor(input.language).wrap(dedent(input.body), ctx);
}
