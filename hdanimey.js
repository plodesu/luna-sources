/**
 * HDAnimey – Sora / Luna
 * Hindi hardsub anime
 * Search: https://hdanimey.com/?s=
 * Player: play.hdanimey.com – episodes JS object
 * Resolve: Smoothpre (VidHide packer) → m3u8
 * v1.0.0
 */
const baseUrl = "https://hdanimey.com";
const playHost = "https://play.hdanimey.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
      Accept: "text/html,application/json,*/*",
      Referer: baseUrl + "/",
    },
    options.headers || {}
  );
  const method = options.method || "GET";
  const body = options.body || null;
  try {
    if (typeof fetchv2 === "function") {
      const r = await fetchv2(url, headers, method, body);
      if (r) return r;
    }
  } catch (e) {}
  try {
    return await fetch(url, { method: method, headers: headers, body: body });
  } catch (e2) {
    return null;
  }
}

async function getText(res) {
  if (res == null) return "";
  try {
    if (typeof res === "string") return res;
    if (typeof res.text === "function") return String((await res.text()) || "");
    if (typeof res === "object") {
      if (typeof res.data === "string") return res.data;
      if (typeof res.body === "string") return res.body;
    }
    return String(res);
  } catch (e) {
    return "";
  }
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}
function forceHttps(u) {
  return String(u || "").replace(/^http:\/\//i, "https://");
}
function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return (base || baseUrl) + u;
  return u;
}
function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\((?:Ss?|Season)\s*\d+\)/gi, " ")
    .replace(/\b(?:Ss?|Season)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHref(url) {
  const s = String(url || "");
  const epM = s.match(/[?#&]ep=(\d+)/i) || s.match(/#ep-(\d+)/i);
  let playUrl = "";
  const playM = s.match(
    /https?:\/\/play\.hdanimey\.com\/([^/?#]+)\/?/i
  );
  if (playM) playUrl = playHost + "/" + playM[1] + "/";
  const seriesM = s.match(/https?:\/\/(?:www\.)?hdanimey\.com\/([^/?#]+)\/?/i);
  return {
    episode: epM ? parseInt(epM[1], 10) : 0,
    playUrl: playUrl,
    seriesUrl: seriesM && !/play\.|i\./i.test(s)
      ? baseUrl + "/" + seriesM[1] + "/"
      : "",
    raw: s,
  };
}

function epHref(playUrl, n) {
  const base = String(playUrl || "").replace(/[?#].*$/, "").replace(/\/?$/, "/");
  return base + "#ep-" + n;
}

function toPlayUrl(href) {
  if (!href) return "";
  href = forceHttps(href);
  if (/play\.hdanimey\.com/i.test(href)) {
    return href.replace(/[?#].*$/, "").replace(/\/?$/, "/") ;
  }
  if (/i\.hdanimey\.com/i.test(href)) {
    return href
      .replace(/i\.hdanimey\.com/i, "play.hdanimey.com")
      .replace(/[?#].*$/, "")
      .replace(/\/?$/, "/");
  }
  return "";
}

/** Find play.hdanimey.com URL from series page HTML */
function findPlayUrl(html) {
  let m =
    html.match(
      /href="(https:\/\/play\.hdanimey\.com\/[^"]+)"/i
    ) ||
    html.match(
      /href="(https:\/\/i\.hdanimey\.com\/[^"]+)"/i
    ) ||
    html.match(
      /class="custom-button"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="custom-button"/i
    );
  if (m) {
    const u = m[1] || m[2];
    const p = toPlayUrl(u);
    if (p) return p;
  }
  m = html.match(/Watch Here[\s\S]{0,80}?href="([^"]+)"|href="([^"]+)"[\s\S]{0,40}?Watch Here/i);
  if (m) {
    const p = toPlayUrl(m[1] || m[2]);
    if (p) return p;
  }
  return "";
}

/** Parse const episodes = {...} from play page */
function parseEpisodesObject(html) {
  const m = html.match(
    /const\s+episodes\s*=\s*(\{[\s\S]*?\n\s*\})\s*;/
  ) || html.match(/episodes\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:const|let|var|function|document|\/\/)/);
  if (!m) return null;
  try {
    // keys may be "01" – JSON-compatible if quoted
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

function sortedEpKeys(obj) {
  if (!obj) return [];
  const keys = Object.keys(obj);
  keys.sort(function (a, b) {
    return parseInt(a, 10) - parseInt(b, 10);
  });
  return keys;
}

/* -------- Dean Edwards packer (VidHide / Smoothpre) -------- */
function unpackPacker(html) {
  const m = html.match(
    /\}\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'\s*\.split\s*\(\s*'\|'\s*\)/
  );
  if (!m) return "";
  const payload = m[1];
  const a = parseInt(m[2], 10);
  const c0 = parseInt(m[3], 10);
  const keywords = m[4].split("|");
  function toBase(n) {
    return (
      (n < a ? "" : toBase(Math.floor(n / a))) +
      (n % a > 35
        ? String.fromCharCode((n % a) + 29)
        : "0123456789abcdefghijklmnopqrstuvwxyz".charAt(n % a))
    );
  }
  const d = {};
  let c = c0;
  while (c--) {
    const key = toBase(c);
    d[key] = keywords[c] || key;
  }
  const unpacked = payload.replace(/\b\w+\b/g, function (w) {
    return d[w] !== undefined ? d[w] : w;
  });
  return unpacked
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
}

function extractM3u8FromEmbed(html) {
  const unpacked = unpackPacker(html) || html;
  let m =
    unpacked.match(/"hls2"\s*:\s*"(https?:[^"]+m3u8[^"]*)"/i) ||
    unpacked.match(/"hls3"\s*:\s*"(https?:[^"]+\.(?:m3u8|txt)[^"]*)"/i) ||
    unpacked.match(/file\s*:\s*"(https?:[^"]+m3u8[^"]*)"/i) ||
    unpacked.match(/(https?:\/\/[^"'\s\\]+master\.m3u8[^"'\s\\]*)/i) ||
    unpacked.match(/(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
  if (m) return forceHttps(m[1].replace(/\\u0026/g, "&"));
  m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
  return m ? forceHttps(m[1]) : "";
}

async function resolveEmbed(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          "User-Agent": UA,
          Referer: playHost + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html) return "";
    return extractM3u8FromEmbed(html);
  } catch (e) {
    return "";
  }
}

function hostRank(url) {
  const u = String(url || "").toLowerCase();
  if (u.indexOf("smoothpre") >= 0 || u.indexOf("vidhide") >= 0) return 1;
  if (u.indexOf("cybervynx") >= 0 || u.indexOf("streamwish") >= 0) return 2;
  if (u.indexOf("bysesayeveum") >= 0 || u.indexOf("dood") >= 0) return 3;
  if (u.indexOf("abyss") >= 0) return 9;
  return 5;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);
    const html = await getText(
      await soraFetch(baseUrl + "/?s=" + encodeURIComponent(q))
    );
    if (!html) return JSON.stringify([]);
    const results = [];
    const seen = {};
    // entry-title links
    const re =
      /<h2 class="entry-title">\s*<a href="([^"]+)"[^>]*>\s*([^<]+)\s*<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      if (seen[href] || /\/(tag|category|author)\//i.test(href)) continue;
      seen[href] = true;
      let image = "";
      const before = html.substring(Math.max(0, m.index - 800), m.index);
      const im = before.match(
        /<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/i
      );
      if (im) image = absUrl(im[1]);
      results.push({
        title: m[2].replace(/&amp;/g, "&").trim(),
        image: image,
        href: href,
      });
    }
    return JSON.stringify(results.slice(0, 40));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const p = parseHref(url);
    const page = p.seriesUrl || url.split("#")[0];
    const html = await getText(await soraFetch(page));
    if (!html)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    let title = "";
    const tM =
      html.match(/property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<h1[^>]*>\s*([\s\S]*?)<\/h1>/i);
    if (tM) title = tM[1].replace(/<[^>]+>/g, "").trim();
    let desc = "";
    const dM =
      html.match(/<strong>Synopsis:<\/strong>\s*([\s\S]*?)(?:<\/p>|<a )/i) ||
      html.match(/property="og:description"\s+content="([^"]+)"/i);
    if (dM) desc = dM[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
    return JSON.stringify([
      {
        description: (desc || "Hindi Subbed – HDAnimey").slice(0, 900),
        aliases: title || "N/A",
        airdate: "N/A",
      },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

/** Resolve play page URL from series or direct play link */
async function resolvePlayPage(url) {
  const p = parseHref(url);
  if (p.playUrl) return p.playUrl;
  if (/play\.hdanimey\.com/i.test(url)) {
    return String(url).replace(/[?#].*$/, "").replace(/\/?$/, "/");
  }
  const series = p.seriesUrl || url.split("#")[0];
  const html = await getText(await soraFetch(series));
  return findPlayUrl(html || "");
}

/* ===================== EPISODES ===================== */
async function extractEpisodes(url) {
  try {
    const playUrl = await resolvePlayPage(url);
    if (!playUrl) return JSON.stringify([]);
    const html = await getText(
      await soraFetch(playUrl, {
        headers: { "User-Agent": UA, Referer: baseUrl + "/" },
      })
    );
    if (!html) return JSON.stringify([]);
    const obj = parseEpisodesObject(html);
    if (!obj) return JSON.stringify([]);
    const keys = sortedEpKeys(obj);
    const eps = [];
    for (let i = 0; i < keys.length; i++) {
      const n = parseInt(keys[i], 10);
      if (!n) continue;
      eps.push({
        href: epHref(playUrl, n),
        number: n,
        title: "Episode " + n,
      });
    }
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    const want = p.episode || 1;
    const playUrl = await resolvePlayPage(url);
    if (!playUrl)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const html = await getText(
      await soraFetch(playUrl, {
        headers: { "User-Agent": UA, Referer: baseUrl + "/" },
      })
    );
    if (!html)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const obj = parseEpisodesObject(html);
    if (!obj)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    // match "01" or "1"
    let embeds =
      obj[String(want).padStart(2, "0")] ||
      obj[String(want)] ||
      obj[want];
    if (!embeds || !embeds.length) {
      const keys = sortedEpKeys(obj);
      if (keys.length) embeds = obj[keys[0]];
    }
    if (!embeds || !embeds.length)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const sorted = embeds.slice().sort(function (a, b) {
      return hostRank(a) - hostRank(b);
    });

    const streams = [];
    const seen = {};
    // Prefer Smoothpre; try a few hosts
    const limit = Math.min(sorted.length, 4);
    for (let i = 0; i < limit; i++) {
      const embed = sorted[i];
      if (!isHttp(embed)) continue;
      // Abyss rarely yields clean HLS in Sora — skip first pass
      if (/abyssplayer/i.test(embed) && streams.length) continue;
      const media = await resolveEmbed(embed);
      if (!media || !isHttp(media) || seen[media]) continue;
      if (!/\.m3u8/i.test(media) && media.indexOf("m3u8") < 0) continue;
      seen[media] = true;
      let label = "Server " + (i + 1);
      if (/smoothpre|vidhide/i.test(embed)) label = "Smoothpre · HLS";
      else if (/cybervynx/i.test(embed)) label = "CyberVynx";
      else if (/abyss/i.test(embed)) label = "Abyss";
      const headers = {
        "User-Agent": UA,
        Referer: embed,
        Origin: embed.replace(/^(https?:\/\/[^/]+).*/, "$1"),
        Accept: "*/*",
      };
      streams.push({
        title: label + " · Ep " + want,
        name: label,
        streamUrl: media,
        headers: headers,
      });
      // one good Smoothpre is enough for default
      if (/smoothpre/i.test(embed) && streams.length >= 1) break;
    }

    streams.sort(function (a, b) {
      return hostRank(a.title) - hostRank(b.title);
    });

    const primary = streams.length ? streams[0].streamUrl : "";
    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 6),
      subtitles: "",
      subtitle: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
