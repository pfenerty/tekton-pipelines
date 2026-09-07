# Contributing

## Development setup

This project uses [Flox](https://flox.dev/) for environment management. All commands should be run inside `flox activate`.

```bash
flox activate
npm install
```

## Commands

```bash
npm run build         # compile TypeScript → dist/
npm test              # run test suite (vitest)
npm run synth         # synthesize examples → synth-output/
npm run lint:scripts  # lint extracted .sh/.bash/.nu/.py files
npm run docs:api      # generate API docs with TypeDoc
```

## Project structure

See [docs/architecture.md](docs/architecture.md) for how these pieces fit together and the
extension points. At a glance:

```
src/
├── index.ts                      # public API re-exports (the entire public surface)
├── constants.ts                  # API versions, defaults, security contexts, images
├── charts/
│   └── tekton-infra.chart.ts     # trigger infrastructure chart
└── lib/
    ├── core/                     # primitives, orchestrators, extension interfaces
    │   ├── param.ts  workspace.ts  result.ts
    │   ├── task.ts               # TaskDef (aka Task)
    │   ├── pipeline.ts  git-pipeline.ts  pipeline-task.ts
    │   ├── tekton-project.ts  pac-project.ts      # the two synthesizers
    │   ├── hub-task-ref.ts  trigger-events.ts
    │   └── cache-backend.ts  status-reporter.ts   # extension interfaces
    ├── script/                   # ScriptLanguage plugins (sh/bash/nushell/python) + from-file
    ├── cache/                    # PvcBackend, GcsBackend, shared helpers
    ├── triggers/                 # VcsProvider + GitHub triggers
    └── reporters/                # GitHubStatusReporter
examples/
├── main.ts                       # Go pipeline example
└── self-ci.ts                    # this project's own CI pipeline
docs/                             # see README.md for the full doc index
```

## Testing

Tests use [vitest](https://vitest.dev/) and live alongside source files as `*.test.ts`.

```bash
npm test              # single run
npm run test:watch    # watch mode
```

Two patterns dominate (both detailed in [docs/architecture.md](docs/architecture.md#testing)):

- **Synthesis assertions** — construct primitives, build a spec, and assert the resulting object
  shape (params inferred, `runAfter` correct, cycle rejected).
- **Script runtime** — render a body through a `ScriptLanguage.wrap`, execute it with the real
  interpreter, and assert the exit code *and* the contract file. See
  `src/lib/script/runtime.test.ts`; guard each case with `it.skipIf(!has(interpreter))` so the
  suite stays hermetic.

Run `tektonic lint` (or `npm run lint:scripts`) to syntax-check any `.sh`/`.bash`/`.nu`/`.py` files under `src/`.

## Pull requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run build` and `npm test` pass
4. Open a PR against `main`

## Releasing

The package is published to **npmjs as `@pfenerty/tektonic`** by Tektonic's own CI: the
`npm-release` pipeline (`examples/self-ci.ts`) fires on a tag push, runs the test and build tasks
first, then `publish-npm`.

1. Bump `version` in `package.json`, commit, and push to `main`.
2. Tag the commit `vX.Y.Z` and push the tag — the tag must match the package version, or
   `publish-npm` fails rather than publishing whatever is in `package.json`.
3. The pipeline is a no-op if that version is already on the registry, so re-running a release
   is safe.

The registry token comes from a Kubernetes Secret in the CI namespace, created out of band with
an npm **automation** token (one that bypasses 2FA):

```bash
kubectl create secret generic npm-token -n tektonic-ci --from-literal=token=npm_xxx
```

## Code conventions

- TypeScript strict mode
- vitest for testing
- cdk8s patterns for Kubernetes resource generation
- TSDoc comments on all public API surface
