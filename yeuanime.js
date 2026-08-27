/**
 * yeuanime.buzz – Sora / Luna
 * Search:   /tim-kiem?q=
 * Series:   /phim/{slug}
 * Episodes: /xem-phim/{slug}/tap-{num}/{lang}?server={SERVER}
 * Stream:   hidden input "url" in watch page → HLS master
 * v1.0.8
 */

const baseUrl = "https://yeuanime.buzz";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// ---------- HELPERS ----------
async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "vi,en;q=0.9",
      Accept: "text/html,application/json,*/*",
      Referer: baseUrl + "/",
      "Accept-Encoding": "identity",
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
  } catch (_) {}
  try {
    return await fetch(url, { method, headers, body });
  } catch (_) {
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
  } catch (_) {
    return "";
  }
}

// ---------- CACHE ----------
const __cache = Object.create(null);
const __max = 80;

function __cacheSet(key, value) {
  const keys = Object.keys(__cache);
  if (keys.length >= __max) delete __cache[keys[0]];
  __cache[key] = value;
}

async function cachedText(url, options) {
  if (typeof __cache[url] === "string") return __cache[url];
  const res = await soraFetch(url, options);
  const text = await getText(res);
  if (!text) return text;
  const status = res && res.status != null ? res.status : 200;
  if (status >= 200 && status < 300) __cacheSet(url, text);
  return text;
}

function absUrl(u) {
  if (!u) return "";
  u = String(u).trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanQuery(q) {
  return String(q || "").replace(/\s+/g, " ").trim();
}

function pad2(n) {
  n = String(n);
  return n.length < 2 ? "0" + n : n;
}

function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/xem-phim\/([^/]+?)\/tap-(\d+)\/([^?]+)/i);
  if (m) {
    return { type: "episode", slug: m[1], episode: parseInt(m[2], 10), lang: m[3] };
  }
  m = s.match(/\/phim\/([^/?#]+)/i);
  if (m) return { type: "series", slug: m[1] };
  return { type: "unknown", slug: "" };
}

// ---------- SEARCH ----------
async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);

    const html = await cachedText(baseUrl + "/tim-kiem?q=" + encodeURIComponent(q));
    if (!html || html.length < 100) return JSON.stringify([]);

    const results = [];
    const seen = {};

    // Pattern 1: <a href="/phim/SLUG"> ... <img src="..." alt="TITLE">
    const re1 = /<a[^>]+href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"[^>]*>/gi;
    let m;
    while ((m = re1.exec(html))) {
      const slug = m[1];
      const image = absUrl(m[2]);
      let title = decodeEntities(m[3]).trim();
      if (!title) {
        // try nearby h3
        const slice = html.slice(Math.max(0, m.index - 300), m.index + 500);
        const h = slice.match(/<h3[^>]*>([^<]+)<\/h3>/);
        if (h) title = decodeEntities(h[1]).trim();
      }
      if (!title) title = slug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const href = baseUrl + "/phim/" + slug;
      if (!seen[href]) {
        seen[href] = true;
        results.push({ title, image, href });
      }
    }

    // Pattern 2: fallback – just <a href="/phim/SLUG"> and h3
    if (results.length === 0) {
      const re2 = /<a[^>]+href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/gi;
      while ((m = re2.exec(html))) {
        const slug = m[1];
        const title = decodeEntities(m[2]).trim();
        const href = baseUrl + "/phim/" + slug;
        if (!seen[href]) {
          seen[href] = true;
          // try to find an image
          const slice = html.slice(Math.max(0, m.index - 500), m.index + 100);
          const img = slice.match(/<img[^>]+src="([^"]+)"/);
          const image = img ? absUrl(img[1]) : "";
          results.push({ title, image, href });
        }
      }
    }

    // Pattern 3: absolute fallback – list all /phim/ links
    if (results.length === 0) {
      const re3 = /\/phim\/([^"'\s?]+)/g;
      while ((m = re3.exec(html))) {
        const slug = m[1];
        const href = baseUrl + "/phim/" + slug;
        if (!seen[href]) {
          seen[href] = true;
          const title = slug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          results.push({ title, image: "", href });
        }
      }
    }

    return JSON.stringify(results.slice(0, 30));
  } catch (_) {
    return JSON.stringify([]);
  }
}

