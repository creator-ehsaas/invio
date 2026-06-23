# Accessibility Audit — Ledger Heritage Color Tokens

**Date:** 2026-06-12
**Target:** `src/app/globals.css` (light + dark themes) and form-control primitives
**WCAG Level:** 2.2 AA
**Tool:** `scripts/check-contrast.js` (WCAG relative-luminance formula, 38 combinations)

## Result: PASSING (after fixes)

Initial audit found **7 failing combinations**; all fixed. Re-run: 38/38 pass.

## Issues found & fixed

| # | Combination | Was | Now | Fix |
|---|-------------|-----|-----|-----|
| 1 | Light marigold text on card (1.4.3) | 2.82:1 | 5.40:1 | `--marigold #c98a1b → #8a5f10` (deep ochre) |
| 2 | Light marigold stamp on soft bg | 2.46:1 | 4.71:1 | same |
| 3 | Light vermillion stamp on soft bg | 3.77:1 | 4.83:1 | `--vermillion #c84723 → #b03c1c`, soft `#f6e0d4 → #f7e3d8` |
| 4 | Light green stamp on soft bg | 4.12:1 | 4.91:1 | `--ledger-green #2e7d54 → #27704a` |
| 5 | Dark vermillion stamp on soft bg | 4.14:1 | 4.67:1 | dark `--vermillion-soft #3a2620 → #2f1d18` |
| 6 | Light input border (1.4.11 non-text) | 1.43:1 | 3.33:1 | new `--border-strong #94896c`; Input/Textarea/Select use it |
| 7 | Dark input border (1.4.11 non-text) | 1.25:1 | 3.52:1 | new dark `--border-strong #6c7389` |

Notes:
- `--border` (hairline ledger rules) stays light — decorative separators are
  exempt from 1.4.11; only form-control boundaries moved to `--border-strong`.
- `--chart-1`, `--ring`, `--sidebar-primary` updated to the new vermillion.
- Motion already honors `prefers-reduced-motion` (globals.css).

## How to re-check

```
node scripts/check-contrast.js
```

Run after any token change; exits non-zero on failure.
