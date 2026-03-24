# Contributing

## Development setup

This project uses [Flox](https://flox.dev/) for environment management. All commands should be run inside `flox activate`.

```bash
flox activate
npm install
```

## Commands

```bash
npm run build       # compile TypeScript → dist/
npm test            # run test suite (vitest)
npm run synth       # synthesize examples → synth-output/
npm run docs:api    # generate API docs with TypeDoc
```

## Project structure

```
src/
├── index.ts                      # public API re-exports
├── charts/
│   └── tekton-infra.chart.ts     # trigger infrastructure chart
└── lib/
    ├── constants.ts              # API versions, defaults, security contexts
    ├── core/
    │   ├── param.ts              # Param class
    │   ├── workspace.ts          # Workspace class
    │   ├── task.ts               # Task class
    │   ├── pipeline.ts           # Pipeline class
    │   ├── tekton-project.ts     # TektonProject orchestrator
    │   └── trigger-events.ts     # TRIGGER_EVENTS enum
    └── triggers/
        ├── github-trigger-base.ts       # base trigger class
        ├── github-push.trigger.ts       # push event trigger
        ├── github-pull-request.trigger.ts # PR event trigger
        └── github-tag.trigger.ts        # tag event trigger
examples/
├── main.ts                       # Go pipeline example
└── self-ci.ts                    # this project's own CI pipeline
docs/
├── getting-started.md
├── api.md
└── triggers.md
```

## Testing

Tests use [vitest](https://vitest.dev/) and live alongside source files as `*.test.ts`.

```bash
npm test              # single run
npm run test:watch    # watch mode
```

## Pull requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run build` and `npm test` pass
4. Open a PR against `main`

## Code conventions

- TypeScript strict mode
- vitest for testing
- cdk8s patterns for Kubernetes resource generation
- TSDoc comments on all public API surface
