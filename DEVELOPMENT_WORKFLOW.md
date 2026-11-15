# Field Survey Pro — Locked Development & Phone-Test Workflow
Effective: 2026-11-15. Owner-approved goal: fast experimental phone testing with reliable backups and no surprise changes.

## Non-negotiable rules
1. One active experimental build at a time. Every build has a unique version and URL; never overwrite an earlier test URL.
2. Keep the last known working reference (currently test/v17-122/index.html) untouched. A newer experimental build is NOT automatically the new baseline.
3. User describes the desired behavior and tests on their phone. Assistant handles code, GitHub, automated tests and diagnostics. Do not require user to open Codex, GitHub or run commands.
4. No new feature, redesign, rotation initiative or tooling/process change without discussing it first. Fix regressions before new features.
5. Before editing, identify the actual code path and regression cause. Prefer focused fixes over appended override patches. Preserve existing offline data, drawings, geometry, cameras, cable routes and navigation.
6. A failed automated test must be investigated and reported, but does not block a clearly labeled *experimental* phone build. Never call an experimental build verified or release-ready. Never weaken a meaningful test merely to get a green check.
7. Release/promotion requires regression checks and user approval; known defects remain blockers. Do not merge experimental work into the stable baseline automatically.
8. Each new test link comes with: version, exact changes, known issues, whether automated checks passed, and one short phone test. Do not claim deployment or test success without verifying it.
9. When a bug is reported, record reproduction, expected/actual behavior, fix, and verification before calling it fixed. Do not make the user repeat already established test cases.
10. Always preserve previous versions and user surveys; never request clearing browser storage as a casual troubleshooting step.

## Current baseline and work
- Reference: test/v17-122/index.html (preserved).
- Experimental: test/v17-123/index.html (published, not fully verified).
- Active development branch: fix/mobile-edit-toolbar-cleanup; draft PR #9.
- Current priority 1: Fix floor-plan drawing shifting/recentering/zoom changing after Done; preserve consistent coordinates between Edit Plan and normal Plans view.
- Priority 2: Simplify bottom Edit Plan toolbar: Line, Freehand, Measure, Square Footage, Undo, More; move Hide Dimensions and Clear Drawing to More; Freehand exposes Color and Auto Wall; keep Done independently visible.
- Priority 3: Fix rectangular exterior area calculation with interior Line/Freehand walls and curves; two exterior measurements should determine rectangle area without treating interior strokes as boundary.
- Preserve and retest: autosave, Undo, freehand colors, measurements, camera locations, cable routes, MDF/IDF and reopening saved surveys.
- Do not bundle unrelated changes into the next experimental build.

## Repeatable cycle
A. Reproduce one reported bug and locate root cause.
B. Make a small change in development; inspect side effects; run relevant checks where available.
C. Publish a uniquely numbered experimental test file without touching baseline.
D. Give the user one direct link, accurate test status and a single focused test.
E. Record phone result; fix or move on. Promote to baseline only when verified and approved.

## Status language
- 'Committed': code saved in GitHub; not necessarily published.
- 'Published': test URL created; may still be propagating.
- 'Verified': checks completed successfully for the stated scope.
- 'Phone-confirmed': user explicitly tested and confirmed the behavior.
