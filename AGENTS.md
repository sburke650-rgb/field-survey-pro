# Field Survey Pro — Development Rules

## Scope and baseline
- Recovery baseline: V17.121, commit `850eafbff6546911954655ee9fb893c0277fb9fb`.
- Read task instructions and inspect Git status before working. Preserve user changes.
- Each cloud task is isolated. Do not create a Git worktree unless explicitly requested.
- Implement, release, deploy, or publish only within explicit authorization. Plan approval does not authorize deployment.

## Preserve completed functionality
- Never replace the current application wholesale with an older version.
- Compare historical implementations before recovering features; make focused changes.
- Distinguish missing features from inaccessible or broken implementations.
- Do not claim prior approval without evidence. Maintain the feature/acceptance checklist.
- Never change behavior merely to make a test pass.

## Application and release identity
- Root `index.html` is V17.78; `test/index.html` is V17.81. Verify targets before editing.
- Unnumbered development source and default regression target: `development/index.html`. Published `test/v17-121/index.html` remains immutable and retains the original KD-004 reproduction. Do not implicitly update other entry points.
- Preserve released snapshots unchanged. Keep release paths, titles, and version labels consistent.
- Do not create a numbered release until explicitly authorized.

## Data integrity
- Survey data is user-owned and irreplaceable. Never clear user browser storage as a repair.
- Preserve backup compatibility and unknown fields. Validate imports before replacement.
- Recovery must distinguish deletion from failed/missing storage; never reconcile by array length alone.
- Preserve stable IDs and camera, equipment, measurement, area, and route relationships.
- Migrations require explicit schema/version handling, synthetic fixtures, and recovery tests.

## Geometry and interaction
- Store finite plain numeric plan-space coordinates; keep viewport transforms separate.
- Camera dragging must not pan the plan. Cone adjustment must not move the camera or pan.
- Preserve cable bends/connections; equipment movement must retain unrelated route geometry.
- Follow approved tool-entry/exit behavior. Check rendered movement, not just event handlers.

## Testing
- Reproduce a defect before fixing it. Test the actual HTML via local HTTP.
- Use isolated browser contexts and synthetic data, never a user's working profile.
- Check uncaught errors and initialization failures; inspect persistence as well as the UI.
- Cover reload, retained-storage reopening, export/import, and conflicting snapshots as relevant.
- Known defects remain explicit expected failures linked to local defect IDs. Never skip or weaken assertions to get a pass. Unexpected failures and unexpected passes block CI.
- After a repair, remove its expected-failure designation. Report passed, failed, expected-failure, skipped, and unrun results separately.
- Real Android Chrome and iPhone Safari acceptance is required for gesture, keyboard, orientation, safe-area, camera-capture, and background/resume changes. Emulation is insufficient.
- Do not include credentials or customer/site data in fixtures or artifacts.

## Future AI compatibility
- Do not implement AI without explicit authorization.
- Preserve structured geometry, units, stable IDs, relationships, and measurement provenance.
- Do not flatten essential planning data into labels, SVG, or screenshots only.
- Schema changes require reviewed migrations; do not turn a regression repair into a data-model rewrite.

## Git and review
- Work on focused branches, never directly on main. Do not rewrite published history.
- Keep released artifacts unchanged. Use reviewable PRs describing behavior, coverage, compatibility, and manual validation.
- Merge, deployment, and publication require applicable authorization.
- Follow `docs/regression-checklist.md` and `docs/known-defects.md`.

## Completion
Report changes, target version, checks and outcomes, remaining manual checks, compatibility implications, and known defects. Never claim an untested workflow works.
