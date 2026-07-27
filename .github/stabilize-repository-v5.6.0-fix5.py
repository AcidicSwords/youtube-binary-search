from pathlib import Path

path = Path("project-audit.mjs")
text = path.read_text()
old = 'assert.doesNotMatch(canonicalText, /Step size/i, "Visible and canonical vocabulary must use Reach.");'
new = '''assert.doesNotMatch(html, /Step size/i, "Visible interface vocabulary must use Reach.");
assert.match(docs["SPEC.md"], /scalar runtime Step size/, "Retired scalar vocabulary must remain explicitly classified as a non-contract.");'''
if text.count(old) != 1:
    raise RuntimeError("Reach vocabulary audit anchor")
path.write_text(text.replace(old, new, 1))
Path(".github/stabilize-repository-v5.6.0-fix5.py").unlink()
