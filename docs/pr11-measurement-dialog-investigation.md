# PR #11 measurement Done investigation

## Finding

The fourth unexpected failure in [Regression run 43971361542](https://github.com/sburke650-rgb/field-survey-pro/actions/runs/43971361542) is an existing V17.128 dialog/keyboard interaction defect, not a viewport persistence regression. No application code is changed by this investigation.

The run's job `133664048958` reports `#modalBack` still visible at `tests/mobile-layout.spec.js:180` after tapping `#modalOk`. Its trace artifact `14279235754` shows the distance dialog on the left while the numeric input is focused, then on the right after the tap, with the dialog still open. The CI browser was Playwright Chromium 159.0.8154.6 (revision 1255), rather than the system Chromium 156 used for the previous local review.

## Reproduction and comparison

Checked integration head `c8ab2fce54661802429579c738bdf7bcc24c593f`. The untouched baseline was a disposable HTTP-served copy of `test/v17-128/index.html` from `24860223f1575be60948eca3050f7fd8b025a8ea`, verified as the same Git blob `7d91d8d8c1c0ce138fb9719a44c6dfc0d64a5efb`. The published file itself was never edited.

The original unmodified test passed isolated runs on both targets. A repeated, read-only-instrumented baseline run also passed 30 times. This does not invalidate the CI failure: the ordinary fixture can place the distance dialog on either side according to its measurement's screen position. The failing CI trace uses the right-hand unfocused placement.

Added an ordinary regression variant to the same measurement test for that right-hand placement. It pans only the synthetic viewport and commits it through the zoom controller, then runs the existing endpoint Cancel/Done, keyboard, reachability, real touch tap, dialog-dismissal and geometry assertions. A prerequisite assertion verifies that the unfocused dialog is on the right. The original case remains intact. No force-click, DOM click substitution for Done, assertion removal, skip, retry or expected-failure designation was added.

Both cases run identically against integration and the untouched baseline with Chromium 159:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/work/playwright-browsers \
  npx playwright test mobile-layout --grep 'measurement endpoint'
```

| Target | Original placement | Explicit right-side placement |
| --- | --- | --- |
| Integration | Passed | Failed: modal remains visible |
| Untouched V17.128 | Passed | Failed: modal remains visible |

Read-only event attachments on both targets show the same sequence:

1. Touch/pointer down and up target `modalOk`, with `oDistance` focused and `keyboard-visible` set. Done's rectangle starts at x=199, y=150, width=148, height=44.
2. Compatibility `mousedown` targets Done, then the input loses focus.
3. The unchanged visual-viewport script removes `keyboard-visible`. The dialog returns from keyboard-constrained left placement to its original right placement; Done moves to x=567, y=141.
4. Compatibility `mouseup` hits `planCanvas`; the resulting click targets an ancestor, not Done. The Done click handler is not activated and the dialog remains open.

This explains why Playwright actionability and trial taps pass: they check the button before the focus change, whereas the button moves during activation. Source comparison confirms the modal action/save handler, `positionDistanceDialog`, keyboard CSS and visual-viewport adjustment script already exist in V17.128. This finding concerns synthetic Chromium keyboard/touch emulation; physical-phone behavior remains unverified.

## Scope and validation

Only the measurement regression and documentation change. The application, published V17.128, toolbar/layout, camera, drawing and cable-route code remain unchanged. The defect stays an ordinary CI blocker (KD-005); repairing the existing dialog behavior is outside this viewport-only investigation's conditional fix authorization.

The earlier 129-case suite was rerun with Chromium 159 before adding the explicit-placement variant: 125 passed, 3 unexpected failures, 1 KD-004 expected failure, no skipped tests or runner errors. The original measurement case passed on this host.

Final 130-case suite with Chromium 159.0.8154.6, one worker, zero retries:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/work/playwright-browsers npm test
```

**125 passed, 4 unexpected failures, 1 expected failure (KD-004 on immutable V17.121), 0 skipped, 0 runner errors; exit 1.** All 24 viewport cases passed within the full run. The four ordinary failures are the existing two safe-area header bounds cases, inaccessible collapse control, and the new explicit right-side measurement case. The original placement case passed locally. This remains a failing suite, not merge/release acceptance. The CI run's original 129 cases had 124 passes, those same three layout failures plus its original-placement measurement failure, and one KD-004 expected failure; the additional explicit-placement case explains the new suite size.

Separate viewport rerun with the same browser:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/work/playwright-browsers npm test -- viewport-persistence
```

**24 passed, 0 failures, 0 expected failures, 0 skipped, 0 runner errors; exit 0.** Includes retained localStorage/IndexedDB across an actual Chromium process restart.

`git diff --check` passed. Source review against PR #11 head confirms no application, published snapshot, root entry point, package or workflow changes. The final test trace includes the in-canvas midpoint fixture, and the right-side test fails on the unchanged dismissal assertion, after passing its placement and actionability checks.

No merge, numbered release (including V17.129), publication or deployment.
