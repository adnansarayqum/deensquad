import { describe, expect, it } from "vitest";
import { canonicalYouTube, embedUrl, parseYouTube, readVideoField, thumbnailUrl, VIDEO_ERROR } from "./video";

const ID = "dQw4w9WgXcQ";

describe("parseYouTube", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, null],
    [`https://youtube.com/watch?v=${ID}&feature=share`, null],
    [`http://m.youtube.com/watch?v=${ID}`, null],
    [`youtube.com/watch?v=${ID}`, null],
    [`https://youtu.be/${ID}`, null],
    [`https://youtu.be/${ID}?si=abc123`, null],
    [`https://youtu.be/${ID}?t=42`, 42],
    [`https://www.youtube.com/watch?v=${ID}&t=1m30s`, 90],
    [`https://www.youtube.com/watch?v=${ID}&t=90s`, 90],
    [`https://www.youtube.com/watch?v=${ID}#t=15`, 15],
    [`https://www.youtube.com/shorts/${ID}`, null],
    [`https://m.youtube.com/shorts/${ID}?feature=share`, null],
    [`https://www.youtube.com/embed/${ID}?start=30`, 30],
    [`  https://www.youtube.com/live/${ID}  `, null],
  ])("reads %s", (url, start) => {
    expect(parseYouTube(url)).toEqual({ id: ID, start });
  });

  it.each([
    "",
    "not a link",
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}`, // too short
    `https://www.youtube.com/watch?v=${ID}x`, // too long
    `https://www.youtube.com/watch?v=dQw4w9WgX%3C`, // not an id character
    "https://www.youtube.com/watch?v=",
    "https://www.youtube.com/",
    `https://www.youtube.com/playlist?list=${ID}`,
    `https://www.youtube.com/channel/${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://evil.com/youtube.com/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://youtu.be.evil.com/${ID}`,
    `https://vimeo.com/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://user:pass@www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    `javascript:alert(1)//youtube.com/watch?v=${ID}`,
    `ftp://youtu.be/${ID}`,
    `https://youtu.be/${ID}/extra`,
  ])("refuses %s", (url) => {
    expect(parseYouTube(url)).toBeNull();
  });

  it("refuses anything that isn't a string", () => {
    expect(parseYouTube(null)).toBeNull();
    expect(parseYouTube(42)).toBeNull();
  });
});

describe("stored and shown forms", () => {
  it("keeps one canonical link, with the start time when there is one", () => {
    expect(canonicalYouTube({ id: ID, start: null })).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(canonicalYouTube({ id: ID, start: 42 })).toBe(`https://www.youtube.com/watch?v=${ID}&t=42`);
    // The stored link reads back to the same video.
    expect(parseYouTube(canonicalYouTube({ id: ID, start: 42 }))).toEqual({ id: ID, start: 42 });
  });

  it("embeds from youtube-nocookie.com, and the thumbnail comes from i.ytimg.com", () => {
    expect(embedUrl({ id: ID, start: 30 })).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&autoplay=1&start=30`);
    expect(embedUrl({ id: ID, start: null })).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&autoplay=1`);
    expect(thumbnailUrl({ id: ID, start: null })).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("reads the form field: blank is no video, anything not YouTube is refused with the message", () => {
    expect(readVideoField(null)).toEqual({ ok: true, url: null });
    expect(readVideoField("   ")).toEqual({ ok: true, url: null });
    expect(readVideoField(`https://youtu.be/${ID}?t=5`)).toEqual({ ok: true, url: `https://www.youtube.com/watch?v=${ID}&t=5` });
    expect(readVideoField("https://example.com/video")).toEqual({ ok: false, error: VIDEO_ERROR });
  });
});
