# V17.128 viewport integration review

Branch: `integration/v17-128-viewport-persistence`.

Follow-up: [CI measurement-dialog investigation](pr11-measurement-dialog-investigation.md) records the fourth failure in run 43971361542, its reproduction on untouched V17.128, and the latest 130-case verification. The original validation below is historical; the full suite remains blocked.

## Provenance and boundaries

Repository baseline: `24860223f1575be60948eca3050f7fd8b025a8ea` (main, V17.128 publication).
Exact integration source: `test/v17-128/index.html`, Git blob `7d91d8d`.
The first integration commit copies that source into `development/index.html` byte-for-byte. The next commit ports viewport behavior from PR #10 (`abab4e7bbeb1de0497e56b35d03105c325e7c5fe`), resolving six conflicts against V17.128.

This explicitly corrects the ancestry problem: main's former development source was older than its V17.128 snapshot. No PR #10 application file is copied wholesale onto the newer source. Newer V17.128 toolbar/layout code is retained.

## Final source review

Compared integration application directly with V17.128, rather than only with main's older development file:

- All non-script HTML and CSS are byte-for-byte identical, including the approved fixed toolbar, independent Done button, safe-area layout and Square Footage label.
- All five secondary scripts are byte-for-byte identical, including More disclosure, toolbar collapse/restore, Freehand color/Auto Wall options and newer layout behavior.
- AST comparison: 159 named functions unchanged. Only the old unscoped `scheduleStablePlanFit` disappears; `schedulePlanViewRestore` replaces it with plan/screen/edit-session ownership checks.
- Reviewed changed functions: storage reconciliation and save ordering, view capture/restore, screen/plan/edit transitions, rotation and resize, viewBox updates and navigation release handlers. `renderScene` changes only its viewport preamble; stroke commit changes only capture/restore after release. Camera placement/drag/cones, drawing calculations, measurements, area calculation and cable-route algorithms remain intact.
- V17.128's saved-view retention and Done/Edit preservation are superseded by the scoped screen-anchor controller, not reverted to old fitting behavior.
- Root entry point, every `test/` snapshot (including V17.128), package files and workflows are unchanged against repository baseline.

## Test adaptations

PR #10's viewport suite is retained in full (24 cases). Its three documented fixture corrections are retained. V17.128-specific changes update startup identity and exercise its fixed toolbar, More, collapse/restore and Freehand options instead of asserting obsolete toolbar dragging/scrolling. The landscape touch Area fixture positions the same polygon above the fixed overlay and commits its transform through the zoom controller; six corners, stored coordinates, computed area and reopening remain asserted.

No production behavior is changed to satisfy obsolete tests. No assertion is changed into a skip or an expected failure.

## Validation

Complete automated suite at application commit `3ea5061` on Node 24.22.1 / Linux Chromium 156.0.8078.79:

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`

**125 passed, 3 failed, 1 known-defect expected failure (KD-004 on immutable V17.121), 0 skipped, 0 runner errors; exit 1.** All 24 viewport cases passed within this full run. The three failures are the baseline-reproduced V17.128 layout/toolbar cases below. This is not an all-green suite and remains blocked for merge/release.

`git diff --check` passed. Protected-file diff against `24860223` is empty for all `test/`, root `index.html`, package files and workflows. Final AST/source preservation review passed. Only documentation is changed after the tested application commit.

Earlier exploratory runs were superseded: coordinate taps were initially obscured by the fixed toolbar, and alternate-port runs exposed hardcoded server addresses in existing tests. The final complete run used the standard repository configuration and server, without those exploratory overrides. The restart test now accepts the configured baseURL.

Separate viewport-only run at application commit `3ea5061`:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- viewport-persistence`: **24 passed**, no expected failures, unexpected outcomes, skipped cases or runner errors. This includes actual Chromium process restart.

Baseline comparison used a disposable copy of untouched `test/v17-128/index.html` with the integration tests and standard Playwright configuration. Running `mobile-layout --grep 'navigation survives rotation|fixed toolbar'` reproduces all three layout/toolbar failures:

- Drawn and uploaded safe-area checks: at 915×412 with simulated left/right insets of 24 px, the Plans header ends at x=901, beyond the required right boundary x=891. The strict bounds assertion remains unchanged.
- Fixed toolbar check: after Freehand, `#fspToggleTools` is hidden and cannot be tapped. Trace records repeatedly report “element is not visible”. The test retains the requirement that collapse/restore be accessible.

These are confirmed existing V17.128 limitations. They remain ordinary failures, not skips or newly designated expected failures. Subsequent assertions within these three cases are unrun after the first failure. The integration preserves V17.128 layout code byte-for-byte; no unrelated layout repair is bundled.

## Remaining limits

Physical Android Chrome and iPhone Safari acceptance is unrun: real Done/Edit taps, gestures, orientation/browser chrome, keyboard/safe areas, camera capture, background/termination and reopen require device checks. Linux Chromium touch automation uses mouse activation for viewport mode changes because compatibility clicks after prevented SVG gestures are suppressed; it does not establish real-device tap acceptance.

Legacy view snapshots without screen anchors retain center/scale semantics on first restore. Derived auto-area IDs are still regenerated by the unchanged existing calculation. Broader stale geometry/deletion recovery, large-route performance, cold-start offline delivery and other open checklist items remain outside this viewport integration. See `viewport-persistence.md`, `known-defects.md` and `regression-checklist.md`.

No merge, release, publication or deployment.
