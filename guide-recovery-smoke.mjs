import assert from "node:assert/strict";
import { createGuide, ensurePin } from "./guide.js";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const VIDEO_ID = "dQw4w9WgXcQ";
const currentKey = `binary-youtube-reader:v9:${VIDEO_ID}`;
const olderKey = `binary-youtube-reader:v8:${VIDEO_ID}`;

async function boot(environment, name) {
  await import(`./app.js?guide-recovery=${name}-${Date.now()}`);
  window.onYouTubeIframeAPIReady();
  await environment.flush(3);
  environment.byId.get("youtube-url").value = `https://youtu.be/${VIDEO_ID}`;
  environment.byId.get("load-video").click();
  await environment.flush(8);
}

// A present empty string is damaged evidence, not an absent key. A successful
// quarantine preserves that exact value before the older Guide is migrated
// into the current key.
{
  const environment = createSmokeEnvironment();
  const fallback = createGuide(VIDEO_ID);
  ensurePin(fallback, 25, { label: "Recovered Pin" });
  environment.localStorage.values.set(currentKey, "");
  environment.localStorage.values.set(olderKey, JSON.stringify(fallback));

  await boot(environment, "empty-current-record");

  const quarantineKey = [...environment.localStorage.values.keys()].find(key =>
    key.startsWith(`binary-youtube-reader:unreadable:${VIDEO_ID}:`)
  );
  assert.ok(quarantineKey,
    "An empty current record must be quarantined before fallback recovery.");
  const evidence = JSON.parse(environment.localStorage.values.get(quarantineKey));
  assert.deepEqual(evidence, [{
    sourcePrefix: "binary-youtube-reader:v9:",
    stored: ""
  }], "Quarantine preserves the exact empty-string evidence.");
  assert.equal(environment.byId.get("pins-list-count").textContent, "1");
  assert.match(environment.byId.get("status").textContent, /recovered|preserving/i);
}

// An unreadable current record may fall back only after its evidence has been
// preserved. If that write fails, the recovered Guide remains usable in memory
// but the current key becomes read-only for this source.
{
  const environment = createSmokeEnvironment();
  const fallback = createGuide(VIDEO_ID);
  ensurePin(fallback, 25, { label: "Recovered Pin" });
  const damaged = "";
  environment.localStorage.values.set(currentKey, damaged);
  environment.localStorage.values.set(olderKey, JSON.stringify(fallback));
  environment.localStorage.throwOnSet = true;

  await boot(environment, "quarantine-write-failure");

  assert.equal(environment.byId.get("pins-list-count").textContent, "1",
    "A valid older Guide remains available even when quarantine storage fails.");
  assert.match(
    environment.byId.get("status").textContent,
    /could not be preserved|will not overwrite/i,
    "The interface must not claim preservation when quarantine failed."
  );
  assert.equal(environment.localStorage.values.get(currentKey), damaged);
  assert.equal(
    [...environment.localStorage.values.keys()]
      .some(key => key.startsWith(`binary-youtube-reader:unreadable:${VIDEO_ID}:`)),
    false
  );

  environment.localStorage.throwOnSet = false;
  environment.byId.get("tag").click();
  await environment.flush(3);
  assert.equal(environment.localStorage.values.get(currentKey), damaged,
    "Later semantic edits cannot overwrite evidence whose quarantine failed.");
}

// A storage read failure is not the same as an absent Guide. With no readable
// evidence to quarantine, recovery reports the failure and disables rewriting.
{
  const environment = createSmokeEnvironment();
  environment.localStorage.throwOnGet = true;

  await boot(environment, "read-failure");

  assert.equal(environment.byId.get("pins-list-count").textContent, "0");
  assert.match(
    environment.byId.get("status").textContent,
    /could not be read or preserved|saving is disabled/i,
    "An empty Guide caused by a read failure must not be reported as never saved."
  );

  environment.localStorage.throwOnGet = false;
  environment.byId.get("tag").click();
  await environment.flush(3);
  assert.equal(environment.localStorage.values.has(currentKey), false,
    "A read failure cannot be followed by a destructive current-version save.");
}

console.log("Guide recovery smoke passed: an empty current record is quarantined as evidence, older fallback is non-destructive, quarantine failure is reported, read failure is distinct from absence, and unsafe current records remain read-only.");
