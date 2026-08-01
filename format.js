// Rendering an Address as text. Pure functions of a number, depended on by both
// the presentation layer and the semantic kernel's transaction labels -- a
// transaction that names an object has to name it the way the interface does,
// or Undo describes a different object than the one on screen. Kept out of
// view.js so the kernel can use them without importing the DOM layer.

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000);
  const secs = Math.floor((totalCentiseconds % 6_000) / 100);
  const centiseconds = totalCentiseconds % 100;
  const minuteText = hours ? String(minutes).padStart(2, "0") : String(minutes);
  const fraction = centiseconds
    ? `.${String(centiseconds).padStart(2, "0").replace(/0$/, "")}`
    : "";
  return `${hours ? `${hours}:` : ""}${minuteText}:${String(secs).padStart(2, "0")}${fraction}`;
}

export function formatRange(extent) {
  return extent ? `${formatTime(extent.start)}–${formatTime(extent.end)}` : "—";
}

// One name for an unnamed Section, everywhere. A title alone cannot tell four
// unnamed Sections apart, and "Untitled Section" in an Undo label names none of
// them; the Address is the only thing that identifies it. Guide rows state the
// Address as a field of the row, so their titles stay bare -- this is the form
// for every context that has no such field.
export function sectionDisplayName(section) {
  return section?.label?.trim() || `Section ${formatRange(section)}`;
}
