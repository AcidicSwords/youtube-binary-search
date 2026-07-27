# Binary YouTube Reader v5.2 — Comprehensive Drop-In Patch

## Exact target

This patch targets the current `main` state:

```text
repository: AcidicSwords/youtube-binary-search
commit:     672227a63c48f599d237500346e46df23e2424de
version:    5.1.0
```

It includes the complete earlier v5.2 work and the final interaction rules in one transaction. Do not apply the earlier patch first.

## Apply

Copy these two files into the repository root:

```text
apply-v5.2-patches.mjs
revert-v5.2-patches.mjs
```

Then run:

```bash
node apply-v5.2-patches.mjs --check-only
node apply-v5.2-patches.mjs
```

`--check-only` verifies the exact v5.1 SHA-256 base and all 33 narrow patch contexts without writing anything.

The apply command:

1. verifies every affected v5.1 file and the repository checksum manifest;
2. creates `.v5.2-patch-backup/`;
3. replaces the three semantic modules and applies the narrow application/UI/test edits;
4. updates the repository documentation and package version;
5. adds `v5.2-regression-tests.mjs` to `npm test`;
6. runs the repository's complete `npm run check`;
7. restores every modified file automatically if any existing or new test fails;
8. updates `SHA256SUMS` only after success.

Use `--no-test` only for patch-engine inspection. It is not recommended for installation.

## Revert

```bash
node revert-v5.2-patches.mjs
```

This restores the pre-v5.2 files from `.v5.2-patch-backup/` and regenerates `SHA256SUMS`.

## Comprehensive behaviour

### Direct Go

A direct movement from `A` to `B` establishes:

```text
Current      = B
Interval     = A–B
Neighborhood = crossed movement on one side of B
               + equal-scale generated extent on the other side
```

The generated side is clipped to Range. Direct Go abandons the preceding recursive path but does not implicitly Reopen. Direct Go at Current is a true no-op.

### Refine and Reopen

Refine continues to bisect the current Neighborhood. Reopen alone restores:

```text
Range Start — Current — Range End
```

while preserving Current and Interval.

### Step

Step inside the origin Neighborhood preserves its boundaries. A Step that leaves it uses the net Step displacement to establish a new movement-seeded Neighborhood rather than silently reopening Range.

Rapid Step sequences derive their final spatial state from the sequence origin and final destination. A net-zero sequence restores the exact origin state and records nothing.

### Continue

Continue preserves movement-scale Resolution while Cursor remains inside the parent Neighborhood. Once Cursor crosses that Neighborhood, settlement reopens Resolution to Range.

A wrapped Continue clears Interval because a wrap is not one contiguous bounded movement.

### Skim

Skim holds one supported boosted rate to the Refine Forward destination, applies the same semantic Resolution as Refine Forward, then becomes Continue at `1×`. There is no progressive slowdown.

### Range and Focus

Range changes preserve Interval only if the complete Interval remains contained. Otherwise Interval clears rather than being clipped or misrepresented.

Focus relocation is administrative and does not create an Interval. Direct Go outside a focused Section is recorded and displayed as a composite scope transition. Full Video is opened when the containing Range cannot contain both departure and destination.

### Guide integrity

Deleting the active Section atomically restores the containing Range, clears Focus, removes orphan endpoint Pins, clears stale presentation, and remains fully Returnable. Every Guide edit also reconciles an impossible stale Focus defensively.

## Files

```text
apply-v5.2-patches.mjs       transactional applicator
revert-v5.2-patches.mjs      exact backup restoration
drop-in-core/                inspectable complete semantic replacements
v5.2-regression-tests.mjs    installed comprehensive regression suite
MANUAL_SMOKE.md              final browser validation
TEST_REPORT.md               completed verification and limitations
BASE_SHA256SUMS.txt           exact v5.1 base hashes used by the applicator
```
