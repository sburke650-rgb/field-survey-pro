# Known defects — V17.121

Baseline: `850eafbff6546911954655ee9fb893c0277fb9fb`.
These are local inventory IDs, not GitHub issue numbers. Fixes #1–#6 are implemented only in the unnumbered `development/index.html` for architectural review. Published snapshots remain unchanged.

| ID | Confirmed problem | Automated evidence | Required resolution |
| --- | --- | --- | --- |
| KD-001 | Sampled right-angle cable route becomes a diagonal in `straighten()` | Original assertion now passes; expanded geometry/UI/save/shared-path tests pass | Development repair; see `docs/cable-route-geometry.md` |
| KD-002 | Camera Details inline drag positions lose to important CSS | Original assertion now passes; added mouse/touch boundary, controls and scrolling regressions | Development repair; see `docs/camera-details-drag.md` |
| KD-003 | Draw and Edit entry explicitly select Line | Original Draw/Edit assertions now pass; expanded drawn/uploaded selection and navigation tests pass | Development repair; see `docs/draw-edit-tool-selection.md` |
| KD-004 | A stale legacy snapshot restores a deleted measurement | Published-snapshot reproduction remains an expected failure; development repair tests pass | Plan-local versioned deletion ledger; see `docs/survey-data-reconciliation.md` |

Expected failures assert desired behavior; they do not invert assertions or skip execution. Setup and prerequisite assertions run before `test.fail()` so setup breakage is not accepted as the known defect. Playwright rejects unexpected passes. Remove the annotation only with a reviewed repair and passing regression. The custom reporter distinguishes actual passes from known-defect failures because Playwright's default aggregate includes expected failures in its accepted total.

## Other findings requiring follow-up

- Area entry and previously inaccessible trace/rectangle/manual workflows are repaired in development by Fix #5; see `docs/area-tool-accessibility.md`. New reachability tests failed before the repair and now run as ordinary regressions. Physical phone acceptance remains pending.
- Recovery of walls/cameras/surveys from stale snapshots needs a complete deletion matrix; the first automated conflict reproduction covers legacy measurements only.
- Fix #6 repairs reproduced header/canvas, hidden toolbar-control, cable/Done and keyboard-dialog overlap in development; see `docs/mobile-toolbar-accessibility.md`. Geometry/hit testing, Android touch emulation, safe-area and visual-keyboard simulations are automated. Physical phone acceptance (including background/resume) remains required. Desktop camera/cone checks do not reproduce the reported panning problem.
- Existing drawn-plan Done recalculation regenerates derived auto-area IDs; the calculation and coordinates remain intact. Identified while comparing layout-only changes; `refreshAutoArea()` is unchanged in Fix #6. Stabilizing those derived IDs remains a separate follow-up.
- Shared routes still copy downstream polylines rather than maintain a topology graph. Fix #2 adds joining/count/length coverage; large-survey phone performance and trunk-edit propagation remain unverified.
- No voice recording or separate hardware/model selector was found. New/Existing status is implemented. These are requirements questions, not authorized additions.
- Offline editing after initial load is implemented; cold-start offline application delivery is not established (no service worker found).
- Root and generic test entry points are older versions. No production entry point is changed here.

KD-001–KD-004 are repaired in development, not in the published baseline. Other confirmed defects remain release blockers. Passing the safeguard baseline with expected failures is not V17.122 release acceptance.

## V17.128 investigation — KD-005

KD-005: In short landscape with the simulated keyboard visible, tapping measurement Done can blur the distance input and move a right-positioned dialog before compatibility mouseup/click. Done then receives no click and `#modalBack` remains visible. The right-side regression reproduces on both the integration and untouched V17.128. It remains an ordinary failing test, preserving CI's blocker. No application fix is included. See [PR #11 measurement investigation](pr11-measurement-dialog-investigation.md) for CI evidence, matching event traces and baseline comparison. Physical Android/iPhone acceptance remains unrun.
