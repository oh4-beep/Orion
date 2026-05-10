<div align="center">
  <img src="public/logo.png" width="144" height="144" alt="Orion" />
  <h1>Orion</h1>

  <p><strong>A fork of Terax — open-source lightweight cross-platform AI-native terminal (ADE)</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-0.5.9-blue" alt="version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows%20(soon)-lightgrey" alt="platform" />
  </p>
</div>

---

> **Orion is a fork / derivative work of [Terax](https://github.com/crynta/terax-ai) by Crynta**, distributed under the Apache License 2.0. See [`NOTICE`](NOTICE) for attribution and [`CHANGES.md`](CHANGES.md) for a summary of modifications from upstream. This project is not affiliated with or endorsed by Crynta.

Orion is a fast, lightweight AI terminal (ADE) built on Tauri 2 + Rust and React 19. It pairs a native PTY backend with a modern UI — multi-tab terminals, an integrated code editor, a file explorer, and a first-class AI side-panel that works with your own API keys (or fully local models via LM Studio). Under 10 MB on disk, no telemetry, keys stored in the OS keychain.

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/terminal.png" alt="Terminal" /><br/><sub>Multi-tab terminal with WebGL rendering</sub></td>
    <td align="center"><img src="docs/web-preview.png" alt="Web preview" /><br/><sub>Web preview of local dev servers</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/ai-workflow.png" alt="AI window" /><br/><sub>AI agentic workflow with edit diffs in the code editor</sub></td>
  </tr>
</table>

## Features

**Terminal**
- xterm.js + WebGL renderer, multi-tab with background streaming
- Native PTY backend via `portable-pty` (zsh, bash, pwsh, …)
- Shell integration (cwd reporting, prompt markers) via injected init scripts
- Inline search, link detection, true-color

**Editor**
- CodeMirror 6 with language support for TS/JS, Rust, Python, HTML/CSS, JSON, Markdown
- Inline AI autocomplete and AI edit diffs
- Vim mode
- Prebuilt themes: Tokyo Night, Nord, GitHub, Atom One, Aura, Copilot, Xcode

**File Explorer**
- Catppuccin icon theme (Material Icon Theme resolver)
- Fuzzy search, keyboard navigation, inline rename, context actions

**Web Preview**
- Auto-detects local dev servers and opens them in a preview tab

**AI (BYOK)**
- Providers: OpenAI, Anthropic, Google, Groq, xAI, Cerebras, OpenAI-compatible
- Local / offline models via LM Studio
- Voice input, edit diffs, multi-agent and sub-agents
- Snippets / skills, customizable system prompt
- Project memory and configuration file
- Tasks, plans, search, file read/write tools with approval flow

**Quality**
- Lightweight and fast (~7 MB bundle)
- API keys stored in the OS keychain
- No telemetry, no account required

## Configure AI

1. Open **Settings → AI**.
2. Pick a provider and paste your API key. For local inference, point Orion at your LM Studio endpoint.
3. Keys are written to the OS keychain via `keyring` — they never touch disk or `localStorage`.

## Build from source

**Prerequisites**
- Rust (stable) — https://rustup.rs
- Node 20+ and [pnpm](https://pnpm.io)
- Platform-specific Tauri prerequisites — https://tauri.app/start/prerequisites/

**Run**
```bash
pnpm install
pnpm tauri dev          # development
pnpm tauri build        # production bundle
```

**Checks**
```bash
pnpm exec tsc --noEmit          # frontend type-check
cd src-tauri && cargo clippy    # Rust lint
```

## Tech stack

Tauri 2 · Rust · `portable-pty` · React 19 · TypeScript · xterm.js · CodeMirror 6 · Vercel AI SDK v6 · Tailwind v4 · shadcn/ui · Zustand

## Credits

Orion is built on the excellent work of the [Terax](https://github.com/crynta/terax-ai) project by Crynta. The original codebase, architecture, and design are theirs; modifications in this fork are documented in [`CHANGES.md`](CHANGES.md).

## Contributing

Issues and PRs are welcome! Feel free to open issues, suggest features, or submit pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## License

Orion, like upstream Terax, is licensed under the Apache-2.0 License. See [LICENSE](LICENSE) for the full license text and [NOTICE](NOTICE) for attribution.
