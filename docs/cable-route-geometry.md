# Fix #2 — cable route geometry

Branch: `fix/cable-route-geometry`, based on main `5d9a612` (includes Fix #1).
Only the unnumbered development application is repaired. Published V17.121, other historical HTML, root application, and all UI markup/buttons/styles remain unchanged. No V17.122 is created.

## Reproduced defects

Before changing the application, new ordinary regression assertions failed for:

- A densely sampled L-shaped route: `straighten()` discarded its intentional corner and intermediate samples.
- MDF and IDF movement: the old handler moved interior route points coincident with the old marker position, not just the connected destination.

A further red test showed that shared-path badges disappeared when all stored shared segments were shorter than five plan units. Retaining route samples makes this limitation relevant; overlap detection now includes nonzero short segments.

## Geometry policy

A cable route is a recorded polyline, not an inferred straight line. Cleanup removes only consecutive points with exactly equal x/y coordinates. No distance/angle tolerance, smoothing, or collinear-point removal is applied. All other samples, corners, reversals and intermediate vertices remain ordered and unchanged. Point objects are copied rather than shared between route records.

The pointer handler retains every distinct delivered move position, including movements below the old four-unit threshold, and records the release position even without a final pointermove. The browser may still coalesce pointer events; points it does not deliver cannot be recovered.

Existing endpoint snapping is retained: finish near equipment and its exact endpoint is appended; confirm a shared join and the original drawn approach is retained before appending the projected join point and existing downstream pathway. Join assembly no longer discards the technician's final approach point.

Moving a camera updates its route's first point. Moving MDF/IDF updates the last point of routes referencing that equipment ID. Other bends, even interior points at the former marker location, remain fixed. Existing shared tails are copied and stay geometrically aligned; this is not a new shared topology/graph model.

## Data and length compatibility

- No route schema/storage key or backup format changes; no saved-route migration.
- Loading/reopening an existing route does not run cleanup or rewrite its interior points.
- Rerouting retains route identity, manual footage, vertical runs, slack, names and unknown extension fields. Only its geometry and selected connections are replaced.
- Replacing a route stays at its existing array position, preserving ordering.
- Cable calibration and length formulas are unchanged. Manual estimates remain overrides; calculated footage continues to follow actual geometry, so a deliberately changed pathway or endpoint can legitimately change calculated length.
- Exact duplicate removal does not change polyline length. No unrelated survey, measurement or equipment metadata is intentionally changed.
- Existing lost corners cannot be reconstructed from a previously straightened saved line. Technicians must redraw those paths using a known plan/backup as reference.

## Validation

`tests/cable-geometry.spec.js` uses the shipped functions for algorithm coverage and the actual development app for browser interactions:

- L/U shapes, multiple bends, reversals, tiny bends, multiple sampling densities, point retention, duplicate cleanup, and length preservation.
- L and multi-bend route drawing through UI, metadata retention and save/reopen equality.
- Sub-four-unit move sampling and release without a final move event.
- Confirmed shared-path joining, approach points, downstream corners, count badges, and independent camera movement.
- Dense existing and newly drawn shared routes.
- MDF/IDF movement, including interior points coincident with the old rack position; connected endpoint updates and metadata retention.
- Manual footage/name checks, calculated footage checks, and old-format cable backup export/import including unknown fields.

The original KD-001 development test remains and is now an ordinary passing test; its expected-failure annotation is removed. Other known-defect tests remain unchanged. Fix #1 and the complete existing regression suite run with these new tests.

Full local validation command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.
Result: 44 tests executed — 40 passed, 4 explicit expected failures, no unexpected outcomes, skips or runner errors. The four expected failures cover the immutable published KD-004 reproduction, Camera Details movement (KD-002), and Draw/Edit entry (two KD-003 checks). KD-001 now passes normally. This is local Chromium evidence; no remote CI or phone acceptance is claimed.

## Remaining limitations for architectural review

- More samples mean larger backups and more render/overlap work. Existing overlap detection compares segment pairs; very large surveys have not been performance-qualified on phones. Any later optimization must preserve stored geometry and calculated lengths.
- Shared detection retains its existing proximity/parallel heuristics, including possible false positives for very close parallel routes. There is no explicit shared topology or automatic propagation of a manually rerouted trunk to other routes.
- Existing snap radii are unchanged. No new snapping controls or automatic route planning is introduced.
- Existing manual length overrides are deliberately retained when rerouting; users remain responsible for updating estimates if the actual run changes.
- Physical Android/iPhone acceptance, pinch/rotation interactions during drawing, and very long-route stress testing remain unrun. Desktop Chromium coverage is not phone certification.
- Older app versions still contain the original bug. This repair is not deployed or released.
