import assert from "node:assert/strict";
import {
  YOUTUBE_STATE,
  createYouTubePlayer,
  parseTimeValue,
  parseYouTubeUrl
} from "./youtube.js";

assert.equal(parseTimeValue("1:02"), 62);
assert.equal(parseTimeValue("1h2m3.5s"), 3723.5);
assert.deepEqual(
  parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=42"),
  { videoId: "dQw4w9WgXcQ", startSeconds: 42 }
);

const originalYT = globalThis.YT;
const originalLocation = globalThis.location;
let rawPlayer = null;
const confirmedRates = [];

class FakePlayer {
  constructor(_elementId, config) {
    this.events = config.events;
    this.videoId = null;
    this.time = 0;
    this.duration = 120;
    this.actualRate = 1;
    this.state = 5;
    this.rateRequests = [];
    this.iframe = {
      setAttribute() {},
      blur() {}
    };
    rawPlayer = this;
  }

  cueVideoById({ videoId, startSeconds }) {
    this.videoId = videoId;
    this.time = startSeconds;
  }

  getVideoData() { return { video_id: this.videoId }; }
  getCurrentTime() { return this.time; }
  getDuration() { return this.duration; }
  getPlaybackRate() { return this.actualRate; }
  getPlayerState() { return this.state; }
  getAvailablePlaybackRates() { return [0.5, 1, 1.5, 2]; }
  getIframe() { return this.iframe; }
  setPlaybackRate(rate) { this.rateRequests.push(rate); }
  playVideo() {}
  pauseVideo() {}

  confirmRate(rate) {
    this.actualRate = rate;
    this.events.onPlaybackRateChange?.({ data: rate, target: this });
  }
}

try {
  globalThis.location = { origin: "https://example.test" };
  globalThis.YT = { Player: FakePlayer };

  const player = createYouTubePlayer("player", {
    events: {
      onPlaybackRateChange: rate => confirmedRates.push(rate)
    }
  });

  assert.deepEqual(player.read(), {
    videoId: null,
    time: 0,
    duration: 120,
    rate: 1,
    state: YOUTUBE_STATE.CUED,
    rawState: 5,
    availableRates: [0.5, 1, 1.5, 2]
  });

  player.chapter("dQw4w9WgXcQ", 12);
  assert.equal(player.read().videoId, "dQw4w9WgXcQ",
    "The adapter snapshot exposes the source identity actually loaded by YouTube.");
  assert.equal(player.read().time, 12);

  player.setRate(2);
  assert.deepEqual(rawPlayer.rateRequests, [2]);
  assert.equal(player.read().rate, 1,
    "Issuing a rate request does not fabricate an accepted actual rate.");
  assert.deepEqual(confirmedRates, [],
    "Only YouTube's playback-rate event confirms actual rate.");

  rawPlayer.confirmRate(1.5);
  assert.equal(player.read().rate, 1.5);
  assert.deepEqual(confirmedRates, [1.5]);

  rawPlayer.videoId = "bad!";
  assert.equal(player.read().videoId, null,
    "Malformed adapter source identity cannot satisfy a load generation.");
} finally {
  if (originalYT === undefined) delete globalThis.YT;
  else globalThis.YT = originalYT;
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
}

console.log("YouTube adapter tests passed: loaded-source identity is observable and playback-rate events remain actual-rate authority.");
