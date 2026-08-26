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

    if (!html || html.length < 50) {
      // Try fallback search via main page? Not needed.
      return JSON.stringify([]);
    }

    const results = [];
    const seen = {};

    // Method 1: Find all <a href="/phim/..."> with an image and title
    // Many anime cards on this site have structure:
    // <a href="/phim/{slug}"> ... <img src="..." alt="Title"> ... </a>
    // or <a href="/phim/{slug}"><h3>Title</h3></a>
    // We'll capture both.

    // First, extract all <a> tags that point to /phim/
    const linkRegex = /<a[^>]*href="\/phim\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html))) {
      const slug = match[1];
      const inner = match[2];
      let title = "";

      // Try to get title from img alt
      const imgAlt = inner.match(/<img[^>]*alt="([^"]+)"/i);
      if (imgAlt) {
        title = decodeEntities(imgAlt[1]).trim();
      } else {
        // Try to get title from any heading or text inside the link
        const heading = inner.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
        if (heading) {
          title = decodeEntities(heading[1]).trim();
        } else {
          // Fallback: get plain text from inner (remove tags)
          const text = inner.replace(/<[^>]+>/g, " ").trim();
          if (text) title = text;
        }
      }

      if (!title) continue;

      // Try to get image src from img inside the link
      const imgSrc = inner.match(/<img[^>]*src="([^"]+)"/i);
      let image = "";
      if (imgSrc) {
        image = absUrl(imgSrc[1]);
      } else {
        // If no image, use a placeholder or skip? For now, set empty.
        image = "";
      }

      const href = absUrl("/phim/" + slug);
      if (seen[href]) continue;
      seen[href] = true;

      results.push({
        title: title,
        image: image,
        href: href,
      });
    }

    // If we got no results, try alternative: look for divs with class containing "movie"
    if (results.length === 0) {
      // Maybe the search results are in divs like the ranking list
      const divRegex = /<div[^>]*class="[^"]*movie-card[^"]*"[^>]*>[\s\S]*?<a href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<h[1-6][^>]*>([^<]+)<\/h[1-6]>[\s\S]*?<img[^>]*src="([^"]+)"/gi;
      while ((match = divRegex.exec(html))) {
        const slug = match[1];
        const title = decodeEntities(match[2]).trim();
        const image = absUrl(match[3]);
        const href = absUrl("/phim/" + slug);
        if (seen[href]) continue;
        seen[href] = true;
        results.push({ title, image, href });
      }
    }

    return JSON.stringify(results.slice(0, 30));
  } catch (e) {
    // Any error: return empty array
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
    const re = /<a[^>]*href="(\/xem-phim\/[^"]+?)"[^>]*>[\s\S]*?<[^>]*class="[^"]*episode-title[^"]*"[^>]*>([^<]*)<\/[^>]+>/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const epMatch = href.match(/\/tap-(\d+)\//);
      if (!epMatch) continue;
      const epNum = parseInt(epMatch[1], 10);
      const label = decodeEntities(m[2]).trim() || "Tập " + epNum;
      if (seen[epNum]) continue;
      seen[epNum] = true;
      eps.push({
        href: href,
        number: epNum,
        season: 1,
        episode: epNum,
        title: label,
      });
    }

    // Fallback: simpler regex for just links
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

    // Optional: extract subtitle tracks if any
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
