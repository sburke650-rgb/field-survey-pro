# Fix #1 — measurement deletion reconciliation

## Review target

Branch: `fix/survey-data-reconciliation`, based on main `6f06918`.
The unnumbered `development/index.html` is copied from published V17.121 and is the editable development source. Root, generic test entry, and every versioned snapshot remain unchanged. No new numbered release is created; development retains baseline titles. Tests default to development, while the original KD-004 reproduction explicitly runs against the immutable published snapshot.

## Cause and bounded repair

`mergeSaved()` preferred longer dimension arrays, including stale legacy arrays. Missing entries were indistinguishable from incomplete storage. Reopening could therefore restore a deleted measurement and leave cached areas inconsistent.

The repair records explicit deletion intent using this optional plan-local field:

```json
{
  "_fspMeasurementDeletions": {
    "version": 1,
    "ids": ["dimension-id"]
  }
}
```

- IDs are existing stable dimension IDs, scoped by their containing survey/plan.
- A Delete Measurement or dimension Undo records an ID before removal. Draft cancellation uses the same removal helper.
- Reconciliation unions deletion IDs and surviving dimension IDs from available snapshots, then removes the explicitly deleted dimensions. This preserves new additions even when stale and current arrays have equal lengths.
- Snapshot selection no longer uses array length as evidence that a tombstoned dimension exists. Existing recovery policies for other entities are unchanged.
- If reconciliation actually removes dimensions, automatic areas are recalculated/invalidated through the existing area functions for affected plans only.
- No clock, globally ordered revision, external service, or IndexedDB version upgrade is required.
- Ledgers travel in existing complete JSON saves, mirrors, exports and imports. No original snapshot or recovery key is deleted.

## Compatibility and migration

Old snapshots without the field remain readable. Deletion metadata is introduced lazily when removing a dimension, not inferred from missing arrays. Other fields, geometry, units, IDs and unknown backup properties remain in the complete snapshot. Explicitly importing an older backup is an intentional restore; a successful write to both current backends retains that restored state on reopening. Importing a backup with a ledger preserves its deletion intent.

No production/user profile is opened by tests. All data is synthetic. The development copy uses the existing application storage keys to exercise the actual compatibility path: opening it manually on the same origin as a real survey is therefore a real data operation, not an isolated preview. Review using disposable browser contexts or an exported synthetic fixture. No user storage is cleared or migrated by tooling.

## Evidence and tests

`tests/reconciliation.spec.js` checks stale copies in legacy localStorage, mirror localStorage, and IndexedDB; area invalidation; unrelated walls/cameras/routes/second-plan preservation; measurement Undo; repeated deletion; plan-local IDs; legacy backup round-trip/intentional restore and unknown fields; one-backend write failure; a new measurement alongside a same-length stale snapshot; and an actual Chromium process restart with a disposable retained profile.

The original KD-004 expected-failure test remains against V17.121. Repair tests are normal assertions without expected-failure annotations. Other known-defect tests are retained. Full-suite results must distinguish passes from expected failures.

## Architectural risks and deliberately deferred work

1. Pre-repair deletions with no surviving intent record cannot be distinguished reliably from incomplete historical storage. Those historical ambiguities are not guessed away. A new deletion in development is recorded.
2. At least one surviving snapshot must contain the ledger. If every copy is lost or replaced by old software, deletion intent is lost too. Existing Saved/degraded-save behavior is retained.
3. Simultaneous tabs, devices, or old app versions are not made transactionally consistent. Deletion wins for a known ID; there is no general conflict-resolution protocol. Close older editors before real use.
4. Restoring a pre-deletion backup while one backend is unavailable can leave a surviving old ledger in that backend. General import generations/partial-write conflict resolution requires separate design; the tested intentional restore assumes both current backend writes succeed.
5. Ledger entries are not compacted: removing tombstones while stale copies may exist would allow resurrection. Long-term growth/compaction is deferred.
6. This fix covers standalone orange dimensions. Wall geometry, wall-attached measurements, camera/plan/survey deletion and their independent recovery mechanisms retain their existing semantics and need separate coverage/design.
7. Malformed JSON and unsupported future ledger versions do not constitute valid deletion evidence. Future ledger migrations require an explicit compatibility policy; do not invent or overwrite new-version data casually.
8. Phone acceptance remains unrun. No UI markup, style, navigation, camera or cable behavior is intentionally changed.

This is a reviewable development repair, not a release, deployment, or authorization to modify the published snapshot.
