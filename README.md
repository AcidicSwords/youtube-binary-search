# Binary YouTube Reader

Version 5.4 integrates the Step Field as a complete Address-and-Extent grammar rather than a parallel playback system.

Binary YouTube Reader presents a YouTube video as an ordered spatial Range rather than only as mutually exclusive linear presentation.

The application is generated from one primitive: an **Address** in video time. Every retained object, movement, observation, and control is derived from that ordered space.

## Canonical vocabulary

- **Current** — the Address presently established.
- **Range** — the complete bounded extent currently available.
- **Neighborhood** — the recursively restricted part of Range currently under examination.
- **Resolution** — how finely the Neighborhood distinguishes the material.
- **Interval** — the transient bounded extent between the preceding and current Addresses.
- **Pin** — a retained Address.
- **Section** — a retained bounded extent whose endpoints are Pins.
- **Guide** — the retained structure composed of Pins and Sections.

## Operator grammar

```text
Range
  Focus Section
  Leave Section

Neighborhood / Resolution
  Refine Backward
  Refine Forward
  Reopen

Current
  Step Backward
  Step Forward
  Go directly
  Pin Current

History
  Return

Observation
  Context
  Continue
  Skim
  Loop
  Pause
```

Forward and Backward follow reading order rather than physical orientation. Forward is rightward in the horizontal video map and would be downward in a vertically laid-out document.

### Refine

Refine restricts the current Neighborhood toward one direction and increases Resolution. The implementation uses binary subdivision, but the operation is named for the reader's purpose: zeroing in.

### Reopen

Reopen preserves Current while escaping recursive restriction and restoring access to material excluded by refinement. It does not restore a former state; that is Return.

### Return

Return restores the preceding complete semantic state. The canonical branch pivot is:

```text
Refine Forward
→ Return
→ Refine Backward
```

## Context

After a direct movement—timeline placement, Refine, Step, Pin navigation, Section midpoint navigation, or relocating Focus—the reader can automatically unfold a short audiovisual neighborhood around Current.

```text
Off / 3 s / 5 s / 10 s
```

The default five-second Context begins approximately one second before Current, stays inside Range, and returns the physical playhead to semantic Current when it ends.

Context:

- does not create another Interval;
- does not add Return history;
- does not change Range, Neighborhood, or Resolution;
- is replaced immediately by the next movement;
- may be stopped manually with `C` or `Escape`.

## Observation

- **Continue** unfolds normally forward through Range and wraps at Range End.
- **Skim** approaches the forward refinement destination at a logarithmically decreasing unfolding rate, then continues at normal speed.
- **Loop** repeatedly unfolds the current Interval.
- **Pause** settles active Continue, Skim, Loop, or Context according to its semantic contract.

Context and Loop are observational: when stopped, the playhead returns to Current. Continue and Skim commit the actual movement that occurred.

The interface distinguishes **Current**, the settled semantic Address, from **Cursor**, the physical YouTube position temporarily unfolding during observation. They coincide whenever transport is idle.

## Interface

On wide desktop screens, the Guide remains the only side rail while the reader uses the available width for the Step Field:

```text
Step Field                         | Guide
Observation                        | Guide
Temporal map | Navigation grammar  | Guide
Secondary tools                    | Guide
```

Center is larger and authoritative. Tail and Lead are smaller, visually separated, muted, and independently collapsible. The Field adds only one compact Center-level toggle and one collapse control per side; existing Step buttons and Arrow keys remain the labelled and repeatable forms of the same operators.

Backward operations remain left, shared operations remain on the centre spine, and Forward operations remain right. On mobile, Center occupies the first full row and the optional side projections become compact cards beneath it while Guide remains an off-canvas sheet. Controls suppress accidental double-tap zoom without disabling intentional page zoom, and the timeline preserves vertical page scrolling.

## Keyboard

```text
W                 Reopen
A                 Refine Backward
S                 Return
D                 Refine Forward
← / →             Step Backward / Forward
Shift+← / Shift+→ Pin Backward / Forward
[ / ]             Decrease / increase Step size
P                 Pin Current
C                 Context
Space             Continue / Pause
F                 Skim / stop Skim
L                 Loop / stop Loop
G                 Open Guide
Ctrl/Cmd+Z        Return
Backspace         Return
Escape            Stop active observation or close transient UI
?                 Keyboard reference
```

Only Step repeats while a key is held. Pin navigation and structural operations require distinct presses. Modal Guide and edit surfaces own the keyboard completely; hidden reader commands cannot run behind them.

## Guide and potential sources

The Guide contains only structure explicitly retained by the user:

```text
Current → Pin
Interval → Section
Section → active Range through Focus
```

