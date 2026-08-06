// Sole raw YouTube IFrame API adapter. Other modules consume this normalized boundary.
export const YOUTUBE_STATE = Object.freeze({
  UNSTARTED: "unstarted",
  ENDED: "ended",
  PLAYING: "playing",
  PAUSED: "paused",
  BUFFERING: "buffering",
  CUED: "cued",
  UNKNOWN: "unknown"
});

const RAW_STATE = Object.freeze({
  [-1]: YOUTUBE_STATE.UNSTARTED,
  0: YOUTUBE_STATE.ENDED,
  1: YOUTUBE_STATE.PLAYING,
  2: YOUTUBE_STATE.PAUSED,
  3: YOUTUBE_STATE.BUFFERING,
  5: YOUTUBE_STATE.CUED
});

const INTERNAL_PAUSE_TTL_MS = 1200;
const DEFAULT_IFRAME_ALLOW = [
  "accelerometer",
  "autoplay",
  "clipboard-write",
  "encrypted-media",
  "gyroscope",
  "picture-in-picture",
  "web-share"
].join("; ");

function playerStateName(value) {
  return RAW_STATE[value] || YOUTUBE_STATE.UNKNOWN;
}

export function parseTimeValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);

  const colon = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (colon) {
    const hours = Number(colon[1] || 0);
    const minutes = Number(colon[2]);
    const seconds = Number(colon[3]);
    if (minutes < 60 && seconds < 60) return hours * 3600 + minutes * 60 + seconds;
    return 0;
  }

  const units = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!units || !units[0]) return 0;
  return Number(units[1] || 0) * 3600
    + Number(units[2] || 0) * 60
    + Number(units[3] || 0);
}

function hashTime(url) {
  const hash = String(url.hash || "").replace(/^#/, "");
  if (!hash) return 0;
  const params = new URLSearchParams(hash);
  return parseTimeValue(params.get("t"))
    || parseTimeValue(params.get("start"))
    || parseTimeValue(hash.replace(/^t=/i, ""));
}

export function parseYouTubeUrl(input) {
  const value = String(input || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return { videoId: value, startSeconds: 0 };

  let url;
  try { url = new URL(value); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol)) return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTubeHost = host === "youtube.com" || host.endsWith(".youtube.com")
    || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
  let videoId = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || null;
  } else if (isYouTubeHost) {
    videoId = url.searchParams.get("v");
    if (!videoId) {
      const parts = url.pathname.split("/").filter(Boolean);
      const index = parts.findIndex(part => ["embed", "shorts", "live"].includes(part));
      videoId = index >= 0 ? parts[index + 1] : null;
    }
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) return null;
  const startSeconds = Math.max(
    0,
    parseTimeValue(url.searchParams.get("t"))
      || parseTimeValue(url.searchParams.get("start"))
      || hashTime(url)
  );
  return { videoId, startSeconds };
}

function currentOrigin() {
  const origin = globalThis.location?.origin;
  return typeof origin === "string" && /^https?:\/\//.test(origin) ? origin : null;
}

function loadedVideoId(rawPlayer) {
  const data = rawPlayer?.getVideoData?.();
  const value = data?.video_id ?? data?.videoId;
  return /^[A-Za-z0-9_-]{11}$/.test(String(value || ""))
    ? String(value)
    : null;
}

export function isYouTubeApiReady() {
  return typeof globalThis.YT?.Player === "function";
}

export function createYouTubePlayer(elementId, options = {}) {
  if (!isYouTubeApiReady()) throw new Error("YouTube IFrame API is not ready.");
  let rawPlayer = null;
  let internalPauseUntil = 0;
  let internalPauseCount = 0;
  const callbacks = options.events || {};
  const origin = currentOrigin();
  const playerVars = {
    playsinline: 1,
    controls: 1,
    rel: 0,
    ...(origin ? { origin } : {}),
    ...(options.playerVars || {})
  };

  function configureIframe() {
    const iframe = rawPlayer?.getIframe?.();
    if (!iframe) return null;
    iframe.setAttribute?.("allow", options.iframeAllow || DEFAULT_IFRAME_ALLOW);
    iframe.setAttribute?.("tabindex", "-1");
    if (options.accessible === false) iframe.setAttribute?.("aria-hidden", "true");
    return iframe;
  }

  const adapter = {
    chapter(videoId, startSeconds = 0) {
      rawPlayer?.cueVideoById({ videoId, startSeconds });
    },
    play() {
      rawPlayer?.playVideo();
    },
    pause() {
      const state = rawPlayer?.getPlayerState?.();
      // A paused/cued player needs no pause command. Avoiding redundant calls
      // also prevents delayed PAUSED events from cancelling a later transport.
      if (state !== 1 && state !== 3) return;
      internalPauseCount += 1;
      internalPauseUntil = Date.now() + INTERNAL_PAUSE_TTL_MS;
      rawPlayer?.pauseVideo();
    },
    place(address, allowSeekAhead = true) {
      rawPlayer?.seekTo(address, allowSeekAhead);
    },
    setRate(rate) {
      rawPlayer?.setPlaybackRate(rate);
    },
    mute() {
      rawPlayer?.mute?.();
    },
    unmute() {
      rawPlayer?.unMute?.();
    },
    releaseKeyboardFocus(activeElement) {
      const iframe = rawPlayer?.getIframe?.();
      if (!iframe || activeElement !== iframe) return false;
      iframe.blur?.();
      return true;
    },
    destroy() {
      rawPlayer?.destroy?.();
      rawPlayer = null;
    },
    read() {
      const time = rawPlayer?.getCurrentTime?.();
      const duration = rawPlayer?.getDuration?.();
      const rate = rawPlayer?.getPlaybackRate?.();
      const rawState = rawPlayer?.getPlayerState?.();
      const rates = rawPlayer?.getAvailablePlaybackRates?.();
      return {
        // This is the iframe's loaded source identity, not the application's
        // most recent request. Source-generation ownership compares the two.
        videoId: loadedVideoId(rawPlayer),
        time: Number.isFinite(time) ? time : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        rate: Number.isFinite(rate) ? rate : 1,
        state: playerStateName(rawState),
        rawState: Number.isFinite(rawState) ? rawState : -1,
        availableRates: Array.isArray(rates) && rates.length ? rates : [1]
      };
    }
  };

  rawPlayer = new globalThis.YT.Player(elementId, {
    width: options.width || "100%",
    height: options.height || "100%",
    playerVars,
    events: {
      onReady: event => {
        configureIframe();
        callbacks.onReady?.(adapter, event);
      },
      onStateChange: event => {
        if (Date.now() > internalPauseUntil) internalPauseCount = 0;
        const internal = event.data === 2 && internalPauseCount > 0;
        if (internal) internalPauseCount -= 1;
        if (event.data === 2 && internalPauseCount === 0) internalPauseUntil = 0;
        callbacks.onStateChange?.(playerStateName(event.data), event.data, { event, internal });
      },
      onPlaybackRateChange: event => callbacks.onPlaybackRateChange?.(event.data, event),
      onAutoplayBlocked: event => callbacks.onAutoplayBlocked?.(event),
      onError: event => callbacks.onError?.(event.data, event)
    }
  });
  configureIframe();

  return adapter;
}
