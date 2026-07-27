# Binary YouTube Reader v5.2 — Direct Core Drop-In

These are the three complete semantic core replacements from the final comprehensive v5.2 patch:

- `range-geometry.js`
- `session.js`
- `transport.js`

## GitHub web upload

On a branch created from the audited v5.1 `main` commit:

1. Open the repository root.
2. Choose **Add file → Upload files**.
3. Drag the three `.js` files from this folder onto the upload page.
4. Commit them to the branch.

## Important

These three files are the correct final v5.2 core, but they are not the entire upgrade by themselves. The comprehensive v5.2 release also changes `app.js`, `view.js`, `styles.css`, `index.html`, `package.json`, tests, and documentation so the interface and runtime use the new core correctly.

Use these core files together with the GitHub-web installer package. The installer applies the remaining exact edits and runs the complete repository test suite.

Do not mix these files with the earlier safe-patch draft. They correspond to the final comprehensive v5.2 interaction model.
