# Move Camera toggle — integration review

## Baseline and scope

Exact base: PR #15 commit `9f207313670a0becee83163ba7970984cd8ef4fd`, branch `fix/layout-only-orientation` (the application source of V17.132). This is a separate branch and stacked draft PR. No earlier PR is merged or modified. The only application target is unnumbered `development/index.html`; base version labels are retained. No phone build is published.

A permanent source boundary compares the entire application against that exact base, permitting only the explicit camera UI/controller, display-preview and tool-cancellation hooks. It separately pins the original survey pan/pinch equations, SVG conversion, pinch initialization and heading smoothing. Rotation, viewport/orientation logic, coordinate helpers/viewBox implementation, viewport persistence/reconciliation, measurements, square-footage calculation and existing save implementation are unchanged. The separate Edit Plan saving regression is not addressed or claimed repaired.

## Behavior

- `Move Camera` is a real toggle immediately beside `+ Camera` in the same toolbar row, outside More and Details. `aria-pressed` and the existing primary style show whether it is active.
- Default **Pan** allows one-finger navigation from background or camera markers/numbers while camera-body movement is locked. Two fingers use the existing navigation math.
- With **Move Camera on**, a direct one-finger drag can move any existing camera, repeatedly, without reactivating the toggle. One-finger empty-space gestures do not pan. Two canvas contacts, including a first contact on a camera, cancel any camera preview and pan/pinch without changing camera coordinates. A canceled drag cannot revive during that contact sequence. A second contact on a cone handle joins navigation before any heading tool can take ownership; dedicated tests cover both modes/layouts.
- Short stationary taps retain selection/cone exposure. The existing 550 ms stationary long press opens Camera Details in either mode; dragging cancels its timer. Details opens with Move Camera off.
- The explicit selected cone handle retains heading adjustment in Pan as in the baseline. Entering that explicit function turns Move Camera off. Existing heading smoothing, FOV rendering and fields are preserved; body touches do not change headings.
- Other controls/tools, Back, survey Done, editor/screen/plan/survey changes, background/pagehide/blur and reopening turn Move Camera off. The mode exists only in memory. Details Done and survey Done retain their existing actions.
- `+ Camera` retains one-camera placement, numbering and New/Existing appearance. It clears Move Camera and pending equipment placement. Entering Move Camera clears pending camera/equipment placement. Equipment/area-label direct interactions and cable-tool ownership retain their existing priority; those are other functions and clear Move Camera.
- The existing toolbar clamp is reused after a toggle so a dragged toolbar stays clear of Done. No canvas sizing or viewport anchoring is replaced.

## Camera and route integrity

Camera/heading drafts live outside survey data. Rendering uses temporary camera values and cloned connected-route first points; the old render-time route-anchor write is suppressed while a draft exists. On a valid terminal release, the camera and all connected route starts are updated synchronously before one call to the existing autosave. Other points, bends, destinations and metadata are preserved. Cancellation, second fingers, lost capture, real layout changes and tool exits discard the preview. Existing background/export/save paths see committed data only. No storage key/schema or save-backend change is introduced.

A long-press reopening failure found during testing was traced to a delayed `fsp-viewport-change` notification after Details closed with an unchanged canvas. The camera-only cancellation hook now checks the actual layout signature before canceling. Two permanent tests cover duplicate notifications in Pan and Move Camera, while resize/release guards retain cancellation for actual layout changes. Approved viewport handlers remain byte-identical.

## Validation

Actual HTML over loopback HTTP, synthetic contexts/profiles, one worker, zero retries, system Chromium selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.

- Before implementation: both default-lock/camera-origin-pan reproducers failed on unchanged PR #15 in portrait and landscape.
- Initial harness corrections: touch coordinate rounding uses a subpixel numeric tolerance; fullscreen-hidden Back/plan-selection controls are invoked through their existing handlers; a canceled touch is not ended twice. No application assertion is removed or converted to an expected failure.
- Final focused run: **94 passed, 0 failures/expected failures/skips/runner errors**. This includes the new mode suite, existing Camera Details, cable-geometry and layout-only viewport tests. No retries.
- Area fixture investigation: one intermediate full run tapped the floating toolbar and activated Freehand, leaving zero trace corners. The screenshot/trace confirmed those hits. No Area application code changed. The test now commits its framing after the Area menu transition and checks each tap hits the SVG, retaining all trace/save assertions. Drawn/uploaded cases passed **6 diagnostic runs** (three each), with zero failures/skips/runner errors. The original uploaded test also passed three runs on unchanged V17.132.
- Final complete regression suite: **257 passed, 1 known expected failure (published V17.121 KD-004), 2 unexpected UI outcomes, 0 skipped, 0 runner errors**, 260 tests in 8.4 minutes. The two unexpected outcomes are exactly the toolbar-collapse and right-side landscape measurement Done failures reproduced on unchanged V17.132. The corrected Area fixture, all new mode checks and the existing camera/route, Details, drawing, measurement, rotation, viewport and recovery cases pass. The command exits nonzero; this is not a green full suite.
- Baseline comparison: the existing toolbar-collapse and right-side landscape measurement Done failures are reproduced separately against exact immutable V17.132 HTML. Original published V17.121 KD-004 remains a known expected failure.
- Final diff/source review: boundary and equation checks pass; `git diff --check` passes. All application changes are camera UI/controller, display-preview and tool-cancellation hooks. Other changes are tests/helpers and these notes. Area test changes are limited to fixture timing and additional hit checks. Root, published snapshots, workflows and dependencies are unchanged. Main remains `ee746bd71ba87c813e0a29bcb1b3a36463c142dd`; PR #15 remains at its exact base and PR #16 remains unchanged. Live V17.132 and V17.133 hashes match their immutable publications.

New permanent coverage includes default camera lock and camera-origin pan; a visibly highlighted toggle horizontally beside Add Camera; repeat moves of multiple cameras per activation; empty-space lock; marker-started two-finger pan/pinch in both modes; long-press Details in both modes; every exit/tool cancellation path; one-shot Add Camera and mutual exclusion; explicit cone adjustment; preview cancellation; actual process restart and reopening; short-landscape Done reachability; real Android-sized CDP single/multi-touch gestures; duplicate viewport notifications; and forced failure of both storage backends without a false Saved status. Existing camera/route tests explicitly enable Move Camera for intentional position changes while retaining their geometry and persistence assertions. Existing long-press Details and cone tests remain unchanged.

## Limitations

Physical Android Chrome and iPhone Safari acceptance remains unrun. Emulation does not establish OS long-press/capture behavior, browser chrome, keyboard, safe areas, hardware Back, camera capture or background/resume on real devices. Hidden fullscreen Back and survey-plan selector paths are tested through the actual DOM handlers; visible Done/More and touch gestures are exercised normally. Existing equipment/area-label/cable priorities are retained.

The separate Edit Plan saving regression remains outside this change; no claim is made that physical-phone saving is fixed. Existing toolbar/measurement UI defects, cold-start offline delivery and broader route/recovery limitations remain. No merge, publication, deployment, production promotion or published-version edit is part of this PR.
