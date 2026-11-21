# Camera interaction controller — integration review

## Baseline and boundary

Exact base: PR #15, `fix/layout-only-orientation`, commit `9f207313670a0becee83163ba7970984cd8ef4fd`. This integration branch is stacked on that PR. It does not merge or modify PRs #13–15. The editable target remains `development/index.html`, with the base's existing version labels; this is not a numbered release or publication.

`tests/helpers/camera-source-boundary.js` pins every PR #15 application byte outside the explicit camera UI/controller/rendering hooks. It separately pins the existing survey pan/pinch equations, SVG navigation conversion, pinch initialization and cone-heading smoothing. The approved viewport/orientation controller, manual 90-degree handler, drawing controller, coordinate conversion, viewBox functions, persistence reconciliation, schemas and storage keys are unchanged. Root, published snapshots, workflows and dependencies are unchanged.

## Reproductions and implementation

Before implementation, actual-HTML tests failed for Navigate swiping from a camera without moving/selecting it, and stationary tap-to-Details. The prior audit also reproduced second-finger rejection, a background save persisting a canceled camera preview, and an under-threshold cone adjustment entering storage on a later save.

One `bindSurvey()` controller now owns camera-screen navigation, camera taps, pending holds, position previews and explicit cone-handle previews. The previous competing camera and navigation handlers are replaced. Equipment and area-label handlers remain scoped exceptions; cable routing and equipment placement retain their existing ownership.

- **Navigate** is the transient default on entry/reopening. A swipe from background, camera/number or cone handle navigates; it does not move/select a camera or change its heading. A short stationary camera tap selects and opens the existing Details panel.
- **Move Camera** is an explicit toolbar mode. Entering Move Camera cancels pending New/Existing camera or equipment placement. Activating Add Camera also cancels pending equipment placement; screen/plan transitions clear it. Camera body presses arm after 550 ms with an 8 CSS-pixel tolerance. An early swipe cancels the timer and navigates. Arming highlights the camera without changing its Existing/New color. Captured inverse coordinates and the original grab offset drive the preview while plan navigation is locked.
- The explicit cone handle can preview heading only in Move Camera. Existing smoothing and FOV rendering/types are retained; no FOV schema fields are added. Small movement does not alter the angle.
- **Move Mode Done** returns to Navigate on the same screen. Existing survey Done and Details Done controls retain their behavior. The existing toolbar clamp is called after a mode change so a previously dragged toolbar can accommodate its new control height.
- Second canvas contacts discard pending/active camera work and initialize the original two-finger navigation equations from the current view and contacts. Third contacts pause navigation; returning to two rebases the pair without reviving a camera gesture. Existing two-to-one navigation release behavior is retained, with no camera re-arm during that sequence.
- A second contact outside the canvas cancels the camera draft without taking ownership of toolbar/Details controls. Equipment/label hits cancel the camera draft and retain their scoped interaction ownership.

All draft coordinates and gesture flags live outside survey data. `cameraForDisplay()` and `routeForDisplay()` create display-only views. While a camera draft exists, the legacy render-time route-anchor write is suppressed. Connected route preview endpoints are cloned; unrelated route points/metadata are not changed.

On a valid terminal release, only the camera position or heading is committed. A position commit updates every connected route's first point, preserving its unknown endpoint fields and all remaining points, bends, rack destinations and metadata. The camera and endpoints are updated synchronously before one `touch()`/autosave. Terminal release coordinates are sampled even without a final move event. Cancellation discards the draft without committing camera/route geometry or requesting a camera save. Legitimate navigation/background saves continue through the existing persistence code and see committed geometry only.

Tool/control changes, plan/screen transitions, pointer cancellation, lost capture, blur/background/pagehide, resize and manual rotation cancel drafts/timers. The existing `cancelSurveyViewGesture` transition hook now clears the whole camera controller and resets its mode. Timers validate their original press, plan and camera identity. Layout signatures are checked before arming/updating/releasing: this closes a reproduced race in which release arrives after layout changed but before the resize event.

