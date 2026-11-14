# Fix #3 — movable Camera Details

Branch: `fix/camera-details-drag`, based on main `ecac6a1` (includes Fixes #1 and #2).
Only the development application, tests and documentation change. Published snapshots and application entry points are unchanged. No V17.122, release or deployment is created.

## Reproduction and scope

The new KD-002 browser test failed before the repair: dragging the header changed no rendered panel coordinates (measured displacement: zero). Positional `!important` CSS overrode the existing inline drag coordinates. The old handler also cached area bounds at pointerdown and did not re-clamp on viewport changes.

The repair removes the conflicting positional priorities, retains the existing panel dimensions/appearance, and lets the positioning handler control left/top. No markup, camera controls, buttons, labels or data formats are redesigned.

## Position and gesture policy

- Only a noninteractive header target begins a primary-pointer drag. Buttons and fields are excluded; secondary mouse buttons and extra nonprimary pointers do not start another drag.
- Mouse/pen pointers capture their initial header target. Touch uses the browser's implicit capture on that target. A pointer ID and header offset are retained for the active drag.
- Bounds are recomputed on movement, not cached. The panel is constrained to the intersection of the survey area and visual viewport, with a small inset.
- Width/height caps let the panel shrink to available space while retaining internal scrolling. Resize/orientation, visual-viewport resize/scroll, and area/panel resize observations re-clamp the open panel.
- Pointerup, pointercancel and lost capture clear drag state. Programmatically closing releases any active capture and clears pending button-tap state.
- Drag coordinates are presentation state only; no survey, camera, cone, wall, route or persisted viewport coordinates are changed by panel movement.
- Existing initial placement near the selected camera is retained, then clamped. Panel positions are not persisted; reopening chooses a position again as before.

## Touch controls and scrolling

During local Chromium testing, a button received uncancelled touch start/end after a header drag without the compatibility click being emitted. This was observed separately from the positional CSS defect; the precise browser-internal cause was not established.

The panel now uses a scoped, qualified touch-button activation path. A single-contact tap on an enabled button must end on that button within a ten-CSS-pixel movement allowance, with no active drag. Only then is the cancelable touchend consumed, the button focused without scrolling (preserving field blur/change behavior), and its existing click handler activated once. Cancelling the compatibility click avoids duplicate activation. A click already delivered clears the pending touch state. Touch/pointer cancellation and movement clear eligibility.

Mouse and keyboard activation keep their existing handlers. Text inputs, textareas, panel padding and scrolling gestures do not have their default behavior prevented. Tests cover body scrolling without camera/status changes and exactly one touch activation after dragging.

## Regression coverage

`tests/camera-details.spec.js` covers:

- Actual panel displacement and unchanged camera/cone/scene/viewport/saved survey during mouse dragging.
- All screen edges in portrait and landscape.
- Resize/orientation and a constrained short viewport, with Done remaining accessible.
- Camera number, New/Existing status and notes editing after movement; persistence, Done and Close.
- Number swap cancellation/confirmation and Delete Camera cancellation/confirmation.
- Mouse-wheel and native touch-sequence body scrolling without panel or canvas movement.
- Touch opening, header dragging in the intended direction, boundaries, and Close in both layouts.
- Touch activation exactly once, field blur/save behavior, and touch cancellation followed by another drag.

The original KD-002 regression remains, now as an ordinary passing assertion. Its test drag moves toward available space so boundary clamping does not invalidate a movement test. No known-defect test is removed or disabled. Other known-defect annotations remain.

## Full local results

Command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.
57 tests executed: 54 passed; 3 explicit expected failures; no unexpected outcomes, skips or runner errors. The expected failures remain the published KD-004 reproduction and the two KD-003 Draw/Edit checks. KD-002 is now an ordinary passing test. These are local Chromium results, not remote CI or physical-device certification.

## Remaining acceptance work

- Chromium mobile emulation and CDP touch input are not physical Android Chrome or iPhone Safari certification. Real-device keyboard behavior, pinch/zoom, browser chrome, safe areas and background/resume remain unrun.
- Visual-viewport handlers are implemented; real soft-keyboard and pinch-pan behavior still require those device checks. Automated viewport resizing is not a keyboard test.
- The panel remains a scrollable panel with the same header and controls; users may need to scroll back to its header after scrolling the body. No sticky-header redesign was introduced.
- The drag supports one primary pointer. Concurrent independent background gestures are not a new supported interaction mode.
- No persistent-data or backup migration is introduced by this repair. Existing unrelated known defects remain out of scope.
