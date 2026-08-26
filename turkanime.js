/**
 * TürkAnime TV – Sora / Luna
 * Turkish-subbed anime
 *
 * Search:
 *   Tries the site's common search endpoints and falls back to
 *   extracting anime/video links from the homepage.
 *
 * Streams:
 *   TürkAnime episode page
 *      -> embedded player / hoster
 *      -> public JWPlayer/source configuration
 *      -> HLS (.m3u8) / MP4
 *
 * Supported player buttons currently seen on TürkAnime:
 *   FILEMOON
 *   MEDIACM
 *   STREAMWISH
 *   VOE
 *
 * No DRM/authentication bypass is performed.
 *
 * v1.0.0
 */

const baseUrl = "https://www.turkanime.tv";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
  "Mobile/15E148 Safari/604.1";

const DEFAULT_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function soraFetch(url, options) {
  options = options || {};

  const headers = Object.assign({}, DEFAULT_HEADERS, options.headers || {});
  const method = options.method || "GET";
  const body = options.body || null;

  try {
    if (typeof fetchv2 === "function") {
      const r = await fetchv2(url, headers, method, body);
      if (r) return r;
    }
  } catch (e) {}

  try {
    return await fetch(url, {
      method: method,
      headers: headers,
      body: body,
    });
  } catch (e2) {
    return null;
  }
}

async function getText(res) {
  if (res == null) return "";

  try {
    if (typeof res === "string") return res;

    if (typeof res.text === "function") {
      return String((await res.text()) || "");
    }

    if (typeof res.data === "string") return res.data;
    if (typeof res.body === "string") return res.body;

    return String(res);
  } catch (e) {
    return "";
  }
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    });
}

function cleanText(s) {
  return decodeEntities(String(s || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function isHttp(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function absUrl(url, parent) {
  url = decodeEntities(String(url || "").trim());

  if (!url) return "";

  if (url.indexOf("javascript:") === 0) return "";

  if (url.indexOf("//") === 0) {
    return "https:" + url;
  }

  if (isHttp(url)) {
    return url;
  }

  try {
    return new URL(url, parent || baseUrl).toString();
  } catch (e) {}

  if (url.charAt(0) === "/") {
    return baseUrl + url;
  }

  return url;
}

function normalizeUrl(url, parent) {
  let u = String(url || "").trim();

  u = u
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/^['"]|['"]$/g, "");

  try {
    u = decodeURIComponent(u);
  } catch (e) {}

  return absUrl(u, parent);
}

function uniqueUrls(items) {
  const seen = {};
  const out = [];

  for (let i = 0; i < items.length; i++) {
    const u = normalizeUrl(items[i]);

    if (!isHttp(u)) continue;
    if (seen[u]) continue;

    seen[u] = true;
    out.push(u);
  }

  return out;
}

function getSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  } catch (e) {
    return String(url || "")
      .split("/")
      .filter(Boolean)
      .pop() || "";
  }
}

function titleFromSlug(slug) {
  try {
    slug = decodeURIComponent(slug);
  } catch (e) {}

  return cleanText(
    slug
      .replace(/\.(html?|php)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\bbolum\b/gi, " bölüm")
  );
}

function episodeNumber(text, fallback) {
  const s = cleanText(text);

  let m =
    s.match(/(?:bölüm|bolum|episode|ep|e)\s*[-.:]?\s*(\d+(?:\.\d+)?)/i) ||
    s.match(/[-\s](\d{1,4})(?:[-\s]|$)/);

  if (m) {
    const n = parseFloat(m[1]);
    if (!isNaN(n)) return n;
  }

  return fallback;
}

/* =========================================================
 * HTML helpers
 * ========================================================= */

function extractImages(html, parent) {
  const out = [];
  let m;

  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<img[^>]+(?:data-src|data-original)=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
  ];

  for (let p = 0; p < patterns.length; p++) {
    const re = patterns[p];

    while ((m = re.exec(html))) {
      const u = normalizeUrl(m[1], parent);

      if (
        u &&
        !/data:image/i.test(u) &&
        !/logo|avatar|banner|advert|ads?/i.test(u)
      ) {
        out.push(u);
      }
    }
  }

  return uniqueUrls(out);
}

function extractMeta(html, name) {
  let m = html.match(
    new RegExp(
      '<meta[^>]+(?:name|property)=["\']' +
        name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        '["\'][^>]+content=["\']([^"\']+)',
      "i"
    )
  );

  if (!m) {
    m = html.match(
      new RegExp(
        '<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']' +
          name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          '["\']',
        "i"
      )
    );
  }

  return m ? cleanText(m[1]) : "";
}

function extractCanonical(html, parent) {
  const m = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i
  );

  return m ? normalizeUrl(m[1], parent) : "";
}

