# Known defects — V17.121

Baseline: `850eafbff6546911954655ee9fb893c0277fb9fb`.
These are local inventory IDs, not GitHub issue numbers. Fixes #1 and #2 are implemented only in the unnumbered `development/index.html` for architectural review. Published snapshots remain unchanged.

| ID | Confirmed problem | Automated evidence | Required resolution |
| --- | --- | --- | --- |
| KD-001 | Sampled right-angle cable route becomes a diagonal in `straighten()` | Original assertion now passes; expanded geometry/UI/save/shared-path tests pass | Development repair; see `docs/cable-route-geometry.md` |
| KD-002 | Camera Details inline drag positions lose to important CSS | Browser drag asserts actual panel displacement; expected failure | Restore reachable dragging without moving canvas |
| KD-003 | Draw and Edit entry explicitly select Line | Two browser tests assert neutral Pan entry; expected failures | Approved neutral entry in both workflows |
| KD-004 | A stale legacy snapshot restores a deleted measurement | Published-snapshot reproduction remains an expected failure; development repair tests pass | Plan-local versioned deletion ledger; see `docs/survey-data-reconciliation.md` |

Expected failures assert desired behavior; they do not invert assertions or skip execution. Setup and prerequisite assertions run before `test.fail()` so setup breakage is not accepted as the known defect. Playwright rejects unexpected passes. Remove the annotation only with a reviewed repair and passing regression. The custom reporter distinguishes actual passes from known-defect failures because Playwright's default aggregate includes expected failures in its accepted total.

## Other findings requiring follow-up

- Uploaded-plan tracing exists but its Area entry is hidden by toolbar logic. Manual area functions remain with limited entry paths. Add dedicated reachability fixtures before repairs.
- Recovery of walls/cameras/surveys from stale snapshots needs a complete deletion matrix; the first automated conflict reproduction covers legacy measurements only.
- Toolbar safe-space/occlusion, gesture cancellation, multi-touch, rotation, keyboard and background/resume require phone acceptance. Desktop camera/cone checks do not reproduce the reported panning problem.
- Shared routes still copy downstream polylines rather than maintain a topology graph. Fix #2 adds joining/count/length coverage; large-survey phone performance and trunk-edit propagation remain unverified.
- No voice recording or separate hardware/model selector was found. New/Existing status is implemented. These are requirements questions, not authorized additions.
- Offline editing after initial load is implemented; cold-start offline application delivery is not established (no service worker found).
- Root and generic test entry points are older versions. No production entry point is changed here.

KD-001 and KD-004 are repaired in development, not in the published baseline. Other confirmed defects remain release blockers. Passing the safeguard baseline with expected failures is not V17.122 release acceptance.
