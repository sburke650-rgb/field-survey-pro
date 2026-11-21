# Manual 90-degree content framing repair — draft review

## Source and scope

Base: PR #13's exact source at `9d76522864c4a1a72d8183e3d065fe61cca3e08a`, branch `fix/v17-130-orientation-viewport`. This branch is stacked on that branch so the new PR shows only the targeted manual repair. Neither PR is merged.

The published V17.131 reference at `dbaefaf1fe5976110b35b72d5c238d00e88ce2f8` has identical application scripts, with only its two version labels changed. Reference SHA-256: `f9b07c6d310b0e9ded887b74cd52b5465690d5dabd733db9f609e90fec8220a8`.

Only `rotateVisiblePlan90()` changes in application code. A hash comparison against the approved source excludes precisely this function and checks that every other application byte remains unchanged, including automatic orientation, storage, gestures, layout, geometry, cameras and cable code. No release label, numbered snapshot, production entry point, dependency or workflow changes.

## Reproduction and behavior

In a fresh portrait New Survey → Draw Plan flow, draw a rectangle at the Edit canvas center and press Done. Edit's 412×871 canvas is centered at screen Y 479.5; normal Plans has a 402×783 canvas centered at Y 438.5. Absolute Edit/Done anchoring intentionally preserves the rectangle's screen position, leaving its center 41 CSS px below the normal canvas center.

V17.131 rotates around the plan point under that canvas center. Four accepted manual turns make the rectangle's center orbit left/up/right/back, with alternating clipping, even though the anchored plan point does not drift. The new actual-HTML fresh Draw/Done/rendered-content-center test fails on that unchanged controller.

The approved manual behavior instead keeps the full floor-plan content center at its current client-screen position through a quarter turn. It preserves the existing zoom, including when a rotated rectangle becomes wider than the canvas. There is no fit, recenter, clamp or full-visibility guarantee. The world point under the canvas center can change for an off-center drawing; that is the explicit new manual policy. Automatic orientation retains its original canvas-point policy.

## Implementation

The manual handler reads the union of finite wall extents and existing fitted image bounds. With no content it falls back to the original blank-plan bounds. Cameras, equipment, routes, measurements and area labels do not influence the anchor. The bounds come from full original-plan content, never the clipped visible fragment.

For stored scene pivot P and full-content center B, project B−P through the current scene rotation to obtain vector (x,y). A quarter turn maps that vector to (−y,x). Translate the viewBox by the same delta, (−y−x,x−y), keeping its width and height exactly unchanged. This cancels the anchor's screen displacement without altering P, walls, image coordinates or any other geometry.

Apply and bind the new scene angle before using the existing setViewBox/rememberPlanView path. This avoids treating the intentional manual angle change as an unhandled automatic orientation change. Existing active v2 and portrait/landscape records persist the resulting view; storage formats, clocks and keys are unchanged.

## Tests and compatibility

New actual-HTML tests cover:

- Fresh Draw → Done → four turns and reload, without seeded viewport state.
- Portrait and landscape frames, three zoom setups, centered/off-center drawings, significant explicit pan, all four starting angles and 360-degree return.
- Full bitmap-plus-wall bounds, annotations/camera outliers, empty content, clipping at unchanged zoom and Android-emulated taps.
- Ten complete cycles without cumulative framing drift; per-turn rotation metadata, independently stored inactive orientation and geometry checks.
- Camera and equipment movement, connected route endpoints/bends, drawing coordinates and saved/reloaded views at each angle.
- Actual Chromium process restart retaining a nonzero 270-degree manual view and zoom.

The earlier six manual quarter-turn tests, uploaded-plan manual checks and manual-override checks now assert rendered content-center stability. Automatic-rotation assertions continue to check the original plan point under the canvas center. No automatic assertion, expected-failure annotation or skip is weakened to accept the new manual behavior.

The initial focused run found two fixture errors: equipment lay beyond the canvas after preserving zoom at 0/180 degrees. The interaction setup now explicitly zooms out and asserts both drag points are within the canvas. Application code was not changed to fit those test coordinates.

## Verification results

Environment: Node 24.22.1, Playwright 1.65.1, Debian Chromium 156.0.8078.79. Actual HTML served over loopback HTTP, disposable synthetic contexts/profiles, one worker, zero retries.

- Reproducer before repair: new fresh Draw/Done/manual framing test failed on the approved source.
- Initial expanded focused run: 87 passed, 2 fixture failures, 0 skipped, 0 runner errors; fixture correction described above.
- Final focused suite: **90 passed**, 0 failures, 0 expected failures, 0 skipped, 0 runner errors (29 new manual/source-boundary cases plus retained orientation/persistence/header coverage).
- Complete regression suite: **193 passed, 1 known-defect expected failure, 2 existing unexpected UI failures, 0 skipped, 0 runner errors** (196 cases); exit 1. Both unexpected failures match the unchanged-V17.131 reference: hidden toolbar-collapse control and right-side landscape measurement Done dialog remaining visible. The known expected failure is the immutable published V17.121 KD-004 case.
- Direct unchanged-V17.131 comparison: three selected desired-behavior tests fail on the exact reference bytes: the fresh Draw/Done manual framing reproducer (~41 CSS px), fixed-toolbar collapse timeout, and right-side landscape measurement Done (dialog remains visible). The first is this repair target; the latter two remain unrelated failures.
- Final source/scope and immutability review: passed. The exact application diff is confined to the manual handler; every other application byte matches the approved source. Numbered snapshots, production entry point, workflows, dependencies and fixture data are unchanged relative to the approved base; live V17.131 still matches its reference hash. `git diff --check` passes.

Commands:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test -- tests/manual-rotation.spec.js tests/orientation-viewport.spec.js tests/viewport-persistence.spec.js tests/compact-header.spec.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

## Remaining acceptance

Physical Android Chrome and iPhone Safari acceptance remains unrun. Check repeated manual taps, browser chrome, interrupted gestures, keyboard/safe areas and background/reopening. Linux Android emulation is not physical-phone confirmation.

The existing toolbar-collapse and right-side landscape measurement Done defects remain out of scope and must be compared against the immutable reference and reported separately. The published V17.121 KD-004 reproduction remains an expected failure. Existing area/recovery and broader routing limitations are not repaired. No merge, publication, deployment or production promotion is authorized by this draft.
