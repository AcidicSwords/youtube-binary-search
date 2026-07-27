from pathlib import Path

path = Path("index.html")
content = path.read_text(encoding="utf-8")
before = '''                <button id="continue" class="field-transport" type="button" aria-keyshortcuts="Space" disabled>
                  <span id="continue-label">Continue</span><span id="continue-meta" class="control-meta">—</span>
                </button>'''
after = '''                <button id="continue" class="sr-only" type="button" aria-keyshortcuts="Space" disabled>
                  <span id="continue-label">Continue</span><span id="continue-meta">—</span>
                </button>'''
count = content.count(before)
if count != 1:
    raise RuntimeError(f"Expected one visible Center transport control, found {count}")
path.write_text(content.replace(before, after, 1), encoding="utf-8")

readme = Path("README.md")
text = readme.read_text(encoding="utf-8")
text = text.replace(
    "Context belongs to Current, Skim to the Forward Target, and Loop to an explicit Extent.",
    "Native Center play/pause remains the sole visible transport authority. Context belongs to Current, Skim to the Forward Target, and Loop to an explicit Extent."
)
readme.write_text(text, encoding="utf-8")

implementation = Path("IMPLEMENTATION.md")
text = implementation.read_text(encoding="utf-8")
text += "\nNative YouTube play/pause is the sole visible Continue/Pause authority. The hidden application control remains only as a programmatic and test surface; native PLAYING and PAUSED events continue through the same transport settlement path.\n"
implementation.write_text(text, encoding="utf-8")

print("Applied sole-visible-transport audit.")