## Validation

Actual HTML over loopback HTTP; synthetic disposable contexts/profiles, one worker, zero retries. System Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.

New controller coverage includes Navigate tap/pan/hold, Move hold/early swipe/jitter/grab offset/Done, four angles, preview rendering versus persisted geometry, one-save release, connected/unrelated routes and metadata, cone lock/preview/cancel/commit, all cancellation paths, second contacts during pending/armed/moving phases and on another camera, outside contacts, third fingers, terminal coordinates, stale timers, export/background/restart, offline valid commits, New/Existing placement and numbering, Details swaps/type/notes/delete/cancel, equipment/area-label exceptions, and short-layout toolbar reachability.

Existing camera movement tests now explicitly enter Move Camera and wait for arming. Existing long-press-Details tests use short taps. Their geometry, viewport, route, storage, panel scrolling/dragging and bounds assertions remain. The source guards now allow exactly the approved camera changes while pinning the frozen PR #15 viewport code. No expected-failure annotation or skip is added to hide a failure.

- Before implementation: both initial Navigate/tap reproducers failed on unchanged PR #15.
- Broader focused suite: **193 passed, 1 known-defect expected failure (published V17.121 KD-004), 0 unexpected outcomes, 0 skipped, 0 runner errors**, 194 tests.
- Final controller suite: **47 passed, 0 failures/expected failures/skips/runner errors**, including uncaught-error checks, actual canvas-only resizing, all connected routes, numbering swaps/deletion, and pending camera/equipment placement handoffs; no retries. The intermediate full run was deliberately interrupted for that ownership correction; the final full run starts after these 47 checks pass.
- Final complete regression suite: **259 passed, 1 known-defect expected failure (published V17.121 KD-004), 2 unexpected UI outcomes, 0 skipped, 0 runner errors**, 262 tests in 8.8 minutes. The command exits nonzero. The two unexpected outcomes are exactly the toolbar-collapse and right-side landscape measurement Done cases reproduced against unchanged V17.132; all controller, Details, camera/route geometry, drawing, orientation, manual rotation, recovery and viewport-persistence cases pass. This is not a green complete suite.
- Unchanged V17.132 comparison: both selected existing UI failures reproduce against exact immutable V17.132 HTML: hidden toolbar-collapse control (`mobile-layout.spec.js:124`) and right-side landscape measurement Done leaving its dialog visible (`mobile-layout.spec.js:171`).
- Original published V17.121 KD-004 remains an expected failure; development recovery tests remain ordinary passing tests.
- Final diff/source review: the camera boundary and exact navigation/heading checks pass; `git diff --check` passes. All application changes are camera UI/controller, display-preview, and tool-lifecycle hooks. Other changed files are tests and these review notes. Root, published snapshots, workflows and dependencies match the exact base. Remote main remains `feb1f76ca8b0e06cf9650d7b0d2b34091dec2df4`; PRs #13–15 remain draft/unmerged at their original heads. Live V17.132 retains SHA-256 `a860fcc158a1d1c9d3bbf0328db86d9c9f5746bff7ffeefda33351af4ff0e10d`.

## Risks and remaining acceptance

Physical Android Chrome and iPhone Safari acceptance is unrun. Headless touch emulation does not establish real long-press timing, pointer capture, browser interruption, keyboard/browser-chrome/safe-area behavior or background/resume handling on those devices. Mouse and Android-sized CDP touch paths are automated; hardware camera capture is not exercised.

Equipment/area labels and explicit cable/placement tools intentionally retain their existing gesture priority. This is not a global redesign of those tools. Cold-start offline app delivery, broader existing recovery/route limitations, and the two pre-existing UI defects remain outside this change. Existing camera deletion behavior is retained; no route-deletion policy is introduced.

No merge, publication, deployment, production promotion or published-version edit is part of this integration PR.
