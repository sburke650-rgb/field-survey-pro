# V17.130 orientation and rotation repair — draft review

## Reference and boundaries

Reference publication: `fedda622be7d0da055b049214aa942ed282f86a8`, `test/v17-130/index.html`.
The first branch commit copies that file byte-for-byte to `development/index.html` and carries PR #12's integration tests from reviewed commit `44cd9a28db91b09ede5ea1c9dac1daace0301602` (startup label expectation updated to V17.130).
Main still had an older development source/test baseline; this provenance commit is separate from the repair for review.
No published snapshot, root/generic entry point, dependency, hosting configuration, workflow, or production data is changed. The development title is the reference's label, not a newly published release.

## Reproduced causes and repair

V17.130 stores an absolute client-screen origin and units per pixel. Reusing that origin across a portrait/landscape resize leaves the old portrait center near or beyond the new landscape edge. Automatic orientation also rotates the scene without compensating the viewBox. The 90-degree action has the same problem after panning away from the fixed scene pivot. Both orientations overwrite one viewState.

A new actual-HTML Playwright regression failed against the unchanged reference after pan/zoom and a quarter-turn. The repair computes `C' = P + R(delta) * (C-P)` for the viewport center, keeping the same original-plan point at the visible center with unchanged scale. Existing scene and inverse pointer transformations remain intact.

Ordinary Edit/Done, Plans/Camera Survey and same-orientation restoration retain the existing absolute client-origin policy. Only a device-orientation transition, a changed view angle, or recovery of a newer orientation record chooses a compensated center. A transient anchor retains that center through intermediate Android sizes/duplicate events until explicit navigation or a screen/Edit transition. Manual pan/zoom and explicit Fit end the transient anchor. No automatic fit is added.

## Persistence and migration

The active `plan.viewState` remains schema v2 for existing readers, export/import and screen anchoring. An additive `plan.orientationViews` sidecar has `version: 1`, `active: 'portrait' | 'landscape'` and optional portrait/landscape records using the same v2 fields, rotation, pivot, origins, scale and timestamp. Records describe the rotated SVG center; the stored angle reprojects a record when the global manual override changes.

A legacy v1/v2 view has no reliable device-orientation metadata. Preserve it as the initial portrait record, retaining scale and unknown view fields; never infer device orientation from its angle because manual overrides exist. First landscape entry derives a compensated center at the same scale. Portrait v2 opening retains its exact absolute screen anchor. Legacy saves made in landscape cannot be identified reliably; their pose is protected as the initial portrait record and first landscape entry uses its center rather than promising their former absolute screen anchor.

Each orientation reconciles by its own timestamp across IndexedDB, mirror and legacy copies, independently of the globally selected active view. Updated records advance past both the active clock and that orientation's clock. A malformed active view can recover from a valid orientation record. A malformed orientation slot cannot hide another valid slot. Unknown fields are retained through normal writes/backups. Geometry recovery, measurement deletions, selection clocks, storage keys and synchronous background mirror behavior remain unchanged.

Old releases can still read the active v2 view but do not implement independent orientation behavior. This is additive data compatibility, not a backport of the repair to immutable releases.

## Acceptance checklist

- [x] Actual-HTML reproduction on unchanged V17.130 before repair.
- [x] Quarter turns at all four angles, pan offsets and multiple zoom levels in Plans and Camera Survey.
- [x] Automatic orientation and independently saved portrait/landscape centers/scales.
- [x] Drawing and camera inverse-coordinate alignment at all four angles; connected route starts.
- [x] Edit/Done, screen/plan transitions, legacy v1/v2 migration and unknown fields.
- [x] Actual Chromium process restart in both starting orientations with retained storage.
- [x] Final focused run: 61 passed, no failures, skips or runner errors.
- [x] Final full regression results recorded below.
- [ ] Physical Android Chrome and iPhone Safari acceptance: orientation/chrome, gestures, keyboard, safe areas, background/resume.

## Test results and limitations

Environment: Node 24.22.1, Playwright 1.65.1, Debian Chromium 156.0.8078.79; one worker, zero retries; actual HTML served over local HTTP and disposable synthetic browser profiles.

Commands:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- tests/orientation-viewport.spec.js tests/viewport-persistence.spec.js tests/compact-header.spec.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

- Final focused run: **61 passed**, 0 failures, 0 skipped, 0 runner errors. Includes 30 new orientation cases and the retained viewport/header integration tests.
- Initial complete run before the three final edge-case corrections: 158 passed, 1 known-defect expected failure, 2 unexpected failures, 0 skipped, 0 runner errors (161 cases).
- Final complete run: **164 passed, 1 known-defect expected failure, 2 unexpected failures, 0 skipped, 0 runner errors** (167 cases); exit 1. Both unexpected failures are the unchanged-reference UI failures listed below.
- Direct checks against unchanged V17.130 reproduced both unrelated failures below with the same assertions.

Unrelated failures retained as ordinary failing tests:

1. Fixed toolbar collapse/More/Freehand navigation: the `#fspToggleTools` button is hidden; tapping times out after 30 seconds.
2. Right-side measurement dialog in short landscape: tapping Done does not dismiss `#modalBack`.

The original published V17.121 KD-004 stale-measurement reproduction remains an expected failure. No failure annotation, assertion or test skip is added to hide these issues.

The new rotation reproducer failed on unchanged V17.130 before repair. During expansion, an over-precise matrix assertion and an unsynchronized resize sample were corrected to CSS-pixel tolerances/settled layout; no application change was made to satisfy those test mistakes. Three additional edge-case tests failed before their fixes (Fit anchor, future clock, older pivot), then passed in the final focused run. An early overlapping runner invocation caused port/artifact errors; it was discarded and subsequent suites ran sequentially.

After the full run, final test review corrected an equipment-field name in the six quarter-turn geometry assertions (`fspRacks`); those six cases were rerun separately against unchanged application code: **6 passed**, no failures/skips/runner errors.

Final diff review: the baseline copy equals the immutable V17.130 snapshot; repair changes are limited to viewport state/restoration/reconciliation and its additive migration. A static comparison checks unchanged HTML/CSS, the remaining five scripts, and first-script code outside the explicitly scoped viewport regions. Root/generic entry points, every numbered snapshot, fixtures, dependencies and workflows remain unchanged. `git diff --check` passes.

Automated emulation does not establish physical phone acceptance. Android Chrome and iPhone Safari orientation/gesture/keyboard/browser-chrome/background checks remain unrun. Existing unrelated failures remain blockers; this is not an all-green suite or release acceptance. No merge, publication or deployment is authorized by this draft.
