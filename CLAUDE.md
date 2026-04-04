# Dev Environment

This project uses **[Flox](https://flox.dev)** for environment management. `node`, `npm`, and all other project tooling are **only available inside the activated Flox environment**.

When running CLI commands non-interactively (e.g. from a shell that was not started with `flox activate`), prefix every command with `flox activate --`:

```bash
flox activate -- npm test
flox activate -- npm run build
flox activate -- npm run synth
```

The environment is defined in `.flox/env/manifest.toml` and currently provides:
- Node.js 24.13.0 (npm bundled)

## Issue Tracking

Beads (`bd`) is configured for this project at `.beads/`. Use it for all task tracking — create an issue before starting work, mark in-progress when starting, close when done.

## Common Commands

| Action | Command |
|---|---|
| Run tests | `flox activate -- npm test` |
| Build (compile TS) | `flox activate -- npm run build` |
| Synthesize manifests | `flox activate -- npm run synth` |
| Install dependencies | `flox activate -- npm install` |
| Watch mode tests | `flox activate -- npm run test:watch` |
