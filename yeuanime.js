/**
 * YeuAnime – Sora / Luna Module
 * 
 * Search:     /tim-kiem?q=
 * Series:     /phim/{slug}
 * Episodes:   /xem-phim/{slug}/tap-{num}/{lang}?server=...
 * Stream:     Hidden input "url" in watch page form → HLS master
 */

const baseUrl = "https://yeuanime.buzz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ============ HELPERS ============

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({
    "User-Agent": UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/json,*/*",
    "Referer": baseUrl + "/",
  }, options.headers || {});

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
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n) {
  n = String(n);
  return n.length < 2 ? "0" + n : n;
}

// ============ PARSE URL ============

function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/xem-phim\/([^/]+?)\/tap-(\d+)\//i);
  if (m) {
    return { type: "episode", slug: m[1], episode: parseInt(m[2], 10) };
  }
  m = s.match(/\/phim\/([^/?#]+)/i);
  if (m) {
    return { type: "series", slug: m[1] };
  }
  return { type: "unknown", slug: "", episode: 0 };
}

// ============ SEARCH ============

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const url = baseUrl + "/tim-kiem?q=" + encodeURIComponent(cleaned);
    const html = await getText(await soraFetch(url));

    const results = [];
    const seen = {};

    // Find all anime cards: typically <a href="/phim/...">
    const re = /<a[^>]*href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*movie-title[^"]*"[^>]*>([^<]+)<\/[^>]+>/gi;
    let m;
    while ((m = re.exec(html))) {
      const slug = m[1];
      const image = absUrl(m[2]);
      let title = decodeEntities(m[3]).trim();
      if (!title) {
        // try another pattern
        const titleMatch = html.slice(m.index, m.index + 300).match(/<h[23][^>]*>([^<]+)<\/h[23]>/i);
        if (titleMatch) title = decodeEntities(titleMatch[1]).trim();
      }
      if (!title) continue;
      const href = absUrl("/phim/" + slug);
      if (seen[href]) continue;
      seen[href] = true;
      results.push({ title, image, href });
    }

    return JSON.stringify(results.slice(0, 30));
  } catch (_) {
    return JSON.stringify([]);
  }
}

// ============ DETAILS ============

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    const seriesUrl = p.type === "series" ? absUrl("/phim/" + p.slug) : String(url);
    const html = await getText(await soraFetch(seriesUrl));

    let description = "N/A";
    const dm = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
               html.match(/name=["']description["']\s+content=["']([^"']+)/i);
    if (dm) description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);

    let aliases = "N/A";
    const am = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym = html.match(/(\d{4})\s*<[^>]*class="[^"]*year[^"]*"/i);
    if (ym) airdate = ym[1];

    return JSON.stringify([{ description, aliases, airdate }]);
  } catch (_) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

// ============ EPISODES ============

async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    if (p.type !== "series" || !p.slug) {
      // If it's an episode URL, try to derive series slug
      const m = String(url).match(/\/xem-phim\/([^/]+?)\//i);
      if (m) {
        const slug = m[1];
        const seriesUrl = absUrl("/phim/" + slug);
        return await extractEpisodes(seriesUrl);
      }
      return JSON.stringify([]);
    }

    const seriesUrl = absUrl("/phim/" + p.slug);
    const html = await getText(await soraFetch(seriesUrl));

    const eps = [];
    const seen = {};

    // Find episode links: /xem-phim/{slug}/tap-{num}/{lang}?server=...
    const re = /<a[^>]*href="\/xem-phim\/([^/]+?)\/tap-(\d+)\/([^"?]+)[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*episode-title[^"]*"[^>]*>([^<]*)<\/[^>]+>/gi;
    let m;
    while ((m = re.exec(html))) {
      const slug = m[1];
      const epNum = parseInt(m[2], 10);
      const lang = m[3];
      const label = decodeEntities(m[4]).trim() || "Tập " + epNum;
      if (seen[epNum]) continue;
      seen[epNum] = true;
      const href = absUrl("/xem-phim/" + slug + "/tap-" + epNum + "/" + lang);
      // We can also include all language versions? For simplicity, take the first found (usually Vietsub)
      eps.push({
        href: href,
        number: epNum,
        season: 1, // No season grouping
        episode: epNum,
        title: label,
      });
    }

    // If no episodes found, maybe the page uses a different pattern.
    if (!eps.length) {
      const re2 = /href="(\/xem-phim\/[^"]+?\/tap-\d+\/[^"]+?)"/gi;
      let m2;
      while ((m2 = re2.exec(html))) {
        const href = absUrl(m2[1]);
        const epMatch = href.match(/\/tap-(\d+)\//);
        if (!epMatch) continue;
        const ep = parseInt(epMatch[1], 10);
        if (seen[ep]) continue;
        seen[ep] = true;
        eps.push({
          href: href,
          number: ep,
          season: 1,
          episode: ep,
          title: "Tập " + ep,
        });
      }
    }

    eps.sort((a, b) => a.episode - b.episode);
    return JSON.stringify(eps.slice(0, 800));
  } catch (_) {
    return JSON.stringify([]);
  }
}

// ============ STREAMS ============

async function extractStreamUrl(url) {
  try {
    // Ensure we have a watch page URL
    let watchUrl = String(url);
    if (!/\/xem-phim\//i.test(watchUrl)) {
      // If it's a series page, try to get first episode
      const seriesHtml = await getText(await soraFetch(watchUrl));
      const firstEp = seriesHtml.match(/href="(\/xem-phim\/[^"]+?)"/i);
      if (firstEp) watchUrl = absUrl(firstEp[1]);
      else return JSON.stringify({ streams: [], subtitles: "" });
    }

    const html = await getText(await soraFetch(watchUrl));

    // Extract the HLS URL from the hidden input with name="url" inside form action="/api/v1/player"
    const match = html.match(/<input[^>]*name="url"[^>]*value="([^"]+)"[^>]*>/i);
    if (!match) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }
    const hlsUrl = decodeEntities(match[1]);

    // Optional: extract subtitle tracks if any (not present in typical page, but we can look for .vtt)
    let subtitles = "";
    const subMatch = html.match(/<track[^>]*src="([^"]+\.vtt)"/i);
    if (subMatch) subtitles = absUrl(subMatch[1]);

    const headers = {
      "User-Agent": UA,
      "Accept": "*/*",
      "Referer": watchUrl,
      "Origin": baseUrl,
    };

    const streams = [{
      title: "HLS · YeuAnime",
      streamUrl: hlsUrl,
      headers: headers,
    }];

    return JSON.stringify({ streams, subtitles });
  } catch (_) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
