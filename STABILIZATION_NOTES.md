# Stabilization Patch

Base: `5c8a5f1340671fea2cfd60a8d7ecf536a5636d3c`

This patch deliberately changes no project theory and introduces no new
interaction family. It closes invariant failures at existing boundaries:

- Guide v8 is persisted under a v8 key and migrated non-destructively from
  earlier keys.
- Groups and Section membership survive normalization, sanitization, reload,
  Undo, and all ordinary Guide-edit routes.
- Source-local Cues, selections, previews, and gesture state cannot cross into a
  different video.
- retained extents are rejected when they lie outside the loaded source.
- hidden map Pins are not map snap operands.
- activating a Field side lands on the source Address visibly presented there,
  with Timeline Space conversion performed by the application.
- Current drag, Context transition, and Step Reach units are labelled according
  to their existing operations.

Validation is part of the archive build. The complete existing `npm run check`
must pass, followed by the added cross-boundary stabilization tests.
