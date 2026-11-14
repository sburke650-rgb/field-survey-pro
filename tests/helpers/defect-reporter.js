// Playwright's default "passed" total includes expected failures. Print separate
// counts so an accepted baseline is never mistaken for a defect-free release.
class DefectReporter {
  onBegin() { this.counts = { passed: 0, knownDefects: 0, unexpected: 0, skipped: 0, runnerErrors: 0 }; }
  onTestEnd(test, result) {
    if (result.status === 'skipped') this.counts.skipped++;
    else if (test.expectedStatus === 'failed' && result.status === 'failed') {
      this.counts.knownDefects++;
      console.log(`KNOWN DEFECT (expected failure): ${test.title}`);
    } else if (test.expectedStatus === 'passed' && result.status === 'passed') this.counts.passed++;
    else { this.counts.unexpected++; console.log(`UNEXPECTED OUTCOME: ${test.title} (${result.status}, expected ${test.expectedStatus})`); }
  }
  onError(error) { this.counts.runnerErrors++; console.log(`RUNNER ERROR: ${error.message}`); }
  onEnd(result) {
    const c = this.counts;
    console.log(`\nSafeguard summary: ${c.passed} passed; ${c.knownDefects} known-defect expected failures; ${c.unexpected} unexpected outcomes; ${c.skipped} skipped; ${c.runnerErrors} runner errors. Run status: ${result.status}.`);
    console.log('Known defects remain release blockers; an accepted baseline run does not authorize release.');
  }
}
module.exports = DefectReporter;