// ---------- DETAILS ----------
async function extractDetails(url) {
  try {
    const html = await cachedText(url);
    let description = "N/A",
      aliases = "N/A",
      airdate = "N/A";

    // JSON-LD
    const ld = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (ld) {
      try {
        const data = JSON.parse(ld[1]);
        let item = data;
        if (Array.isArray(data)) {
          for (let i of data) {
            if (i['@type'] === 'TVSeries' || i['@type'] === 'Movie') item = i;
          }
        }
        if (item) {
          if (item.description) description = decodeEntities(item.description).replace(/<[^>]+>/g, "").slice(0, 500);
          if (item.name) aliases = decodeEntities(item.name);
          if (item.datePublished) airdate = item.datePublished.substring(0, 4);
        }
      } catch (_) {}
    }

    // meta fallback
    if (description === "N/A") {
      const d = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
      if (d) description = decodeEntities(d[1]).slice(0, 500);
    }
    if (aliases === "N/A") {
      const t = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
                html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) aliases = decodeEntities(t[1]);
    }
    if (airdate === "N/A") {
      const y = html.match(/(\d{4})/);
      if (y) airdate = y[1];
    }

    return JSON.stringify([{ description, aliases, airdate }]);
  } catch (_) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

// ---------- EPISODES ----------
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    if (p.type !== "series" || !p.slug) {
      // if it's an episode, try to get slug
      const m = String(url).match(/\/xem-phim\/([^/]+?)\//);
      if (m) {
        const slug = m[1];
        return await extractEpisodes(baseUrl + "/phim/" + slug);
      }
      return JSON.stringify([]);
    }

    const html = await cachedText(baseUrl + "/phim/" + p.slug);
    if (!html) return JSON.stringify([]);

    const episodes = [];
    const seen = {};

    // Exact pattern: <a href="/xem-phim/{slug}/tap-{num}/{lang}?server={SERVER}"><p>Tập {num}</p></a>
    const re = /<a[^>]+href="(\/xem-phim\/[^"]+?)"[^>]*>[\s\S]*?<p[^>]*>([^<]+)<\/p>[\s\S]*?<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const title = decodeEntities(m[2]).trim();
      const epMatch = href.match(/\/tap-(\d+)\//);
      if (!epMatch) continue;
      const epNum = parseInt(epMatch[1], 10);
      if (!seen[epNum]) {
        seen[epNum] = true;
        episodes.push({
          href,
          number: epNum,
          season: 1,
          episode: epNum,
          title: title || "Tập " + epNum
        });
      }
    }

    // fallback: just links
    if (episodes.length === 0) {
      const re2 = /href="(\/xem-phim\/[^"]+?)"/gi;
      while ((m = re2.exec(html))) {
        const href = absUrl(m[1]);
        const epMatch = href.match(/\/tap-(\d+)\//);
        if (!epMatch) continue;
        const epNum = parseInt(epMatch[1], 10);
        if (!seen[epNum]) {
          seen[epNum] = true;
          episodes.push({
            href,
            number: epNum,
            season: 1,
            episode: epNum,
            title: "Tập " + epNum
          });
        }
      }
    }

    episodes.sort((a, b) => a.episode - b.episode);
    return JSON.stringify(episodes.slice(0, 300));
  } catch (_) {
    return JSON.stringify([]);
  }
}

// ---------- STREAMS ----------
async function extractStreamUrl(url) {
  try {
    const html = await cachedText(url);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    let hlsUrl = null;

    // 1. hidden input
    const inp = html.match(/<input[^>]+name="url"[^>]+value="([^"]+)"[^>]*>/i);
    if (inp) hlsUrl = inp[1];

    // 2. JS variable
    if (!hlsUrl) {
      const js = html.match(/url\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (js) hlsUrl = js[1];
    }

    // 3. direct .m3u8
    if (!hlsUrl) {
      const m3u = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
      if (m3u) hlsUrl = m3u[1];
    }

    if (!hlsUrl) return JSON.stringify({ streams: [], subtitles: "" });

    hlsUrl = hlsUrl.replace(/\\/g, "").trim();

    const headers = {
      "User-Agent": UA,
      "Referer": url,
      "Origin": baseUrl,
      "Accept": "*/*"
    };

    let subtitles = "";
    const sub = html.match(/<track[^>]+src="([^"]+\.vtt[^"]*)"[^>]*>/i);
    if (sub) subtitles = absUrl(sub[1]);

    return JSON.stringify({
      streams: [{ title: "HLS Stream", streamUrl: hlsUrl, headers }],
      subtitles
    });
  } catch (_) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
