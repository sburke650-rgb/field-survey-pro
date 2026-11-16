# Viewport persistence repair — development only

Audit baseline: V17.128 at `24860223f1575be60948eca3050f7fd8b025a8ea`.
Integration target: `development/index.html`, first copied byte-for-byte from `test/v17-128/index.html` at the audit baseline, then patched with PR #10 viewport fixes. This is a separate development branch, not a release. The V17.128 snapshot and every other published HTML remain unchanged. The V17.128 title and labels are retained to identify source ancestry.

## Reproduction and causes

The unchanged V17.128 browser audit reproduced a 7 px vertical movement on Edit entry at 412×915 (4 px at 1100×850), reversed on Done. Scale and ordinary reload were stable in that fixture. A conflicting-storage reproduction selected an older IndexedDB center/scale over a newer mirror. A desktop resize also reproduced a scale reset.

Development predates those V17.128 transition changes. New desired-behavior tests failed before implementation: both desktop/phone-sized Edit transitions refitted and changed scale; startup discarded a saved drawn-plan viewport.

The contributing paths were implicit rendering/transition fits; canvas-center rather than screen-position persistence; changing rotation pivots as geometry bounds grew; backend-priority viewport reconciliation; capturing viewport after queuing wall snapshots; asynchronous mirror writes that could overwrite a newer pagehide flush; shared zoom flags across plan changes; orientation resets; and callbacks without plan/session ownership.

## Implementation

- Capture and restore the transform mapping plan content into client-screen coordinates, including the canvas's offset. Different editing/viewing canvas bounds no longer move content. Preserve scale instead of fitting to new bounds.
- Track which plan owns each canvas's applied view. Restore the selected plan on switching and share that plan's view across Plans and Camera Survey.
- Initialize by fitting only if no valid view exists, or when Fit is explicitly requested. Ordinary rendering keeps the established transform.
- Keep a stable rotation pivot in viewport metadata. Explicit and automatic rotation retain scale; ordinary canvas resize restores the saved screen anchor. Device-following uses the orientation media query rather than the plan canvas's layout dimensions. Manual overrides remain plan-local.
- Observe real canvas size changes; restore before paint when possible and scope deferred work to the selected plan/screen/edit session. Defer restoration while a gesture is active, then retry after release/cancellation, including no-movement presses whose tool handlers return early. Cancel outgoing navigation gestures when changing plans/screens, so their pointers and callbacks cannot affect the next plan.
- Capture the viewport before serializing a save. Write and read back the latest localStorage mirror synchronously, then serialize IndexedDB writes. Older queued operations never write the mirror. Background/pagehide also captures an unfinished navigation gesture before flushing.
- Done waits for concurrent queued saves and verifies its original plan/edit session before exiting. Resize callbacks do not invalidate that session.
- Guard lifecycle saves until startup reconciliation has completed, so a background event during IndexedDB initialization cannot overwrite the mirror with the initial empty state.
- Preserve viewport through wall recovery. Reconcile valid viewports by their own save timestamp and carry the matching rotation override with the winning view, independently of geometry reconciliation. A separate per-view selection clock restores the last selected survey/floor when IndexedDB still contains an older selection.

## Viewport schema and compatibility

The optional `plan.viewState` now has `version: 2`. It retains the existing `cx`, `cy`, `unitsPerPixel`, and `rotation` fields and adds:

| Field | Meaning |
| --- | --- |
| `originX`, `originY` | SVG coordinates corresponding to client-screen `(0,0)`, before scene rotation |
| `pivotX`, `pivotY` | Stable plan-space pivot shared by all scene layers |
| `updatedAt` | Monotonic per-plan viewport save time, independent of survey edits |
| `selectedAt` (optional) | Last selection time; reconciled separately to recover the selected survey/floor |

All fields used for transforms must be finite; scale must be positive. Unknown viewport/backup fields are retained. No geometry or survey schema is rewritten, no storage key/database is changed, and no user storage is cleared.

