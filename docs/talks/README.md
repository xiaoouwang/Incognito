# Talks

## Conference deck — Incognito (~20 min)

- **Slides (Marp):** [`2026-conference-incognito.md`](2026-conference-incognito.md)
- **HTML:** [`2026-conference-incognito.html`](2026-conference-incognito.html)
- **Language:** French
- **Scope:** **Web only** (no desktop). Emphasis on **technical pipelines**. Demo **≤ 2 min**.
- **Speaker notes:** HTML comments under slides (`<!-- SPEAKER … -->`)

### Present

**Option A — open HTML**

Open `2026-conference-incognito.html` in a browser → fullscreen.

**Option B — Marp preview**

Install [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode), open the `.md`, present from preview.

**Rebuild HTML / PDF**

```bash
cd docs/talks
npx --yes @marp-team/marp-cli@latest 2026-conference-incognito.md --html -o 2026-conference-incognito.html
npx --yes @marp-team/marp-cli@latest 2026-conference-incognito.md --pdf -o 2026-conference-incognito.pdf
```

### Timing cue card (~20 min)

| Block | Minutes | Content |
| ----- | ------- | ------- |
| Title + plan | 1.5 | Scope web, démo courte |
| Problem + proposition | 3 | Privacy, placeholders, principes |
| Architecture | 2 | Workers, ONNX/WASM, data flow, CORS proxy |
| Basic pipeline | 3 | nerWorker → spans → expansion → placeholders |
| Advanced pipeline | 3 | GLiNER chunking, threshold, regex-first |
| Generative pipeline | 2.5 | Compact JSON, client rebuild, Worker |
| Person graph + review | 3 | UDPipe, Related to, chips vs soft-exclude |
| **Live demo** | **≤ 2** | Basic sample + one edit gesture |
| Limits + links | 1.5 | Honest limits, URLs |

### Demo checklist (≤ 2 min)

- [ ] Pages tab already open on Basic sample (models cached if possible)
- [ ] One soft-exclude **or** one Related to — not both
- [ ] No model download during the talk
- [ ] Skip Generative unless pre-tested with key + Wi‑Fi
- [ ] Backup: repo `demo.gif` if network fails
