name: Apply Binary YouTube Reader v5.2

on:
  push:
    paths:
      - apply-v5.2-patches.mjs
      - .github/workflows/apply-v5.2-web.yml
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: apply-binary-youtube-reader-v5-2-${{ github.ref }}
  cancel-in-progress: false

jobs:
  apply-and-test:
    if: github.actor != 'github-actions[bot]'
    runs-on: ubuntu-latest
    steps:
      - name: Check out the selected branch
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Verify, apply, and test v5.2
        run: node apply-v5.2-patches.mjs

      - name: Remove one-use installer files
        run: |
          rm -f apply-v5.2-patches.mjs
          rm -f .github/workflows/apply-v5.2-web.yml

      - name: Commit the verified v5.2 result
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --cached --quiet; then
            echo "No changes to commit."
            exit 0
          fi
          git commit -m "Apply comprehensive Binary YouTube Reader v5.2"
          git push origin "HEAD:${GITHUB_REF_NAME}"
