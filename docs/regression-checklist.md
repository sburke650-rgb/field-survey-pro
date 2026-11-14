# Development safeguards and acceptance checklist

## Baseline and boundaries

Recovery commit: `850eafbff6546911954655ee9fb893c0277fb9fb`.
Local annotated tag: `recovery/v17.121` (not pushed).
Default regression target: `/development/`; the original KD-004 expected-failure reproduction explicitly targets `/test/v17-121/`. Root is V17.78 and `/test/` is V17.81.
Existing HTML snapshots are unchanged. `development/index.html` is the unnumbered editable copy derived from V17.121, with Fix #1 storage and Fix #2 cable geometry changes. No V17.122 is created. It retains baseline version labels and is not a release.

## Reproduce locally

Prerequisites: Node 24+, npm, Python 3, and Chromium.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:report
```

On a Linux machine missing browser libraries, use Playwright's documented `npx playwright install --with-deps chromium` with appropriate machine permissions. The GitHub runner uses this command. For an already installed compatible Chromium, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test` avoids another browser download. This override is not used in CI.

The test runner owns a loopback Python server on port 8765 and refuses to reuse an unrelated server. Run commands from the repository root. Tests use fresh, disposable contexts and synthetic data. Do not point them at an existing personal browser profile. The IndexedDB recovery test clears only its own synthetic context's localStorage.

`npm test` runs all tests with no retries and one worker. List, HTML and JSON output retain known defects. The custom summary separates passing tests, expected failures, unexpected outcomes, and skipped tests. The HTML report and `test-results/results.json` are ignored generated artifacts. Failure traces can contain fixture data; never substitute customer surveys. Known defects must not be converted to skips. Unexpected outcomes fail the run.

## Automated coverage implemented

- [x] V17.121 identity, New Survey modal, uncaught-error and cable-init checks.
- [x] Named survey creation, IndexedDB save, and mirror equivalence.
- [x] Closing a context and reopening using retained localStorage.
- [x] IndexedDB-only recovery after reload.
- [x] Measurement deletion, dependent area invalidation, wall preservation and reload.
- [x] Measurement change recalculates 5,000 to 6,000 square feet and persists.
- [x] Stale legacy measurement resurrection (KD-004 expected failure).
- [x] Camera placement and numbering across two plans.
- [x] Camera drag, fixed viewport/walls, and connected route-start anchoring.
- [x] Cone angle persistence without camera/viewport movement.
- [x] MDF and IDF movement with connected endpoints and intermediate bends.
- [x] Shipped cable geometry corner preservation (KD-001 now passes in development).
- [x] Rendered Camera Details movement (KD-002 expected failure).
- [x] Neutral Draw and Edit entry (KD-003 expected failures).
- [x] Offline camera editing and stored geometry retention after reconnect/reload.

The saved multi-bend route fixture is exercised on storage reopening and equipment movement. The corner-loss test executes source-extracted functions in a VM; it is supplemental algorithm coverage, not a route-drawing UI acceptance test. Source boundaries are asserted so extraction drift fails visibly.

## Coverage to add before related repairs/releases

- [ ] Untitled surveys; renaming, closing/reopening and switching multiple surveys.
- [x] Retained storage across an actual Chromium process restart with a disposable persistent profile.
- [x] Legacy JSON backup export/import, unknown fields, and intentional older-backup restore with healthy storage.
- [ ] Invalid imports, photos/text-note round-trips, and partial-write import conflicts.
- [ ] Camera number swaps/cancellation, duplicate and invalid input, status editing.
- [ ] Camera/cone persistence after reload; angle wraparound and multiple rotations.
- [ ] Feet/meters, L-shapes, traced polygons, missing/conflicting dimensions and area entry reachability.
- [x] Route drawing through UI, L/U/multiple bends and reversals, sampling densities, shared-path joining/counts and footage.
- [ ] Zoom-level sweeps, very long-route stress, and physical-phone routing acceptance.
- [ ] Deletion matrix for stale mirror, IndexedDB, legacy and independent wall backups; camera, wall, route, plan and survey deletion.
- [ ] Storage quota/backend failures and accurate degraded/failed-save status.
- [ ] Automated narrow-viewport control reachability and toolbar occlusion checks.

## Required physical-phone acceptance (not performed)

Record device, OS/browser version, commit, result and evidence for each run. Use synthetic data and retain failures separately from unrun checks.

- [ ] Android Chrome and iPhone Safari: camera drag and cone rotation do not pan.
- [ ] Long press, Details movement, pinch/pan, interrupted/multiple-pointer gestures.
- [ ] Portrait/landscape and manual plan rotation retain geometry.
- [ ] Keyboard does not hide fields, Back, Done or measurement actions.
- [ ] Toolbars do not obscure necessary walls or header/navigation controls.
- [ ] Safe areas, browser chrome, scroll and controls remain reachable.
- [ ] Offline editing, background/resume, close/reopen and backup recovery.
- [ ] Photo capture/import and permission handling.

## GitHub review and release sequence

1. Review safeguards on `safeguards/v17-121-regression`; no application repair is bundled.
2. After authorization, preserve the recovery tag remotely without rewriting it. The local tag alone is not an off-machine backup.
3. Configure branch protection/rulesets on main: PR required, independent approval, regression job required, no force pushes/deletion, deliberate bypass permissions. This file and workflow cannot enforce repository settings by themselves.
4. Choose one canonical development source while retaining historical release snapshots unchanged.
5. Use focused repair branches/PRs, reproducer before fix, full regression run after fix. Do not replace the app wholesale from an older version.
6. Resolve release-blocking known defects and the relevant unchecked coverage; record phone acceptance.
7. Review backup/schema compatibility, all version labels and release entry points.
8. Only with explicit approval create V17.122 and immutable release metadata. Merge, deployment and publication need applicable authorization.

PR descriptions must include behavior before/after, affected target, test outcomes, manual evidence, data compatibility and remaining defects. GitHub Actions uploads HTML/JSON/traces even on failures. An accepted run with expected failures is a development baseline, not release approval.

## Future AI compatibility — no AI implementation

Retain plain finite plan-space coordinates, stable IDs, equipment/camera/route references, measurement units and estimated/measured provenance. Keep view rotation/zoom separate. Preserve unknown backup fields. Document schema versions and require migrations plus compatibility fixtures before changing persisted structures. Shared-path topology and full calculation provenance are future design work, not part of these safeguards.

## Fix #1 architectural review

See [Survey data reconciliation](survey-data-reconciliation.md) for the deletion-ledger schema, compatibility policy, new tests, and remaining risks. The published KD-004 failure is retained; development repair checks are ordinary passing tests. Physical-phone checks remain unrun.

## Fix #2 architectural review

See [Cable route geometry](cable-route-geometry.md) for reproduced failures, lossless cleanup policy, endpoint/metadata compatibility, tests and remaining limitations. KD-001 is an ordinary passing regression; no known-defect test is removed. Published snapshots and UI remain unchanged.
