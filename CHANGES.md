# Changes from upstream Terax

This repository (**Orion**) is a fork and derivative work of [Terax](https://github.com/crynta/terax-ai)
by Crynta, distributed under the Apache License, Version 2.0.

In accordance with Section 4(b) of the Apache 2.0 License, this file documents
that the Source form of this Work has been modified from the original. The list
below summarizes high-level modifications by the Orion maintainers; for a
complete file-by-file diff, see the git history of this repository compared
against the upstream `crynta/terax-ai` repo.

## Project-level changes

- Project rebranded as **Orion** (a fork of Terax).
- Added top-level `NOTICE` file preserving original Crynta attribution and
  adding Orion attribution.
- Added this `CHANGES.md` file.
- README updated to identify this distribution as Orion, a fork of Terax.

## Source-level modifications

Modifications have been made to the following areas relative to upstream Terax
(see `git log` and `git diff` against `origin/main` of `crynta/terax-ai` for
exact details):

- `src/modules/ai/*` — agent, transport, keyring, chat store changes;
  added bug scanner, inline explain, Ollama integration.
- `src/modules/editor/*` — editor pane, AI diff pane, themes, Monaco setup,
  inline completion, explain widget, vim-on-Monaco integration; removed
  legacy CodeMirror autocomplete/extensions/vim helpers.
- `src/modules/sidebar/*`, `src/modules/workspace/*` — new modules added.
- `src/modules/tabs/*` — persistence and tab handling changes.
- `src/modules/settings/*`, `src/settings/*` — settings store and UI updates.
- `src/modules/shortcuts/*`, `src/modules/statusbar/*` — shortcut and
  status-bar updates.
- `src-tauri/*` — Rust/Tauri capability and library updates.
- Build configuration: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`,
  `pnpm-workspace.yaml`.

All original Crynta copyright notices in source files are retained.
