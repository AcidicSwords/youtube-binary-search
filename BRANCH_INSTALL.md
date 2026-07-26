# Manual Branch Installation and Merge

## 1. Create a safety branch

From the repository root:

```bash
git switch main
git pull --ff-only
git switch -c feature/guide-v3
```

## 2. Extract the replacement package

Extract the archive into a temporary directory, then copy these files into the repository root:

```text
app.js
index.html
styles.css
structure.js
traversal.js
youtube.js
package.json
tests.mjs
integration-check.mjs
startup-smoke.mjs
README.md
SPEC.md
IMPLEMENTATION.md
BRANCH_INSTALL.md
```

`youtube.js` is included for a complete drop-in set but is functionally unchanged.

Do not delete:

```text
favicon.svg
.github/
```

The replacement uses the existing `structure.js` filename, so no source file needs to be removed.

## 3. Inspect the replacement

```bash
git status --short
git diff --stat
git diff -- app.js index.html styles.css structure.js traversal.js
```

Expected conceptual removals include:

```text
selectedMarkId
selectedSpanId
draftStartMarkId
draftEndMarkId
contextStack
anchorMarkId
bindPassageStart
bindPassageEnd
```

## 4. Run automated checks

```bash
npm run check
```

Expected output:

```text
All logic tests passed.
Integration check passed: 74 DOM references, 0 missing.
Startup smoke passed.
```

## 5. Run a browser smoke test

Serve the repository:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` and verify this exact sequence:

1. Load a YouTube video.
2. Click two timeline Addresses in succession.
3. Confirm Repeat Window shows only the second Traversal.
4. Press Repeat and confirm that extent loops.
5. Press Widen and confirm Current and Repeat Window remain unchanged.
6. Narrow Earlier and Later.
7. Step inside and outside Resolution.
8. Add Marks at both endpoints.
9. Save Repeat Window as a titled Section.
10. Click the Section and confirm Current moves to its midpoint.
11. Click its Start endpoint and confirm the first half becomes Repeat Window.
12. Focus the Section and confirm Range snaps to its bounds.
13. Press Play and confirm Range loops.
14. Unfocus and confirm the preceding Range returns.
15. Undo navigation, Focus, Range, Mark creation, and Section creation.
16. Add enough nearby Marks to confirm timeline clustering.
17. Reload the page and confirm Guide persistence.
18. Load a video with existing v2 data and confirm Sections migrate.

## 6. Commit and push

```bash
git add app.js index.html styles.css structure.js traversal.js youtube.js \
  package.json tests.mjs integration-check.mjs startup-smoke.mjs \
  README.md SPEC.md IMPLEMENTATION.md BRANCH_INSTALL.md

git commit -m "Refactor guide around composable temporal operations"
git push -u origin feature/guide-v3
```

## 7. Merge

Create a pull request from `feature/guide-v3` to `main`. After checks and the browser smoke test pass:

```bash
git switch main
git pull --ff-only
git merge --ff-only feature/guide-v3
git push origin main
```

Use the pull-request merge button instead when branch protection requires it.

## Rollback

Version 3 writes a new local-storage key and does not delete the previous v2 key. Reverting the Git commit restores the prior application and its v2 data remains available.
