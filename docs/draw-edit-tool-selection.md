# Fix #4 — Draw/Edit tool selection

Branch: `fix/draw-edit-tool-selection`, based on main `2ba7eb3` (includes Fixes #1–#3).
Only the development application, relevant tests and documentation change. Published V17.121 and other published application HTML are unchanged. No V17.122 or release is created.

## Reproduction

Before changing application code, three new ordinary browser tests failed: Edit on a drawn plan, Edit on an uploaded plan, and new Draw entry all reported `data-active-tool="line"` instead of neutral navigation. The source initialized Line globally, marked it primary in markup, and explicitly selected it in both entry handlers.

## Selection contract

- New Draw and every Edit entry start in the existing Select/Pan navigation mode. Pan is not a drawing tool; Line, Freehand, Measure and area tracing are unselected.
- The static Line highlight is removed so the toolbar cannot briefly imply an automatic selection.
- Existing primary/outline/color styles indicate the selected tool. The same state updates `aria-pressed` and the existing canvas `data-active-tool`; no buttons or layout are added.
- Line and Measure retain their existing toggle-to-Pan behavior. Freehand retains its existing selection behavior. Re-entering Edit always resets to neutral, regardless of the last selected tool.
- Explicit measurement workflow choices still select Measure. Saving a new measurement continues that explicitly chosen Measure mode, as before.
- Returning from tracing or choosing Back to Sketch does not activate Line. Sketch Only retains an already explicitly selected Line/Freehand mode rather than silently switching Freehand to Line.
- Changing mode cancels an unfinished drawing/measurement gesture and clears its preview. A later pointerup cannot commit a stale stroke. Pointer releases after leaving the editor/screen are ignored by the drawing handler.
- Wall creation is explicitly restricted to selected Line/Freehand modes. Their coordinate capture, snapping, colors, geometry, measurement, Undo and save implementations are unchanged.

Neutral mode retains existing selection behavior: for example, tapping an existing wall can open its existing color menu. That menu is not a drawing mode and makes no changes until an explicit action. This repair does not redesign menus or Back/Cancel discoverability.

## Data compatibility and scope

Tool state remains runtime presentation state. No new persisted fields, storage keys, backup schema, migrations, measurement units or IDs are introduced. Existing survey geometry/images/cameras are preserved during neutral navigation; intentional drawing and Undo still use the existing save paths.

## Automated coverage

`tests/tool-selection.spec.js` covers:

- Neutral entry on drawn and uploaded plans, plus new Draw.
- Mouse pan/tap with changed viewport but unchanged walls, measurements, image and cameras.
- Explicit Line/Freehand selection and switching, active-state/pressed-state indicators, drawing, Undo, toggling Line off, Done, autosave and reload.
- Explicit Measure selection, distance saving, continued Measure mode, toggling off and measurement Cancel without wall changes.
- Deselect, Done and visible Back activated by keyboard while a pointer stroke is unfinished: releasing it must not commit a wall.
- Actual synthetic PNG import/crop confirmation, neutral uploaded-plan editing, explicit drawing, save/reopen and unchanged imported image.
- Chromium touch pan/pinch in neutral mode on both plan types without geometry changes.
- Back to Sketch returning to neutral and Sketch Only retaining an explicitly selected Freehand tool.

The two original KD-003 tests remain and now run as ordinary passing tests, with no expected-failure annotations. No known-defect regression is removed or skipped. The complete regression suite includes Fixes #1–#3.

## Full local results

Command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.
72 tests executed: 71 passed, 1 explicit expected failure, no unexpected outcomes, skips or runner errors. The only expected failure is the deliberately retained KD-004 reproduction on published V17.121. Both KD-003 development regressions now pass normally. This is local Chromium evidence, not remote CI or physical-device certification.

## Remaining limitations

- Chromium mobile emulation is not physical Android/iPhone acceptance. Real-device tool taps, interrupted/multiple-pointer sequences, keyboards, orientation and background/resume still need that acceptance.
- Interrupted-stroke exit tests use keyboard activation while a pointer is held. This exercises the app's cancellation contract, not every phone multi-touch timing combination.
- Existing area-entry reachability limitations are unchanged. Tracing completion's neutral return is source-reviewed; this task does not certify the previously inaccessible full area-tracing UI workflow.
- Existing navigation/toolbar layout, wall-color menus and unrelated known issues are not redesigned here.
- Neutral navigation deliberately changes the saved viewport through existing autosave behavior; it does not change plan geometry or the survey format.
