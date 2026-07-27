name: Complete Binary YouTube Reader v5.2

on:
  push:
    paths:
      - apply-v5.2-completion.mjs
      - .github/workflows/complete-v5.2-after-core.yml
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: complete-binary-youtube-reader-v5-2-${{ github.ref }}
  cancel-in-progress: false

jobs:
  complete-and-test:
    if: github.actor != 'github-actions[bot]'
    runs-on: ubuntu-latest
    steps:
      - name: Check out this branch
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Complete and test v5.2
        run: node apply-v5.2-completion.mjs

      - name: Remove one-use completion files
        run: |
          rm -f apply-v5.2-completion.mjs
          rm -f .github/workflows/complete-v5.2-after-core.yml

      - name: Commit verified v5.2
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --cached --quiet; then
            echo "No changes to commit."
            exit 0
          fi
          git commit -m "Complete comprehensive Binary YouTube Reader v5.2"
          git push origin "HEAD:${GITHUB_REF_NAME}"
