# Populate `feature/marked-traversal-v2` and merge it

This archive is a complete replacement source set for the repository root. It intentionally does not include `.git`, `.github`, or the existing favicon. Copy the files over the repository; do not delete unlisted repository files.

## 1. Prepare the existing branch

```bash
git clone https://github.com/AcidicSwords/youtube-binary-search.git
cd youtube-binary-search
git fetch origin
git switch feature/marked-traversal-v2
```

The branch already exists and currently matches `main`. Confirm the working tree is clean:

```bash
git status --short
```

It should print nothing.

## 2. Copy the package into the repository root

Extract the archive into a temporary directory, then copy these files over the repository root:

```text
README.md
SPEC.md
IMPLEMENTATION.md
BRANCH_INSTALL.md
app.js
index.html
package.json
structure.js
styles.css
tests.mjs
traversal.js
youtube.js
```

On macOS or Linux, from the extracted package directory:

```bash
cp README.md SPEC.md IMPLEMENTATION.md BRANCH_INSTALL.md \
  app.js index.html package.json structure.js styles.css \
  tests.mjs traversal.js youtube.js /path/to/youtube-binary-search/
```

Do not remove `.github/workflows/deploy-pages.yml` or `favicon.svg` from the repository.

## 3. Verify before committing

From the repository root:

```bash
npm run check
```

Expected final line:

```text
All logic tests passed.
```

Run a local smoke test:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` and verify:

1. Narrow twice, Widen, then Undo; the exact pre-Widen Frame returns.
2. Set Step to 5 seconds and verify Left/Right move exactly 5 seconds.
3. Press `M` at three positions; use `,` and `.` to traverse them.
4. Passage displays `Level n`.
5. Last Traversal displays `jumped` or `played`.
6. Hovering a timeline Mark shows its label and time.
7. Save Passage as a Span; Enter it, Widen inside it, then Exit.
8. Reload and confirm Marks and Spans persist.

## 4. Commit and push the feature branch

```bash
git add README.md SPEC.md IMPLEMENTATION.md BRANCH_INSTALL.md \
  app.js index.html package.json structure.js styles.css \
  tests.mjs traversal.js youtube.js

git commit -m "Add unified marked traversal system"
git push -u origin feature/marked-traversal-v2
```

Confirm the branch differs from `main`:

```bash
git log --oneline main..feature/marked-traversal-v2
git diff --stat main...feature/marked-traversal-v2
```

## 5. Merge through a pull request

Create a pull request from `feature/marked-traversal-v2` into `main`. The suggested title is:

```text
Add unified marked traversal system
```

Before merging, confirm the repository check passes and complete the smoke test above. Use a squash merge or merge commit; either is valid for this single coherent change set.

## 6. Direct local merge alternative

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff feature/marked-traversal-v2
npm run check
git push origin main
```

The GitHub Pages workflow runs only on `main` or `master`, so deployment begins after the merge to `main`.