`source-field.js` reserves a separate read-only boundary for chapters and transcripts. Source records can provide potential Pins, potential Sections, and timed text, but are never copied into the Guide automatically.

## Step Field

The optional Step Field projects the existing local Step relation through three synchronized panes:

```text
Tail | Center | Lead
```

Center remains the sole authoritative player and the only audible pane. Tail and Lead are smaller, muted, independently collapsible projections. They begin coincident with Current, unfold through differential playback while Continue is active, and hold at the existing Step distance. Once Held, all active panes continue at `1×`, so the completed relation slides through the source as one field.

A forming side is an actual visible Cursor and selects through Go. A Held side coincides with its Step Target and selects through Step. The actual Tail-to-Lead relation is Field Span: a transient Extent that may be looped or retained as a Section without becoming another Current, Interval, or Return history. Native Center play/pause remains the sole visible transport authority. Context belongs to Current, Skim to the Forward Target, and Loop to an explicit Extent. Context, Loop, Skim, pending Step gestures, and Range dragging suspend the side projections. Visibility is a presentation preference and does not enter Return history.

## Architecture

```text
range-geometry.js  pure Range, Neighborhood, Resolution, Refine, Reopen, and Step geometry
guide.js           persistent Pins and Sections plus storage migration
session.js         immutable semantic state, transactions, and Return history
transport.js       transient Context, Continue, Skim, and Extent-driven Loop execution
step-field-geometry.js pure Field targets, actual offsets, Span, phases, and side-selection mode
step-field.js      transient Tail/Center/Lead player synchronization
youtube.js         sole raw YouTube IFrame adapter
source-field.js    optional chapter/transcript candidate records
view.js            DOM projection, timeline Pins, previews, formatting, and control state
app.js             composition root, commands, persistence, player effects, and browser events
```

The governing boundary is:

> Session owns semantic structure. Transport temporarily manifests or observes that structure through YouTube. At rest, the physical playhead and semantic Current coincide.

## Run

Serve the directory over HTTP or HTTPS:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Verify

```bash
npm run check
```

The suite covers syntax, Range geometry, Guide and Session transactions, Return, transport, source-field parsing, 25,000 deterministic invariant operations, DOM bindings, spatial layout contracts, startup, the complete interaction flow, native YouTube-position reconciliation, path-independent Range editing, delayed transport startup, pause-event ownership, and delayed metadata availability.

## Persistence

Guide data is stored per video under:

```text
binary-youtube-reader:v5:<videoId>
```

The application reads and migrates v4, v3, v2, and v1 records without deleting their original keys. Context and Step preferences remain under:

```text
binary-youtube-reader:preferences:v1
```


## Audited interaction invariants

- Direct Go is scale-independent: selecting Current again still reopens a recursively refined Neighborhood without inventing movement.
- Rapid opposed Steps and a Range-handle gesture returned to its origin are true no-ops: no phantom Interval or Return entry is retained.
- App-generated player placements are distinguished from genuine native YouTube scrubbing.
- Native scrubbing is committed through the same Go transaction and constrained to the active Range.
- Context and Loop never displace semantic Current; a separate Cursor shows what is physically unfolding.
- Repeated internal pause requests cannot cancel a later user transport.
- Guide dialogs restore keyboard focus after mutation; compact Guide is modal and suspends background shortcuts.
- Corrupt persisted data is salvaged record by record. Reversed Section endpoints are canonicalized and duplicate Sections are removed.
- Storage failure is reported truthfully; the in-memory Guide remains usable for the current page.

## v5.2 interaction grammar

Version 5.2 makes movement, refinement, playback, retention, and recovery obey one explicit state grammar:

```text
Go establishes Current, Interval, and movement scale.
Refine subdivides the current Neighborhood.
Step preserves its origin Neighborhood or seeds a new movement scale when it leaves.
Reopen alone restores Range-scale availability.
Skim traverses the Forward refinement at one boosted rate, then becomes Continue at 1×.
Continue preserves local Resolution while inside it and reopens after crossing it.
Context and Loop remain observational.
Return restores the complete preceding semantic state.
```

A direct Go at Current is a no-op. Range changes preserve an Interval only while the complete Interval remains inside the new Range. A wrapped Continue clears Interval because the resulting path is not one contiguous bounded extent.

### Directional Step Field

Step Backward and Step Forward may use linked or independent Reach values. Those values determine both semantic Step destinations and the terminal Tail/Lead Field geometry. Tail and Lead playback rates are selected independently from the rates actually available to each YouTube player. The visible Continue control composes the three physical players while Center remains the sole audible and semantic authority.
