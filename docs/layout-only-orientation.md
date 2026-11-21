# Layout-only physical orientation — draft review

## Starting point and audited policy decision

Base: PR #14, branch `fix/manual-90-content-center`, exact commit `8f3f6632ff7e24e88161b9495fdea88952a05036`. This is a separate branch and stacked draft PR; neither earlier PR is merged. No release label or published entry point is changed.

The audit found two conflicts with the approved layout-only behavior:

1. With no manual override, `planRotationDegrees()` derives 0/90 degrees from physical device orientation. A media change therefore turns the scene.
2. `restorePlanView()` selects the destination orientation's stored pose, which can have a different center, zoom and angle frame. Restoring that pose cannot simultaneously carry the currently viewed work area and zoom through resizing.

The policies can coexist with one angle authority and one current resize pose. Explicit manual rotation remains authoritative; otherwise retain the current saved angle, with 0 degrees for a genuinely new plan. On a physical layout crossing, carry the active view's center and units-per-pixel. Preserve both orientation records as compatible save/recovery snapshots, but do not use a device turn as an instruction to switch to an old destination view. Old distinct per-orientation zoom/position auto-restoration is intentionally replaced by latest-view carry, as required by the approved behavior.

A third save-order issue had to be handled: media events may arrive before the canvas dimensions change. An orientation-record switch must advance the active timestamp even when all geometric pose fields remain identical. Otherwise an incoming record with a higher old timestamp could later win reconciliation and restore the wrong work area. The timestamp must advance beyond the previous active view and the destination record.

Two actual-HTML regressions reproduced the old conflicts before implementation: automatic scene rotation during a physical resize and a stale destination record changing the current view.

## Small implementation boundary

Application changes are confined to the angle resolver, orientation-change detection in viewport capture, and destination selection during restoration, plus one explanatory comment:

- `planRotationDegrees()`: manual override, else valid active saved rotation, else 0. Device orientation no longer supplies a scene angle. A legacy saved 90/180/270-degree view remains at that saved angle rather than being reset when opened in another layout.
- `restorePlanView()`: a physical orientation crossing uses the current active view, not the destination snapshot. Existing center compensation adapts viewBox dimensions at unchanged units-per-pixel. Existing same-orientation recovery of a newer valid record remains available.
- `rememberPlanView()`: changing the active orientation key counts as a write even if dimensions have not changed yet. The existing per-view clock calculation advances past the destination's old timestamp.

No schema, key, backend-write, merge, geometry, image, CSS/layout or gesture changes are introduced. Current `viewState` v2 and `orientationViews` v1 remain readable/exportable/importable; unknown record fields are preserved. Outgoing snapshots are retained, and the incoming snapshot receives the carried current pose. Same-orientation screen/Edit/Done transitions retain the original client-origin anchoring and existing gesture deferral.

The PR #14 manual handler remains byte-identical. It still preserves full floor-plan content center at its current screen position and keeps zoom unchanged. Physical resizing instead preserves the plan point at the viewport center and the zoom; a wider/shorter canvas naturally reveals/crops different extents. There is no auto-fit or full-visibility guarantee.

Camera single-finger manipulation, background navigation, and two-finger plan pan/pinch code are unchanged. Actual touch tests check that camera dragging does not pan the plan and that two-finger navigation does not change camera/equipment/route geometry.

## Actual-HTML coverage

New tests cover:

- Portrait → landscape → portrait with current work area, angle and zoom retained, including intentional pan/zoom between layout changes.
- All four legacy saved angles, null manual overrides, both starting layouts, and a new blank plan created in landscape at 0 degrees.
- PR #14 manual quarter-turns before/after resizing in Plans and Camera Survey, including a closed 360-degree framing cycle.
- Conflicting destination records with different centers, zoom and angles; preservation of unknown fields.
- Media-before-layout ordering without a geometric pose change, a future-dated destination clock, and cold reopening with a stale IndexedDB/legacy copy versus a fresh mirror.
- Single-finger camera dragging, two-finger pan and pinch, portrait/landscape round trips, reload and geometry preservation in Android-sized touch contexts.
- Edit/Done anchors, drawing-coordinate alignment after resize, and an actual Chromium process restart into the opposite layout after manual rotation and a new pan/zoom.
- A strict whole-application hash boundary permitting only the three named functions/comment, and an exact PR #14 manual-handler hash.

