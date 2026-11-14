# Fix #6 — Mobile toolbar accessibility and screen overlap

Development base: `main` merge `d773e3b`, including Fixes #1–#5. Branch: `fix/mobile-toolbar-accessibility`. Only the unnumbered development application, regression tests and documentation change. No numbered version or release.

## Before and after

Before modifying the application, new browser assertions reproduced canvas/header overlap at 412×915, 915×412 and 740×320 CSS pixels; the uploaded-plan More control was hidden, and a portrait area dialog exceeded a simulated visual keyboard viewport. A separate run against an untouched temporary copy of `d773e3b` confirmed cable-toolbar/survey-Done intersection. The initial cable-menu locator included an obsolete version suffix; the corrected baseline run reached and failed the geometric intersection assertion.

The repair keeps existing controls, labels and workflows:

- The editor header and Done footer occupy reserved layout rows. The SVG workspace fills the remaining space. The toolbar occupies one compact horizontally scrollable row, with its existing collapse/restore control. Secondary drawing controls are reachable through scrolling rather than permanently hidden. Back remains the existing header control. Empty new plans and untouched existing plans can finish normally.
- The existing editor-toolbar drag handle remains functional, bounded between the header and Done footer. Viewport changes restore its docked position. Camera toolbar dragging is bounded below Rotate and above survey Done, with internal scrolling on short screens. Hidden/restored camera toolbars are refitted when visible.
- Cable controls scroll horizontally above survey Done rather than covering it. Existing Cable Done and survey Done retain their respective actions.
- Endpoint adjustment retains its own Cancel and Done while the normal drawing controls are inactive, as before. Help is scrollable within the workspace.
- Camera Details keeps its existing header drag behavior; its header/Close and bottom Done row remain available while its fields scroll.
- One viewport controller replaces the two older landscape keyboard controllers. It uses `visualViewport` width, height and offsets in both orientations, with window-size fallback. Layout follows browser chrome, orientation and keyboard changes without writing geometry.
- `viewport-fit=cover` and CSS safe-area insets keep controls within the usable rectangle. Dialog bodies scroll separately from their action row, retaining input and Cancel/Save access. Older competing landscape keyboard CSS was removed.

The editor intentionally trades roughly one header row and two compact action rows for an unobstructed canvas. At 740×320, the workspace remains over 100 CSS pixels tall. With the keyboard open, input and completion/cancellation take priority over canvas space. Modal dialogs intentionally block the underlying editor and provide their own dismissal/completion controls; this is retained modal behavior.

## Data and compatibility

No persistence, autosave/reconciliation, import/export, camera/cable geometry, area formula, coordinate conversion, or schema changes. Structured points, measurement units/provenance, stable survey/equipment/camera/route relationships, and unknown backup fields are retained. View transforms remain separate from plan-space geometry. Tests compare stored walls, dimensions, areas, cameras, equipment and routes before/after viewport changes and check saved reopening.

One pre-existing behavior was exposed by the stricter comparisons: drawn-plan Done recalculates its derived `auto-drawn` area and replaces that area's ID via `Object.assign(old, check.area)`. This function is unchanged. Tests require exact equality throughout layout changes, then compare the completed snapshot with its reopened copy. Stabilizing derived auto-area IDs is a separate follow-up, not part of this layout repair.

## Automated evidence

`tests/mobile-layout.spec.js` adds 15 tests using Chromium mobile touch emulation, Android user agent and device scale factor 2.625. Viewports include 360×640, 412×915, 915×412, 740×320 and 640×280. Coverage includes:

- Rendered header/canvas/control separation and minimum workspace height; element hit testing, trial taps and actual actions rather than visibility alone.
- Drawn/uploaded and empty-plan entry; unchanged neutral Pan behavior; Done with no edits and Back.
- Real simulated touch scrolling, collapse/restore, bounded toolbar dragging, viewport/orientation changes and safe-area constraints.
- Camera/More/Cable accessibility, cable/survey Done separation and camera-toolbar restoration.
- Portrait/landscape Area input/save/reload under keyboard conditions; measurement endpoint Cancel/Done and distance entry; Camera Details long-press/input/Close/Done.
- Stored geometry preservation and uncaught browser error checks. Representative editor screenshots are attached to the test report.

Keyboard coverage deliberately overrides `visualViewport` in disposable test contexts so it can shrink/move independently of the layout viewport. Safe-area tests set the same CSS variables whose production defaults read `env(safe-area-inset-*)`. These are controlled simulations, not evidence of real OS keyboard/notch behavior.

Final command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.

