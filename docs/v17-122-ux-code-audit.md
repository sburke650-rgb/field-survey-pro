# V17.122 code and UX audit — initial findings (static review)

Scope: `test/v17-122/index.html`, `development/index.html`, `AGENTS.md`, `docs/regression-checklist.md`, `docs/known-defects.md`, `docs/mobile-toolbar-accessibility.md`, `docs/area-tool-accessibility.md`. This is a **static audit**, not a claim that tests have been executed or physical-phone behavior reproduced. Do not publish or merge based on this report.

## P0 — User-facing mobile toolbar usability
- V17.122 CSS explicitly sets `#planTools` to `flex-wrap:nowrap`, `overflow-x:auto!important`, and `touch-action:pan-x!important` in fullscreen edit. This makes horizontal scrolling an intentional part of the workflow.
- `#undo` is placed near the end of the toolbar DOM, after Line, Freehand, Color, Auto Wall, Measure, Help, Area, More and Dimensions. Highlighting Undo with orange background does not make it visible in the initial viewport.
- User reports having to scroll to reach Undo. Acceptance criterion: after selecting Line and drawing, Undo is immediately visible/tappable at 360px width, without scrolling, in both orientations. Preserve Done and Back.
- Existing mobile tests validate scroll reachability, not fixed primary-action reachability. Add explicit assertions for no horizontal toolbar scrolling and immediate Undo hit testing.

## P1 — Confusing control organization
- The toolbar exposes Line, Freehand, Color, Auto Wall, Measure, Help, Area, More, Dimensions, Undo and Clear, plus dynamically injected collapse and drag controls. This is too many first-level actions for a phone.
- Area is labeled `Area` in `syncAreaControls()`, despite requested clear `Square Footage` naming.
- Color picker offers blue/red/green/yellow; user-requested compact set is blue/red/green. Do not remove an existing color without reviewing saved color compatibility and product agreement.
- Consolidate Freehand-specific actions in a Freehand submenu, secondary actions in More, keep Undo and Done fixed. Confirm any separate Measure entry points through runtime testing before removing one; this static inspection alone does not establish duplicate active Measure controls.

## P1 — Test/release gate mismatch
- `docs/mobile-toolbar-accessibility.md` describes horizontal scrolling as an intended solution, and tests that controls are reachable after scrolling. The user expects no scroll for core actions.
- `docs/regression-checklist.md` explicitly leaves physical Android Chrome and iPhone Safari acceptance unchecked.
- Add end-to-end technician workflows: New Survey → plan upload/draw → Edit Plan → Line → Undo → Freehand options → Measure → Square Footage → Done → Camera → Cable Routes → reopen; verify visible/hittable controls at each step and saved data after reopen.
- Report automated passes, failures, expected failures, skips and unrun physical-device checks separately.

## P1 — Documented release and data risks
- `docs/known-defects.md` documents stale snapshot reconciliation, derived auto-area IDs changing on Done, and incomplete deletion matrix.
- Cold-start offline app delivery not established; offline editing after initial load is not equivalent to offline launch.
- Cable route shared paths are copied polylines, not shared topology; trunk-edit propagation unverified.
- Do not change persisted schema or overwrite snapshots while addressing UX.

## Next actions (not implemented)
1. Add deterministic phone-width UX regressions that fail against the current toolbar.
2. Implement focused toolbar redesign on a review branch, retaining current tool behavior and storage.
3. Run the full Playwright suite locally/CI; inspect screenshots, errors and storage.
4. Test on physical Android Chrome; only after explicit approval publish a new immutable test build.

## Audit limits
This audit did not execute Playwright, inspect an actual rendered phone session, or validate whether any specific feature works on a real device. No release authorized.