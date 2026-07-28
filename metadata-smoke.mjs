import assert from "node:assert/strict";
import { createSmokeEnvironment } from "./smoke-harness.mjs";

const env = createSmokeEnvironment({ duration: 0 });
const { byId, flush, delay, currentText } = env;

await import("./app.js");
window.onYouTubeIframeAPIReady();
await flush();

byId.get("youtube-url").value = "https://youtu.be/dQw4w9WgXcQ";
byId.get("load-video").click();
await flush(4);

assert.match(byId.get("status").textContent, /metadata/i);
assert.equal(byId.get("range-label").textContent, "—", "A zero-duration metadata response must not create a false Range.");

await delay(180);
env.center().duration = 100;
await delay(220);
await flush();

assert.equal(byId.get("range-label").textContent, "0:00.000–1:40.000");
assert.equal(currentText(), "Current 0:00.000");
assert.match(byId.get("status").textContent, /Loaded 1:40\.000 video/);

console.log("Metadata smoke passed: delayed YouTube duration is retried and loaded without a false zero-length session.");
