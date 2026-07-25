export function parseTimeValue(value) {
  if (!value) return 0;

  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);

  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || !match[0]) return 0;

  return Number(match[1] || 0) * 3600
    + Number(match[2] || 0) * 60
    + Number(match[3] || 0);
}

export function parseYouTubeUrl(input) {
  const value = String(input || "").trim();

  if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
    return { videoId: value, startSeconds: 0 };
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTubeHost =
    host === "youtube.com"
    || host.endsWith(".youtube.com")
    || host === "youtube-nocookie.com"
    || host.endsWith(".youtube-nocookie.com");

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
  );

  return { videoId, startSeconds };
}
