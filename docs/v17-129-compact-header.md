# V17.129 compact header review

Branch: `ui/v17-129-compact-header`. Review-only work; no publication or deployment.

## Source and scope

The first branch commit copies the immutable V17.129 snapshot at `fde9d8344cca0febac825c76b9cac80e0045d0c2` into `development/index.html` exactly, and carries forward PR #11's regression tests. Only the startup identity expectation changes to V17.129. This avoids working from main's older development source. The subsequent UI diff is reviewed against that exact copy, not against the older main development file.

Approved application changes:

- Remove the confirmed-plan hint text completely; hide the now-empty `#planHint` so it does not leave an empty badge. Keep draft/editor instructions intact.
- Place Back, survey name, Saved status, Plan selector and plan menu in one 44 CSS px header. Name/status occupy two small text lines; native Plan selection and Back remain 44 px tall. Names/status can visually truncate on narrow screens while their complete accessible text remains present.
- Position the existing Plan selector within the header using CSS. Keep its existing IDs, event handlers, options and behavior. Make it available during editing along with the Saved indicator.
- Render rotation as a smaller 40×32 px visual face inside a 44×44 px touch target, near the canvas's upper-right corner. Preserve its existing action and add an explicit accessible name.
- Remove obsolete landscape header/selector padding rules and the old fullscreen header margin offset, so the compact row fits within the existing safe-area padding.

No toolbar/drawing-action, measurement-dialog, camera-placement, cable-route or storage behavior is changed. There are no new viewport callbacks, fitting calls, coordinate calculations or persisted fields. Every application script is byte-for-byte identical to V17.129 after normalizing only the removed confirmed-plan string. CSS controls the new layout; the existing viewport controller maintains saved screen anchors and scale when available canvas bounds change.

Root `index.html`, every published `test/` snapshot including V17.128 and V17.129, package files and workflows remain unchanged. No numbered build is created.

## Verification

Seven focused cases cover script preservation, missing hint, native control hit testing, 44 px targets, upper-right rotation placement, safe insets, 320×640 / 412×915 / 915×412 / 640×280 layouts, Plan selection during editing, and survey geometry integrity. They all passed before the complete regression run.

Two of those cases open a saved V17.129 viewport in the cleanup at portrait and landscape phone sizes. They verify a larger normal Plans canvas while retaining screen positions within 0.1 CSS px and scale within the strict tolerance, then repeat those checks through Edit, Done and reload.

Manual visual inspection of local screenshots covered narrow portrait and short landscape. It is browser emulation, not physical-device acceptance.

Complete suite on Node 24 / Playwright Chromium 159.0.8154.6, one worker and zero retries:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/work/playwright-browsers npm test
```

**134 passed, 2 unexpected failures, 1 expected failure, 0 skipped, 0 runner errors (137 cases); exit 1.** The two ordinary failures are the inherited toolbar-collapse and explicit right-side measurement Done cases. The expected failure is KD-004 on immutable V17.121. Both former V17.129 safe-area header failures now pass as part of the approved header cleanup. All seven focused cases and all 24 viewport cases passed in the full run. Camera, measurements, drawing/tool selection, cable-route and persistence regressions otherwise pass.

Separate viewport run:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/work/playwright-browsers npm test -- viewport-persistence
```

**24 passed; 0 unexpected or expected failures, 0 skipped, 0 runner errors; exit 0.** Includes actual Chromium process restart, per-plan views, rotation, storage conflicts, delayed saves and deferred resize.

`git diff --check` passed during implementation. Final diff review confirmed published-file immutability. All six scripts match V17.129 after only the approved hint-string removal; non-style/non-script markup differs only by the two rotation aria-labels. Remaining application changes are the reviewed CSS rules above.

## Remaining limits

Physical Android Chrome / iPhone Safari, real safe-area/browser chrome, accessibility font scaling and real keyboard behavior remain unrun. Very long survey names and save status text can truncate visually in the compact header; their underlying accessible text is retained.

Existing V17.129 toolbar collapse and right-side measurement Done/keyboard defects are outside this cleanup. The measurement dialog may move during touch activation and remain open; no measurement-dialog fix is bundled. Other existing storage/deletion and auto-area ID limitations remain unchanged. Inherited known-defect assertions are not skipped or weakened to make this branch pass.
