# methodica-science-volume-liquid-01-03

720 learning-module (לומדה) — part 03 of a 7th–8th grade science unit on
measuring liquid volume. This repository is a **reference implementation**,
preserved for other producers who need to build similar screens or
interactions — it is **not** the canonical 720 template library.

## Running locally

No build step or dependencies. Serve the folder with any static file
server and open `index.html`:

```bash
npx http-server -p 8080
# then open http://localhost:8080/index.html
```

`index_dev.html` wraps the module in a small dev bar (screen jump,
keyboard shortcuts) for faster iteration while building.

## Reusable screen patterns included

- **TransitionScreen** (`S0`) — companion character video, resolved from a
  character choice carried over from a previous part via `localStorage`.
- **SingleChoiceQuestion, image-choice variant** (`S1`) — single-select
  image cards driving the standard check/attempts/hint/feedback state
  machine.
- **MultipleChoiceQuestion, image-choice variant** (`S2`) — the same
  image-card question shape as `S1`, adapted to **multiple independently
  selectable cards** (`Set`-based selection, toggle-only-that-card
  semantics, correctness by set-equality against a correct-answer set).
  Built as a project-local variant of `SingleChoiceQuestion`; documented
  in `js/main.js` as a candidate for a future reusable template.
- **ValueInputQuestion + DropdownQuestion, combined variant** (`S3`) — a
  numeric input and a single dropdown selector on one screen, gated by a
  shared check button that only enables once both parts are filled.
- **Progress Question nav** — a shared 3-dot question-progress indicator
  used across `S1`–`S3`.

## Status

Reference implementation only. Behavior and design are frozen for this
publish; further screens for this part may continue in a separate
working copy.
