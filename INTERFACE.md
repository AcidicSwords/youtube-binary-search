# Binary YouTube Reader — Interface Grammar

## 1. Purpose

The interface is a projection of the operator grammar. A visible element is justified only when removing it would remove an available operation, conceal state required to predict an operation, or erase feedback needed to distinguish semantic commitment from physical observation.

The desktop composition has three ordered regions:

```text
Panoramic media
→ playback and live operands
→ full-width temporal map
→ Parameters | Operator matrix | Guide
```

Parameters alter operands. The centered matrix applies operators. The Guide retains explicit structure. These responsibilities do not overlap.

## 2. Panoramic media

| Element | Contribution | Consequence if removed |
|---|---|---|
| Tail pane | Shows the physical backward Step projection while Center remains authoritative | Backward material could not be compared simultaneously before committing Current |
| Center pane | Owns audio, native YouTube controls, physical transport settlement, and semantic authority | The system would have no authoritative Cursor or audible reader |
| Lead pane | Shows the physical forward Step projection while Center remains authoritative | Forward material could not be compared simultaneously before committing Current |
| Tail/Lead rate control | Chooses a realizable directional playback response reported by that player | Formation kinetics would be fixed or falsely implied |
| Field toggle | Returns the application to the stable single-player reader | The optional three-pane projection could not be disabled without changing source code |
| Pane hide/restore | Removes one physical projection without changing Step semantics | A temporarily unwanted or unavailable pane would consume space permanently |

Pane headers are outside the video image. Controls never compete with YouTube titles, captions, or native overlays.

## 3. Playback dock

The playback dock is attached directly to the media because its effects are physical and time-dependent.

| Element | Contribution | Consequence if removed |
|---|---|---|
| Continue/Pause | Authoritative application gesture for Center and available side players | Three-player activation would depend only on delayed native iframe events |
| Context | Observes around Current and restores it | Bounded local review would require semantic movement |
| Skim | Traverses Center toward the forward structural target at an available rate | Fast structural forward reading would be lost |
| Loop | Repeats the current stable explicit Extent | Repetition would require manual seeking and would lose operand identity |
| Current readout | States the committed semantic Address | Physical Cursor movement could be mistaken for semantic commitment |
| Interval readout and Retain affordance | Identifies the last committed movement Extent and opens Section capture | Loop/retention operands would be implicit and unrecoverable from the interface |
| Field Span readout | Identifies the stable simultaneous Tail–Lead Extent | A Held Field could not be looped or retained as an explicit operand |
| Field phase and rates | Reports whether the projection is Coincident, forming, Held, suspended, blocked, or rate-constrained | The interface could claim a relation that the players have not physically instantiated |

Range, Resolution, and retained Section state do not belong in the playback dock because they are not playback commands.

## 4. Temporal map

The temporal map spans the same width as the panoramic media. It is the spatial account of the active source.

| Element | Contribution | Consequence if removed |
|---|---|---|
| Range fill and handles | Shows and edits the sole hard admissible domain | The user could not predict or directly alter boundary constraint |
| Resolution fill | Shows the semantic Neighborhood scale within Range | Refine and Reopen targets would lack visible scale |
| Current marker | Shows committed semantic position | Current could not be distinguished spatially from observed Cursor |
| Cursor marker | Shows unsettled physical observation during transport | Physical motion would appear to commit immediately |
| Interval fill | Shows the last movement Extent | The active Loop/retain operand would not be visible |
| Field Span fill | Shows simultaneous Tail–Lead exposure | The live Field operand would be detached from source space |
| Pin markers | Makes retained Addresses directly reachable | Retained point structure would exist only in the Guide list |
| Target markers and previews | Show consequences before a command is committed | Directional operations would be less predictable |

The map does not repeat controls already owned by the playback dock or parameter panel.

## 5. Parameter panel

The left panel contains entered values and bounded state that parameterize operators.

| Element | Contribution | Consequence if removed |
|---|---|---|
| Active Range state | States the current admissible domain and opens Range tools | Boundary edits would become hidden gestures with no textual verification |
| Resolution state | States the current semantic scale used by Refine/Reopen | The same Current could not be interpreted at its active grain |
| Range tools | Provides explicit Start, Midpoint, End, and Full Video transformations | Range mutation would depend on dragging alone |
| Step Reach | Defines independent backward and forward Step/Field geometry | Step destinations and Field targets could not be configured |
| Context duration | Defines the Context observation window | Context would have an unexplained fixed duration |
| Skim rate | Selects a realizable Center rate for Skim | Skim kinetics would be fixed or misleading |
| Section capture | Names and confirms retention of an explicit Extent | Retention would create unlabeled or accidental structure |
| Keyboard reference | Makes the compact command grammar discoverable | The Vim-like composition would exist only in documentation |

No operator button is placed in this panel. Changing a parameter is not the same act as applying an operator.

## 6. Operator matrix

The centered matrix is the complete direct spatial command surface:

```text
        W
     A     D
     ←  S  →
    ⇧←  P  ⇧→
```

| Position | Operator | Negated capability |
|---|---|---|
| W | Reopen | Cannot return to Range-level Resolution |
| A / D | Refine Backward / Forward | Cannot choose one side of the Neighborhood |
| ← / → | Step Backward / Forward | Cannot move by directional Reach |
| S | Return | Cannot restore the preceding complete semantic checkpoint |
| Shift+← / Shift+→ | Previous / next retained Pin | Cannot traverse retained Addresses directionally |
| P | Pin Current | Cannot retain the current Address |

Step Reach controls and Guide access are excluded because they are parameters and retained-structure presentation, not operators.

## 7. Guide

The right panel is the only explicit retained-structure surface.

| Element | Contribution | Consequence if removed |
|---|---|---|
| Sections tab | Lists retained bounded Extents and exposes Go, Focus, rename, and delete | Sections would persist without a management surface |
| Pins tab | Lists retained Addresses and exposes Go, rename, and delete | Pins would be visible only as unlabeled map markers |
| Sources tab | Keeps external potential structure distinct from retained Guide records | Source-provided structure could be mistaken for user commitment |
| Focused Section state | Shows when a Section currently owns Range and provides Leave | Focus could silently replace the active domain |
| Counts | Summarizes retained structure without adding a duplicate navigation button | The user could not assess retained density when a tab is not active |

There is no separate “Pins retained” matrix button. The Pin tab and directional Pin operators already provide the two required functions: management and traversal.

## 8. Responsive behaviour

Desktop is the primary composition. At narrower widths:

1. Center moves above Tail and Lead.
2. The operator matrix remains before parameter entry.
3. Guide becomes a modal side sheet below 900 px.
4. At phone widths, Tail and Lead stack and preserve the YouTube minimum player height.
5. Controls preserve the shared coarse-pointer target.

Responsive layout may change placement, but never ownership, terminology, or operator meaning.

## 9. Admission rule for future UI

A new element is admitted only when all are true:

1. It exposes an implemented operation or irreducible state.
2. Its owner is not already represented elsewhere.
3. Its absence produces a specific lost capability or unrecoverable ambiguity.
4. Its placement matches semantic ownership: media, playback, map, parameters, operators, or Guide.
5. Automated integration and project audits can state the contract it preserves.

Visual density is not evidence of capability. Empty or duplicative controls are defects.