Legacy unversioned/version-1 center/scale views are accepted, restored once using their existing semantics, then upgraded when captured. Legacy conflicts use the owning survey's `updated` value because those files have no viewport clock. Ties retain IndexedDB, then mirror, then legacy priority. An absent/invalid view does not replace a valid one. A selected legacy winner carries its effective timestamp into subsequent merges.

Old snapshots cannot supply an exact screen anchor they never recorded. Old builds can still read the retained center/scale fields, but cannot honor the added anchor/pivot semantics. Exact position across layout transitions is guaranteed by the new controller for valid v2 captures; existing geometry/unknown backup fields remain intact.

## Regression coverage

`tests/viewport-persistence.spec.js` runs the actual development HTML over local HTTP using synthetic disposable profiles:

- Exact rendered rectangle corners (within 0.1 CSS px) and scale through repeated Done/Edit/reload at desktop and phone sizes.
- Drawing new rectangles in 0°/90° views without pivot shifts as wall bounds grow; final wall geometry and unrelated plans remain intact.
- Zoom/pan, independent plan switching, shared Camera Survey view, manual/automatic rotation, resize, and repeated orientation events.
- No-movement camera/drawing presses spanning a resize, with exact rendered transform and unchanged survey data after release.
- Actual Chromium process shutdown/restart with both localStorage and IndexedDB retained, including closing from Edit mode.
- Conflicting mirror/legacy/IndexedDB viewports, per-view versus survey clocks, malformed states, single-backend recovery, independent wall recovery, unknown metadata retention, last-floor selection with stale IndexedDB, and background events during delayed startup.
- Delayed saves and stale Done callbacks after plan switching; background/pagehide during an unfinished pan with older IndexedDB snapshots.
- Android-sized Chromium with actual CDP touch pinch/pan; geometry, dimensions, cameras, racks, routes, images, notes, IDs and other survey data are checked by snapshot equality where applicable.

Existing test files receive focused expectation/setup corrections: Area tracing explicitly fits its fixed-coordinate fixture after orientation instead of relying on an automatic fit; Camera Details checks movement in the commanded direction from its actual starting edge; the measurement-dialog test requires the dialog to close and expects the existing explicit `estimated: false` flag when re-saving an unchanged legacy measurement. V17.128 integration also updates the startup title assertion to V17.128 and exercises its fixed toolbar, More disclosure, collapse class and Freehand options instead of the obsolete draggable/scrolling toolbar. The touch polygon fixture is scaled and positioned above the fixed overlay; all six points, calculated area and saved reopening assertions remain. All geometry, persistence, movement and reachability assertions remain strict. Product area/measurement/camera algorithms are unchanged.

The existing Done auto-area calculation regenerates derived auto-area IDs. Integrity comparisons normalize only those IDs and survey update timestamps; calculation contents and all other survey data are compared. Its algorithm is unchanged.

### Touch-emulation limitation

An exploratory Linux Chromium check delivered touch pointerdown/up on Edit Plan but suppressed its compatibility click after a prevented SVG touch gesture. This was reproduced on the unchanged development baseline as well as the repair. The viewport touch regression therefore uses actual touch for pinch/pan and mouse activation for mode controls; it does not claim to validate Android button taps. No toolbar/button workaround is included. Physical Android Chrome and iPhone Safari acceptance remains unrun, including real Done/Edit taps, browser chrome, orientation, background/termination, and reopening.

## Scope review and verification

AST-assisted review against the actual V17.128 source identifies 159 unchanged named functions. The old unscoped `scheduleStablePlanFit` is replaced by scoped `schedulePlanViewRestore`. Source comparison confirms byte-for-byte unchanged non-script HTML/CSS, all secondary scripts, stroke-coordinate mapping, camera placement/drag code, and downstream Camera Details/cable/import logic except lifecycle viewport capture. Published test snapshots remain unchanged. Existing geometry recovery policy and broader stale-deletion defects are outside this viewport repair.

Before repair: both new Edit transition regressions and the drawn-plan saved-viewport startup test failed on unchanged development. The deferred camera-press resize failure was also reproduced before its release-event repair.

Integration verification results are recorded in `docs/v17-128-integration-review.md`. Historical PR #10 results do not validate this integration.

No merge, numbered build, publication or deployment is authorized by these checks.
