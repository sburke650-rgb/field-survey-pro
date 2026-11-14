# Fix #5 — Area tool accessibility

Target: unnumbered `development/index.html`, based on main `36da6dc` (Fixes #1–#4). Published HTML and the V17.121 recovery baseline remain unchanged. No schema migration or new dependency.

## Reproduction and cause

Before editing application code, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test tests/area-accessibility.spec.js --grep 'control is reachable'` produced two failures: the new reachability tests failed on uploaded and drawn plans: neutral Pan entry worked, but Area was hidden. `updateEditingToolbar()` hid it for every uploaded plan, and for drawn plans unless the sketch-only flag and five-wall minimum were present. Uploaded tracing existed behind that hidden button. Drawn plans only invoked the wall-measurement guide. Measurement-linked rectangle and manual dimension creation lacked normal entry paths.

## Reviewable behavior

- The existing toolbar button reads **Area** and remains reachable in Draw/Edit. Opening its existing menu returns to neutral Pan; it never selects Line.
- Both plan types offer **Trace irregular outline**, **Rectangle from measurements**, and **Enter dimensions** (existing rectangle/L-shaped forms). The first action retains the drawn-wall calculation guide or uploaded-plan measurement workflow.
- Tracing requires independent horizontal and vertical calibration. Taps add corners; drags/pinch navigate without adding points. Existing measurement/area labels do not open competing editors during tracing.
- Area and the existing Done control read **Finish Area** while tracing. Fewer than three corners prompts for more corners or cancellation. Completion opens the existing name/group save form. Cancel there discards the draft and preserves saved areas.
- The existing header Back control reads **Cancel Area** during tracing and cancels back to Pan in the editor. Escape also cancels. Selecting another tool discards the draft. Plan/screen switches discard draft state to avoid cross-plan leakage.
- Undo reads **Undo Corner** during tracing and only removes draft corners; it cannot remove a wall. Outside tracing its existing behavior is retained. Draft previews survive scene redraws. Area dialogs scroll on short screens.

## Data and calculation boundaries

Existing `trace`, `rectangle`, `manual-rectangle`, `manual-l`, and auto-area records remain unchanged. Polygon points are plain finite plan-space `{x,y}` values; viewport transformations remain separate. Measurement IDs, units, names/groups, stable IDs and equipment/camera/routes are preserved. Draft plan/survey IDs are runtime guards only, never new stored fields. Existing autosave and reconciliation are used without changes.

Shoelace, axis calibration, drawn-shape recognition and manual dimension formulas are unchanged. Saving a trace/manual area retains the existing replacement rule for `auto-uploaded-rectangle`; explicit other saved areas remain. Multiple explicit area results can overlap, as before; this repair does not redefine building totals.

## Validation and remaining acceptance

Automated coverage is in `tests/area-accessibility.spec.js`; Fix #4's area-guide test now traverses the newly explicit menu choice while retaining its original assertions. Synthetic uploaded images and drawn plans exercise normal UI interaction, save/reload, plain geometry, L-shaped calculations, cancellation, corner undo, tool changes, calibration prerequisites, navigation, plan switching, mouse and simulated touchscreen layouts. Known-defect tests remain visible.

Real Android Chrome and iPhone Safari are still required for physical gesture/orientation, keyboard/safe-area, background/resume and accessibility acceptance. Emulated Chromium touch is not physical-device certification. Self-intersecting polygons, holes, slanted/perspective scans, and erroneous field calibration remain existing calculation limitations; this repair does not introduce geometry validation or change formulas. PDF/image import itself is covered by existing upload behavior rather than a new import implementation; new Area tests use a synthetic stored image.

## Final automated results

Command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.

- 87 executed: **86 passed**, **1 retained expected failure** (KD-004 against the immutable published V17.121 snapshot).
- 0 unexpected outcomes, 0 skipped, 0 runner errors. All 15 new Area tests passed. Fixes #1–#4 remain passing in development.
- All 43 published HTML files byte-compared unchanged against `origin/main`; no V17.122 directory. Inline scripts passed `node --check`; `git diff --check` passed. Area arithmetic (`areaSquare` through `areaOptions`) compared unchanged against main.
- Local Chromium run only. GitHub Actions status is separate; real-phone/manual acceptance remains unrun.