Existing tests that required device-driven 90-degree rotation or restoring a different old orientation pose now assert the approved no-rotation/latest-view policy. Their geometry, save/reload, backend freshness and interaction assertions remain. The rectangle-at-90-degree fixture now explicitly presses the manual button rather than relying on device orientation. The Freehand/Sketch Only six-sided L fixture is placed clear of the floating toolbar, with each stroke start hit-tested against the actual SVG; its modal, selected-tool and six-wall assertions remain unchanged. No expected-failure annotation or skip is added to hide a failure.

## Verification

Environment: Node 24.22.1, Playwright 1.65.1, Debian Chromium 156.0.8078.79; actual HTML over loopback HTTP, disposable synthetic profiles, one worker, zero retries.

- Before implementation: both new policy regressions failed on unchanged PR #14 source.
- Focused suite: **109 passed**, 0 failures, 0 expected failures, 0 skipped, 0 runner errors (19 new layout/source-boundary cases plus retained manual/orientation/persistence/header tests).
- Unchanged V17.131 comparison: both selected existing UI regressions fail on exact immutable reference bytes (`f9b07c6d310b0e9ded887b74cd52b5465690d5dabd733db9f609e90fec8220a8`): hidden toolbar-collapse control and right-side landscape measurement Done dialog remaining visible.
- Initial complete regression run: 211 passed, 1 known expected failure, 3 unexpected failures, 0 skipped, 0 runner errors. Two were the existing UI failures above. The third was a test-fixture collision introduced by the approved framing change: the original Freehand L's last start point at screen (139, 685) hit the unchanged Auto Wall button, leaving five walls and no irregular-shape dialog. The original test passes against unchanged V17.131. Moving that six-sided fixture into unobstructed canvas space and adding per-stroke SVG hit checks passes, with the original tool/modal/wall-count assertions intact. No application repair was made for this fixture failure.
- Final complete regression suite after the fixture correction: **212 passed, 1 known-defect expected failure (published V17.121 KD-004), 2 unexpected outcomes, 0 skipped, 0 runner errors** out of 215 tests, in 7.6 minutes. The two unexpected outcomes are exactly the pre-existing toolbar-collapse and right-side measurement dialog cases reproduced against unchanged V17.131 above. The command exits nonzero; this is not a green full suite. All new layout-only cases and retained manual, orientation, camera, geometry, drawing, recovery and viewport-persistence tests pass.
- Final diff review: application bytes outside the three approved functions and one comment match exact PR #14 source; the manual rotation handler matches byte-for-byte. Tests/documentation account for all other changes. `git diff --check` passes. Root, prior test snapshots, workflow and dependency files are unchanged. Remote PR #14 remains draft/unmerged at `8f3f6632ff7e24e88161b9495fdea88952a05036`; main and the latest built Pages commit remain `dbaefaf1fe5976110b35b72d5c238d00e88ce2f8`. The live V17.131 SHA-256 still matches the immutable reference above.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- tests/layout-only-orientation.spec.js tests/orientation-viewport.spec.js tests/viewport-persistence.spec.js tests/manual-rotation.spec.js tests/compact-header.spec.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

Physical Android Chrome and iPhone Safari acceptance remains unrun. Browser chrome, safe areas, keyboard, interrupted gestures and background/resume require real-device acceptance. The unrelated toolbar/measurement defects, original published V17.121 KD-004 expected failure, and previously recorded area/recovery/routing limits are not repaired here. Old releases retain their old orientation behavior; this change is not published or backported to V17.131.

No merge, publication, deployment, previous-version modification or production promotion is authorized by this draft.