- **102 executed: 101 passed, 1 retained expected failure** (KD-004 against published V17.121).
- **0 unexpected failures/outcomes, 0 skipped, 0 runner errors.** All 15 mobile tests and the existing development regressions pass.
- All 43 published HTML files byte-compared unchanged against `origin/main`. No V17.122 directory. Inline JavaScript passed `node --check`; `git diff --check` passed.
- Storage/reconciliation, area arithmetic, `refreshAutoArea()` and coordinate/drawing/gesture code were compared unchanged with main. Representative short-landscape screenshot was visually inspected as well as asserted.
- Local Chromium only; GitHub Actions status is separate and unverified. No physical-device acceptance performed.


## Physical-phone acceptance still required

- [ ] Android Chrome on a real phone: portrait/landscape, URL bar expanding/collapsing, gesture/three-button navigation, notch/cutout and safe-area behavior.
- [ ] iPhone Safari: both orientations, safe-area/home indicator, dynamic browser chrome and keyboard offsets.
- [ ] Numeric/text keyboards: Area, measurement, notes and camera number; focus the last field, save/cancel, dismiss keyboard, rotate with keyboard open.
- [ ] Draw/Edit Back/Done with no changes, tool scrolling/collapse/drag, Measure/Area/Undo and uploaded More; no accidental walls or corner additions.
- [ ] Camera placement, camera/cone dragging, Details drag/scroll/Done/Close, Cable Routes, equipment movement and shared routes.
- [ ] Background/resume, offline edits, autosave, retained-storage reopening and backup round trip using synthetic surveys.

No physical phone or Safari engine was available for this task. Extremely small visible viewports, accessibility font scaling, floating/split keyboards and vendor keyboard animation timing remain manual acceptance items. No release acceptance is claimed.

## CI follow-up — run 43633907555

The user reported a failure in “uploaded More, Measure, Area and Undo are reachable without expanding a hidden control” at the helper's one-shot center/visual-viewport hit check.

### Evidence and limits

`gh run view 43633907555 --log-failed` and `gh run download 43633907555 --name regression-results` both returned Forbidden. The workflow web page required sign-in to view logs; its artifact fragment supplied no usable download. The environment also denied the Playwright-pinned Chromium download (`cdn.playwright.dev`, HTTP 403). No claim is made that the original GitHub trace was inspected or that its exact failing control is identified. Correlation with that specific CI failure remains unverified until those artifacts or the rerun results are available.

The unchanged reported test passed 20 local repetitions; its sequence also passed 30 standalone Chromium repetitions with 6× CPU throttling. This did not establish an arbitrary render delay as the cause. Further local investigation found a real, reproducible sibling-occlusion defect: the sticky collapse button painted over toolbar controls scrolled to the left edge. Native `scrollIntoViewIfNeeded()` did not move a fully visible control away from that overlapping sibling.

A new regression failed before the product change, with this local trace evidence at 360×640:

- Target: `areaTool`, rectangle left 17.53125, right 57.046875, top 542, bottom 578.
- Center: (37.2890625, 560), entirely within the visual viewport.
- `elementFromPoint()` returned `fspToggleTools`, not Area.
- Toolbar scrollLeft: 524. The overlap persisted across rendering frames and native scroll-into-view.

The local failure trace and its screenshot were inspected. This confirms real occlusion, not an overly strict assertion. The original CI failure is consistent with this defect, but its trace is required to establish the exact same cause.

### Correction and assertion protection

The collapse button now scrolls normally with its row rather than remaining sticky over adjacent tools. Back and Done retain their reserved layout rows. No new controls, survey geometry or persistence changes.

The helper still requires the exact center to be inside the visual viewport and hit the target or its descendant, followed by an unforced trial tap. It polls that same condition for up to three seconds to accommodate asynchronous scroll/paint/visual-viewport updates. It never substitutes a convenient visible point or drops hit testing. Failures attach bounded JSON samples containing the selector, hit element, rectangles, viewport offsets and scroll-container state; transient false-to-true samples are attached as well. The assertion message identifies the specific selector. Runner retries remain zero.

Three new browser regressions cover a real left-edge toolbar control, rejection of a persistent rendered occluder, and successful interaction after a transient rendered occluder clears. The new helper was also run against an untouched temporary copy of `7f91ef2`: the left-edge regression still failed after polling. Thus waiting does not conceal the product defect. On the correction, all 18 mobile tests passed, including actual Area-menu entry.

Final correction validation: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test` executed **105 tests: 104 passed, 1 retained expected failure (published KD-004), 0 unexpected outcomes, 0 skipped, 0 runner errors**. All 18 mobile tests passed. All application JavaScript and all 43 published HTML files compared unchanged with `7f91ef2`; `git diff --check` passed. No V17.122 or dependency changes.

The ordinary reported test passed 20 repetitions before correction; the deterministic edge regression failed both before correction and with the revised strict polling helper against the old product, then passed on the correction. GitHub CI rerun/trace access and physical-device confirmation remain unverified and separate from the local result.