function extractLinks(html, parent) {
  const out = [];
  let m;

  const re = /<a\b([^>]+)\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    const href = normalizeUrl(m[2], parent);
    const text = cleanText(
      String(m[3] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    );

    if (!href) continue;

    out.push({
      href: href,
      text: text,
      attrs: attrs,
    });
  }

  return out;
}

function extractIframeUrls(html, parent) {
  const out = [];
  let m;

  const patterns = [
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+data-src=["']([^"']+)["']/gi,
    /(?:iframe|embed|player)[^"'<>]{0,300}(https?:\/\/[^"'<> ]+)/gi,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const re = patterns[i];

    while ((m = re.exec(html))) {
      const candidate = normalizeUrl(m[1], parent);

      if (!candidate) continue;

      if (
        !/google|facebook|twitter|instagram|doubleclick|googlesyndication/i.test(
          candidate
        )
      ) {
        out.push(candidate);
      }
    }
  }

  return uniqueUrls(out);
}

/* =========================================================
 * Player / stream extraction
 * ========================================================= */

function isMediaUrl(url) {
  return (
    /\.(?:m3u8|mp4|m4v|webm)(?:$|[?#])/i.test(url) ||
    /(?:\/hls\/|\/manifest\/|\/playlist\/|master\.m3u8|index\.m3u8)/i.test(url)
  );
}

function playerScore(url) {
  const u = String(url || "").toLowerCase();

  if (/filemoon|filemoon\.sx|filemoon\.to/.test(u)) return 10;
  if (/mediacm|media-cm/.test(u)) return 9;
  if (/streamwish|swdyu|wish/.test(u)) return 8;
  if (/voe\.sx|voe\.sx/.test(u)) return 7;
  if (/bysesukior/.test(u)) return 6;

  return 1;
}

function hostLabel(url) {
  const u = String(url || "").toLowerCase();

  if (/filemoon/.test(u)) return "FILEMOON";
  if (/mediacm|media-cm/.test(u)) return "MEDIACM";
  if (/streamwish|swdyu|wish/.test(u)) return "STREAMWISH";
  if (/voe\.sx/.test(u)) return "VOE";
  if (/bysesukior/.test(u)) return "TürkAnime Player";

  try {
    return new URL(url).hostname;
  } catch (e) {
    return "Player";
  }
}

function extractMediaUrls(html, parent) {
  const out = [];

  if (!html) return out;

  let m;

  /*
   * JW Player:
   * file: "..."
   * file = "..."
   */
  const jwFilePatterns = [
    /["']file["']\s*:\s*["']([^"']+)["']/gi,
    /\bfile\s*:\s*["']([^"']+)["']/gi,
    /\bfile\s*=\s*["']([^"']+)["']/gi,
    /["']src["']\s*:\s*["']([^"']+)["']/gi,
    /["']source["']\s*:\s*["']([^"']+)["']/gi,
  ];

  for (let i = 0; i < jwFilePatterns.length; i++) {
    const re = jwFilePatterns[i];

    while ((m = re.exec(html))) {
      const u = normalizeUrl(m[1], parent);

      if (isMediaUrl(u)) out.push(u);
    }
  }

  /*
   * sources: [{file: "..."}]
   */
  const sourceRe =
    /["'](?:file|src|source|url)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;

  while ((m = sourceRe.exec(html))) {
    const u = normalizeUrl(m[1], parent);

    if (isMediaUrl(u)) out.push(u);
  }

  /*
   * HTML5:
   * <source src="...">
   */
  const htmlSource =
    /<source[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;

  while ((m = htmlSource.exec(html))) {
    const u = normalizeUrl(m[1], parent);

    if (isMediaUrl(u)) out.push(u);
  }

  /*
   * Generic absolute HLS/MP4 URLs.
   */
  const mediaRe =
    /https?:\/\/[^"'\\\s<>]+?(?:\.m3u8|\.mp4|\.m4v|\.webm)(?:\?[^"'\\\s<>]*)?/gi;

  while ((m = mediaRe.exec(html))) {
    const u = normalizeUrl(m[0], parent);

    if (isMediaUrl(u)) out.push(u);
  }

  /*
   * HLS URLs that don't end exactly in .m3u8.
   */
  const hlsRe =
    /https?:\/\/[^"'\\\s<>]+\/(?:hls|manifest|playlist)\/[^"'\\\s<>]+/gi;

  while ((m = hlsRe.exec(html))) {
    const u = normalizeUrl(m[0], parent);

    if (isMediaUrl(u)) out.push(u);
  }

  return uniqueUrls(out);
}

/*
 * Some players put their source in base64.
 * Decode only ordinary base64-looking strings and then
 * search the decoded result for a public media URL.
 */
function decodeBase64Simple(input) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let s = String(input || "")
    .replace(/[^A-Za-z0-9+/=]/g, "")
    .trim();

  if (!s || s.length < 16) return "";

  let out = "";

  try {
    for (let i = 0; i < s.length; i += 4) {
      const a = chars.indexOf(s.charAt(i));
      const b = chars.indexOf(s.charAt(i + 1));
      const c = chars.indexOf(s.charAt(i + 2));
      const d = chars.indexOf(s.charAt(i + 3));

      if (a < 0 || b < 0) break;

      out += String.fromCharCode((a << 2) | (b >> 4));

      if (c >= 0 && s.charAt(i + 2) !== "=") {
        out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
      }

      if (d >= 0 && s.charAt(i + 3) !== "=") {
        out += String.fromCharCode(((c & 3) << 6) | d);
      }
    }
  } catch (e) {
    return "";
  }

  return out;
}

function extractEncodedMedia(html, parent) {
  const out = [];

  if (!html) return out;

  let m;

  const b64Patterns = [
    /(?:source|file|url|src)\s*=\s*["']([A-Za-z0-9+/=]{40,})["']/gi,
    /(?:source|file|url|src)["']?\s*:\s*["']([A-Za-z0-9+/=]{40,})["']/gi,
  ];

  for (let i = 0; i < b64Patterns.length; i++) {
    const re = b64Patterns[i];

    while ((m = re.exec(html))) {
      const decoded = decodeBase64Simple(m[1]);

      if (!decoded) continue;

      const media = extractMediaUrls(decoded, parent);

      for (let x = 0; x < media.length; x++) {
        out.push(media[x]);
      }
    }
  }

  return uniqueUrls(out);
}

async function resolvePlayer(playerUrl, episodeUrl) {
  const result = {
    player: playerUrl,
    label: hostLabel(playerUrl),
    streams: [],
  };

  const html = await getText(
    await soraFetch(playerUrl, {
      headers: {
        Referer: episodeUrl || baseUrl + "/",
        Origin: baseUrl,
        "User-Agent": UA,
        Accept: "text/html,*/*",
      },
    })
  );

  if (!html) return result;

  let streams = [];

  /*
   * First try direct sources.
   */
  streams = streams.concat(extractMediaUrls(html, playerUrl));

  /*
   * Then ordinary base64 source fields.
   */
  streams = streams.concat(extractEncodedMedia(html, playerUrl));

  /*
   * Some player pages contain another iframe.
   */
  if (!streams.length) {
    const nested = extractIframeUrls(html, playerUrl);

    /*
     * Don't recursively follow arbitrary pages forever.
     * One additional player level is enough for the common
     * embed -> player -> media structure.
     */
    for (let i = 0; i < nested.length && i < 5; i++) {
      const nestedUrl = nested[i];

      if (nestedUrl === playerUrl) continue;

      const nh = await getText(
        await soraFetch(nestedUrl, {
          headers: {
            Referer: playerUrl,
            Origin: baseUrl,
            "User-Agent": UA,
            Accept: "text/html,*/*",
          },
        })
      );

      if (!nh) continue;

      streams = streams.concat(extractMediaUrls(nh, nestedUrl));
      streams = streams.concat(extractEncodedMedia(nh, nestedUrl));
    }
  }

  result.streams = uniqueUrls(streams);
  return result;
}

/* =========================================================
 * TürkAnime player extraction
 * ========================================================= */

function extractNamedPlayers(html, episodeUrl) {
  const players = [];
  const seen = {};

  function add(url, label) {
    url = normalizeUrl(url, episodeUrl);

    if (!url || !isHttp(url)) return;
    if (seen[url]) return;

    /*
     * Ignore normal site navigation.
     */
    if (
      /turkanime\.tv\/(?:home|anime|forum|login|register|profile)/i.test(url)
    ) {
      return;
    }

    seen[url] = true;

    players.push({
      url: url,
      label: label || hostLabel(url),
    });
  }

  /*
   * All iframe/embed URLs.
   */
  const iframes = extractIframeUrls(html, episodeUrl);

  for (let i = 0; i < iframes.length; i++) {
    add(iframes[i], hostLabel(iframes[i]));
  }

  /*
   * Search for player host URLs in attributes/scripts.
   */
  const hostRe =
    /https?:\/\/[^"'\\\s<>]+(?:filemoon|mediacm|streamwish|voe\.sx|bysesukior)[^"'\\\s<>]*/gi;

  let m;

  while ((m = hostRe.exec(html))) {
    add(m[0], hostLabel(m[0]));
  }

  /*
   * Search anchors/buttons near the player.
   */
  const links = extractLinks(html, episodeUrl);

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    const text = cleanText(link.text).toUpperCase();

    if (
      /FILEMOON|MEDIACM|STREAMWISH|VOE|HDVID|DOODSTREAM|UQLOAD|YOURUPLOAD/.test(
        text
      )
    ) {
      add(link.href, text);
    }
  }

  players.sort(function (a, b) {
    return playerScore(b.url) - playerScore(a.url);
  });

  return players;
}

/* =========================================================
 * Search
 * ========================================================= */

function looksLikeAnimeUrl(url) {
  return /\/(?:anime|series|video)\//i.test(url);
}

function scoreSearchResult(title, query) {
  const t = cleanText(title).toLowerCase();
  const q = cleanText(query).toLowerCase();

  if (!t || !q) return 0;

  let score = 0;

  if (t === q) score += 100;
  if (t.indexOf(q) >= 0) score += 50;

  const words = q.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    if (words[i].length > 1 && t.indexOf(words[i]) >= 0) {
      score += 10;
    }
  }

  return score;
}

function parseAnimeCards(html, parent) {
  const results = [];
  const seen = {};

  function add(href, title, image) {
    href = normalizeUrl(href, parent);
    title = cleanText(title);

    if (!href || !title) return;
    if (seen[href]) return;

    /*
     * Search pages can expose episode links as well.
     * Prefer actual anime pages where available.
     */
    if (!looksLikeAnimeUrl(href) && !/\/[^/]+\/?$/i.test(href)) {
      return;
    }

    if (/\/video\/[^/]+-?\d*-?bolum/i.test(href)) {
      /*
       * Episode pages are still useful if the site search
       * doesn't expose a series page.
       */
    }

    seen[href] = true;

    results.push({
      title: title,
      image: image ? normalizeUrl(image, parent) : "",
      href: href,
    });
  }

  const links = extractLinks(html, parent);

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    if (!link.href) continue;

    const text = cleanText(link.text);

    if (!text || text.length < 2) continue;

    if (
      /\/video\/[^/]+-?\d*-?bolum/i.test(link.href) ||
      /\/anime\//i.test(link.href)
    ) {
      let title = text;

      if (!title || title.length < 2) {
        title = titleFromSlug(getSlug(link.href));
      }

      add(link.href, title, "");
    }
  }

  /*
   * Cards with title/alt attributes.
   */
  let m;

  const cardRe =
    /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]{0,2500}?<(?:img|picture)[^>]*(?:alt|title)=["']([^"']+)["'][^>]*>/gi;

  while ((m = cardRe.exec(html))) {
    add(m[1], m[2], "");
  }

  return results;
}

async function searchResults(keyword) {
  try {
    const q = cleanText(keyword);

    if (!q) return JSON.stringify([]);

    const encoded = encodeURIComponent(q);

    /*
     * Different versions of TürkAnime have used different
     * search routes. Try several without assuming one is permanent.
     */
    const urls = [
      baseUrl + "/search?query=" + encoded,
      baseUrl + "/search?q=" + encoded,
      baseUrl + "/arama?query=" + encoded,
      baseUrl + "/arama?q=" + encoded,
      baseUrl + "/index.php?search=" + encoded,
      baseUrl + "/?s=" + encoded,
    ];

    let all = [];

    for (let i = 0; i < urls.length; i++) {
      const html = await getText(
        await soraFetch(urls[i], {
          headers: {
            Referer: baseUrl + "/",
            "User-Agent": UA,
            Accept: "text/html,*/*",
          },
        })
      );

      if (!html || html.length < 500) continue;

      const parsed = parseAnimeCards(html, urls[i]);

      for (let x = 0; x < parsed.length; x++) {
        all.push(parsed[x]);
      }

      /*
       * Stop early once a search endpoint gives usable results.
       */
      if (parsed.length >= 5) break;
    }

    /*
     * If the site's search route changed, use homepage content
     * as a final fallback.
     */
    if (!all.length) {
      const home = await getText(
        await soraFetch(baseUrl + "/", {
          headers: {
            Referer: baseUrl + "/",
            "User-Agent": UA,
            Accept: "text/html,*/*",
          },
        })
      );

      if (home) {
        all = parseAnimeCards(home, baseUrl + "/");
      }
    }

    /*
     * Deduplicate.
     */
    const seen = {};
    const unique = [];

    for (let i = 0; i < all.length; i++) {
      const r = all[i];

      if (!r.href || seen[r.href]) continue;

      seen[r.href] = true;
      unique.push(r);
    }

    /*
     * Rank by title.
     */
    unique.sort(function (a, b) {
      return scoreSearchResult(b.title, q) - scoreSearchResult(a.title, q);
    });

    return JSON.stringify(unique.slice(0, 30));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * Details
 * ========================================================= */

async function extractDetails(url) {
  try {
    const html = await getText(
      await soraFetch(url, {
        headers: {
          Referer: baseUrl + "/",
          "User-Agent": UA,
          Accept: "text/html,*/*",
        },
      })
    );

    if (!html) {
      return JSON.stringify([
        {
          description: "N/A",
          aliases: "N/A",
          airdate: "N/A",
        },
      ]);
    }

    const description =
      extractMeta(html, "description") ||
      extractMeta(html, "og:description") ||
      "N/A";

    const canonical = extractCanonical(html, url);

    let title =
      extractMeta(html, "og:title") ||
      titleFromSlug(getSlug(canonical || url));

    title = cleanText(
      title
        .replace(/\s*\|\s*Türk Anime TV.*$/i, "")
        .replace(/\s*-\s*Türk Anime TV.*$/i, "")
    );

    return JSON.stringify([
      {
        description: description.slice(0, 1500),
        aliases: title || "N/A",
        airdate: "N/A",
      },
    ]);
  } catch (e) {
    return JSON.stringify([
      {
        description: "N/A",
        aliases: "N/A",
        airdate: "N/A",
      },
    ]);
  }
}

/* =========================================================
 * Episodes
 * ========================================================= */

function parseEpisodeLinks(html, parent) {
  const eps = [];
  const seen = {};

  function add(href, number, title) {
    href = normalizeUrl(href, parent);

    if (!href || seen[href]) return;

    if (!/\/video\//i.test(href)) return;

    seen[href] = true;

    const n = episodeNumber(title || href, number || eps.length + 1);

    eps.push({
      href: href,
      number: n,
      title: cleanText(title) || "Episode " + n,
    });
  }

  const links = extractLinks(html, parent);

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    if (!/\/video\//i.test(link.href)) continue;

    const text = cleanText(link.text);

    if (
      /(?:bölüm|bolum|episode|ep)\s*\d+/i.test(text) ||
      /-\d+-?bolum/i.test(link.href)
    ) {
      add(link.href, eps.length + 1, text);
    }
  }

  /*
   * Explicit /video/... links.
   */
  let m;

  const videoRe = /href=["']([^"']*\/video\/[^"']+)["'][^>]*>/gi;

  while ((m = videoRe.exec(html))) {
    const href = normalizeUrl(m[1], parent);

    if (!href || seen[href]) continue;

    const slug = getSlug(href);
    const num = episodeNumber(slug, eps.length + 1);

    add(href, num, titleFromSlug(slug));
  }

  eps.sort(function (a, b) {
    return a.number - b.number;
  });

  return eps;
}

async function extractEpisodes(url) {
  try {
    let pageUrl = String(url || "");

    /*
     * Episode URL:
     * /video/kimiai-8-bolum
     *
     * Try to discover the anime's other episode links from
     * the episode page first.
     */
    const html = await getText(
      await soraFetch(pageUrl, {
        headers: {
          Referer: baseUrl + "/",
          "User-Agent": UA,
          Accept: "text/html,*/*",
        },
      })
    );

    if (!html) {
      return JSON.stringify([
        {
          href: pageUrl,
          number: episodeNumber(pageUrl, 1),
          title: "Episode " + episodeNumber(pageUrl, 1),
        },
      ]);
    }

    let eps = parseEpisodeLinks(html, pageUrl);

    /*
     * The episode page can contain "Önceki Bölüm" and
     * "Sonraki Bölüm". Add them even when the full list isn't
     * present.
     */
    if (!eps.length) {
      const navLinks = extractLinks(html, pageUrl);

      for (let i = 0; i < navLinks.length; i++) {
        const l = navLinks[i];

        if (!/\/video\//i.test(l.href)) continue;

        const n = episodeNumber(l.href, 0);

        if (n > 0) {
          eps.push({
            href: l.href,
            number: n,
            title: "Episode " + n,
          });
        }
      }
    }

    /*
     * Always keep the requested episode.
     */
    if (!eps.length) {
      eps.push({
        href: pageUrl,
        number: episodeNumber(pageUrl, 1),
        title: "Episode " + episodeNumber(pageUrl, 1),
      });
    }

    /*
     * Deduplicate by URL.
     */
    const seen = {};
    const unique = [];

    for (let i = 0; i < eps.length; i++) {
      if (seen[eps[i].href]) continue;

      seen[eps[i].href] = true;
      unique.push(eps[i]);
    }

    unique.sort(function (a, b) {
      return a.number - b.number;
    });

    return JSON.stringify(unique.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url),
        number: episodeNumber(url, 1),
        title: "Episode " + episodeNumber(url, 1),
      },
    ]);
  }
}

/* =========================================================
 * Stream extraction
 * ========================================================= */

async function extractStreamUrl(url) {
  try {
    const episodeUrl = String(url || "");

    const episodeHtml = await getText(
      await soraFetch(episodeUrl, {
        headers: {
          Referer: baseUrl + "/",
          Origin: baseUrl,
          "User-Agent": UA,
          Accept: "text/html,*/*",
        },
      })
    );

    if (!episodeHtml) {
      return JSON.stringify({
        streams: [],
        subtitles: "",
      });
    }

    /*
     * 1. Direct media URL on TürkAnime page.
     */
    let direct = extractMediaUrls(episodeHtml, episodeUrl);

    const found = [];

    for (let i = 0; i < direct.length; i++) {
      found.push({
        url: direct[i],
        label: "TürkAnime",
        player: episodeUrl,
      });
    }

    /*
     * 2. Find external player URLs.
     */
    const players = extractNamedPlayers(episodeHtml, episodeUrl);

    /*
     * Resolve every discovered player.
     *
     * Keep the number bounded so a broken/ad iframe cannot
     * cause an excessive amount of requests.
     */
    for (let i = 0; i < players.length && i < 8; i++) {
      const p = players[i];

      const resolved = await resolvePlayer(p.url, episodeUrl);

      for (let x = 0; x < resolved.streams.length; x++) {
        found.push({
          url: resolved.streams[x],
          label: resolved.label,
          player: p.url,
        });
      }
    }

    /*
     * Sort:
     * HLS first, then MP4.
     * Prefer known players.
     */
    found.sort(function (a, b) {
      function score(x) {
        let s = 0;

        if (/\.m3u8/i.test(x.url)) s += 100;
        if (/master\.m3u8/i.test(x.url)) s += 20;

        s += playerScore(x.player);

        return s;
      }

      return score(b) - score(a);
    });

    const streams = [];
    const seen = {};

    for (let i = 0; i < found.length; i++) {
      const item = found[i];

      if (!item.url || seen[item.url]) continue;

      seen[item.url] = true;

      let title = "TürkAnime · " + item.label;

      if (/1080/i.test(item.url)) {
        title += " · 1080p";
      } else if (/720/i.test(item.url)) {
        title += " · 720p";
      } else if (/480/i.test(item.url)) {
        title += " · 480p";
      } else if (/360/i.test(item.url)) {
        title += " · 360p";
      } else if (/\.m3u8/i.test(item.url)) {
        title += " · HLS";
      } else if (/\.mp4/i.test(item.url)) {
        title += " · MP4";
      }

      /*
       * The media host normally expects the player page as
       * Referer. This is important for many HLS hosts.
       */
      const headers = {
        "User-Agent": UA,
        Referer: item.player || episodeUrl,
        Accept: "application/vnd.apple.mpegurl,video/*,*/*",
      };

      streams.push({
        title: title,
        name: title,
        streamUrl: item.url,
        headers: headers,
      });
    }

    return JSON.stringify({
      streams: streams.slice(0, 20),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({
      streams: [],
      subtitles: "",
    });
  }
}
