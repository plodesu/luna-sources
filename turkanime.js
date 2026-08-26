/**
 * TürkAnime TV – Sora / Luna
 *
 * v1.2.0
 *
 * Fixed:
 * - TürkAnime /anime/<slug> series pages
 * - /video/<slug>-<episode>-bolum episode pages
 * - HTML named entities (&ouml;, &uuml;, etc.)
 * - Search using direct anime slug + anime-list fallback
 * - Proper episode extraction from anime pages
 * - Byse /e/<file_code> player
 * - Byse embed/settings API
 * - JW Player sources
 * - HLS / MP4 extraction
 */

const baseUrl = "https://www.turkanime.tv";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
  "Mobile/15E148 Safari/604.1";

/* =========================================================
 * HTTP
 * ========================================================= */

async function soraFetch(url, options) {
  options = options || {};

  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json,*/*",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: baseUrl + "/"
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
    return await fetch(url, {
      method: method,
      headers: headers,
      body: body
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

    if (typeof res.data === "string") {
      return res.data;
    }

    if (typeof res.body === "string") {
      return res.body;
    }

    return String(res);
  } catch (e) {
    return "";
  }
}

/* =========================================================
 * HTML / URL helpers
 * ========================================================= */

function decodeEntities(s) {
  let out = String(s || "");

  /*
   * Decode repeatedly because pages sometimes contain
   * &amp;ouml; -> &ouml;
   */
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&nbsp;/gi, " ")
      .replace(/&ouml;/gi, "ö")
      .replace(/&Ouml;/g, "Ö")
      .replace(/&uuml;/gi, "ü")
      .replace(/&Uuml;/g, "Ü")
      .replace(/&ccedil;/gi, "ç")
      .replace(/&Ccedil;/g, "Ç")
      .replace(/&scedil;/gi, "ş")
      .replace(/&Scedil;/g, "Ş")
      .replace(/&igrave;/gi, "ì")
      .replace(/&iacute;/gi, "í")
      .replace(/&Iacute;/g, "Í")
      .replace(/&eacute;/gi, "é")
      .replace(/&Eacute;/g, "É")
      .replace(/&aring;/gi, "å")
      .replace(/&Aring;/g, "Å")
      .replace(/&acirc;/gi, "â")
      .replace(/&Acirc;/g, "Â")
      .replace(/&iuml;/gi, "ï")
      .replace(/&Iuml;/g, "Ï")
      .replace(/&rsquo;/gi, "’")
      .replace(/&ldquo;/gi, "“")
      .replace(/&rdquo;/gi, "”")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
        return String.fromCharCode(parseInt(h, 16));
      })
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(parseInt(n, 10));
      });
  }

  return out;
}

function cleanText(s) {
  return decodeEntities(String(s || ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHttp(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function absUrl(url, parent) {
  url = decodeEntities(String(url || "").trim());

  if (!url) return "";

  url = url
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/");

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

function unique(items) {
  const seen = {};
  const out = [];

  for (let i = 0; i < items.length; i++) {
    const u = String(items[i] || "").trim();

    if (!u || seen[u]) continue;

    seen[u] = true;
    out.push(u);
  }

  return out;
}

function slugify(s) {
  let x = decodeEntities(String(s || "")).toLowerCase();

  x = x
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");

  return x
    .replace(/['’":!?.,()[\]{}]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* =========================================================
 * TürkAnime URL parsing
 * ========================================================= */

function getPath(url) {
  try {
    return new URL(url).pathname;
  } catch (e) {
    return String(url || "");
  }
}

function getSlug(url) {
  const path = getPath(url)
    .replace(/\/+$/, "")
    .split("/");

  return path[path.length - 1] || "";
}

function episodeNumber(urlOrTitle, fallback) {
  const s = decodeEntities(String(urlOrTitle || ""));

  let m =
    s.match(/(?:bölüm|bolum|episode|episod|ep)\s*\.?\s*(\d+)/i) ||
    s.match(/-(\d+)-bolum(?:$|-)/i) ||
    s.match(/-(\d+)-bolum$/i);

  if (m) {
    return parseInt(m[1], 10);
  }

  return fallback;
}

/*
 * /video/kimiai-8-bolum
 *        ↓
 * /anime/kimiai
 *
 * /video/bungou-stray-dogs-wan-2-8-bolum
 *        ↓
 * /anime/bungou-stray-dogs-wan-2
 */
function seriesUrlFromEpisode(url) {
  const slug = getSlug(url);

  let seriesSlug = slug.replace(
    /-(\d+)-bolum(?:-[^/]*)?$/i,
    ""
  );

  /*
   * Also handle "episode" spelling.
   */
  seriesSlug = seriesSlug.replace(
    /-(\d+)-episode(?:-[^/]*)?$/i,
    ""
  );

  if (!seriesSlug || seriesSlug === slug) {
    return "";
  }

  return baseUrl + "/anime/" + seriesSlug;
}

/* =========================================================
 * HTML extraction
 * ========================================================= */

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let m = html.match(
    new RegExp(
      '<meta[^>]+(?:name|property)=["\']' +
        escaped +
        '["\'][^>]+content=["\']([^"\']*)["\']',
      "i"
    )
  );

  if (!m) {
    m = html.match(
      new RegExp(
        '<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:name|property)=["\']' +
          escaped +
          '["\']',
        "i"
      )
    );
  }

  return m ? cleanText(m[1]) : "";
}

function extractTitle(html) {
  let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  if (m) {
    const t = cleanText(m[1]);

    if (t && t.length > 1) {
      return t;
    }
  }

  m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (m) {
    return cleanText(
      m[1]
        .replace(/\s*\|\s*Türk Anime TV.*$/i, "")
        .replace(/\s*-\s*Türk Anime TV.*$/i, "")
    );
  }

  return "";
}

function extractLinks(html, parent) {
  const out = [];
  let m;

  const re =
    /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  while ((m = re.exec(html))) {
    const href = absUrl(m[2], parent);

    if (!href) continue;

    out.push({
      href: href,
      text: cleanText(m[4]),
      attrs: (m[1] || "") + " " + (m[3] || "")
    });
  }

  return out;
}

function extractImages(html, parent) {
  const out = [];
  let m;

  const patterns = [
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<img[^>]+(?:data-src|data-original)=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi
  ];

  for (let i = 0; i < patterns.length; i++) {
    const re = patterns[i];

    while ((m = re.exec(html))) {
      const u = absUrl(m[1], parent);

      if (!u || /^data:/i.test(u)) continue;

      if (/logo|avatar|advert|banner/i.test(u)) continue;

      out.push(u);
    }
  }

  return unique(out);
}

function extractIframeUrls(html, parent) {
  const out = [];
  let m;

  const patterns = [
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+data-src=["']([^"']+)["']/gi,
    /<embed[^>]+src=["']([^"']+)["']/gi
  ];

  for (let i = 0; i < patterns.length; i++) {
    const re = patterns[i];

    while ((m = re.exec(html))) {
      const u = absUrl(m[1], parent);

      if (!u || !isHttp(u)) continue;

      if (/google|facebook|twitter|instagram|doubleclick/i.test(u)) {
        continue;
      }

      out.push(u);
    }
  }

  return unique(out);
}

/* =========================================================
 * Search
 * ========================================================= */

function searchScore(title, query) {
  const t = slugify(title);
  const q = slugify(query);

  if (!t || !q) return 0;

  let score = 0;

  if (t === q) score += 100;
  if (t.indexOf(q) >= 0) score += 50;

  const words = q.split("-");

  for (let i = 0; i < words.length; i++) {
    if (words[i].length > 1 && t.indexOf(words[i]) >= 0) {
      score += 10;
    }
  }

  return score;
}

function parseAnimeList(html, parent) {
  const results = [];
  const seen = {};

  const links = extractLinks(html, parent);

  for (let i = 0; i < links.length; i++) {
    const l = links[i];

    if (!/\/anime\/[^/]+\/?$/i.test(getPath(l.href))) {
      continue;
    }

    const title = cleanText(l.text);

    if (!title || title.length < 2) continue;

    if (seen[l.href]) continue;

    seen[l.href] = true;

    results.push({
      title: title,
      image: "",
      href: l.href
    });
  }

  /*
   * Some cards contain title in title/alt rather than text.
   */
  let m;

  const cardRe =
    /<a[^>]+href=["']([^"']*\/anime\/[^"']+)["'][^>]*>[\s\S]{0,2500}?(?:title|alt)=["']([^"']+)["']/gi;

  while ((m = cardRe.exec(html))) {
    const href = absUrl(m[1], parent);
    const title = cleanText(m[2]);

    if (!href || !title) continue;

    if (!seen[href]) {
      seen[href] = true;

      results.push({
        title: title,
        image: "",
        href: href
      });
    }
  }

  return results;
}

async function fetchAnimePageBySlug(slug) {
  const url = baseUrl + "/anime/" + slug;

  const html = await getText(
    await soraFetch(url, {
      headers: {
        Referer: baseUrl + "/",
        "User-Agent": UA,
        Accept: "text/html,*/*"
      }
    })
  );

  if (!html || html.length < 500) {
    return null;
  }

  /*
   * A valid anime detail page has /anime/ and usually
   * an anime title or "Bölüm".
   */
  if (
    !/Bölüm|Anime Detayı|Anime Türü|Özet/i.test(html)
  ) {
    return null;
  }

  return {
    url: url,
    html: html
  };
}

async function searchResults(keyword) {
  try {
    const query = cleanText(keyword);

    if (!query) {
      return JSON.stringify([]);
    }

    const results = [];
    const seen = {};

    function push(title, href, image) {
      href = absUrl(href);

      if (!href || !/\/anime\/[^/]+\/?$/i.test(getPath(href))) {
        return;
      }

      if (seen[href]) return;

      seen[href] = true;

      results.push({
        title: cleanText(title),
        image: image || "",
        href: href
      });
    }

    /*
     * =====================================================
     * 1. Direct slug search
     * =====================================================
     *
     * This handles:
     * Bungou Stray Dogs Wan! 2
     * Kimiai
     * One Piece
     * etc.
     */
    const slug = slugify(query);

    const candidates = [
      slug,
      slug.replace(/-season-2$/, "-2"),
      slug.replace(/-season-1$/, ""),
      slug.replace(/-the-/, "-")
    ];

    for (let i = 0; i < candidates.length; i++) {
      if (!candidates[i]) continue;

      const page = await fetchAnimePageBySlug(candidates[i]);

      if (!page) continue;

      const title =
        extractTitle(page.html) ||
        candidates[i].replace(/-/g, " ");

      const image =
        extractMeta(page.html, "og:image") ||
        extractImages(page.html, page.url)[0] ||
        "";

      push(title, page.url, image);
    }

    /*
     * =====================================================
     * 2. Scan current anime list pages
     * =====================================================
     *
     * TürkAnime currently has a large paginated anime list.
     * We scan the first pages as fallback.
     */
    const pagesToScan = 8;

    for (let pageNo = 1; pageNo <= pagesToScan; pageNo++) {
      let url = baseUrl + "/animeler";

      if (pageNo > 1) {
        url += "?page=" + pageNo;
      }

      const html = await getText(
        await soraFetch(url, {
          headers: {
            Referer: baseUrl + "/",
            "User-Agent": UA,
            Accept: "text/html,*/*"
          }
        })
      );

      if (!html || html.length < 1000) {
        continue;
      }

      const parsed = parseAnimeList(html, url);

      for (let i = 0; i < parsed.length; i++) {
        const score = searchScore(parsed[i].title, query);

        if (score > 0) {
          push(
            parsed[i].title,
            parsed[i].href,
            parsed[i].image
          );
        }
      }

      /*
       * Exact/direct result already found.
       */
      if (
        results.some(function (r) {
          return slugify(r.title) === slug;
        })
      ) {
        break;
      }
    }

    results.sort(function (a, b) {
      return (
        searchScore(b.title, query) -
        searchScore(a.title, query)
      );
    });

    return JSON.stringify(results.slice(0, 30));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * Details
 * ========================================================= */

async function extractDetails(url) {
  try {
    let pageUrl = String(url || "");

    if (/\/video\//i.test(getPath(pageUrl))) {
      const derived = seriesUrlFromEpisode(pageUrl);

      if (derived) {
        pageUrl = derived;
      }
    }

    const html = await getText(
      await soraFetch(pageUrl, {
        headers: {
          Referer: baseUrl + "/",
          "User-Agent": UA,
          Accept: "text/html,*/*"
        }
      })
    );

    if (!html) {
      return JSON.stringify([
        {
          description: "N/A",
          aliases: "N/A",
          airdate: "N/A"
        }
      ]);
    }

    const description =
      extractMeta(html, "description") ||
      extractMeta(html, "og:description") ||
      "N/A";

    const title = extractTitle(html);

    /*
     * Extract aliases from the "Diğer Adları" field if present.
     */
    let aliases = title;

    const aliasMatch = html.match(
      /Diğer Adları\s*:([\s\S]{0,500}?)(?:Japonca|Anime Türü|Bölüm Sayısı|Başlama Tarihi)/i
    );

    if (aliasMatch) {
      aliases = cleanText(aliasMatch[1]);
    }

    return JSON.stringify([
      {
        description: description.slice(0, 1500),
        aliases: aliases || "N/A",
        airdate: "N/A"
      }
    ]);
  } catch (e) {
    return JSON.stringify([
      {
        description: "N/A",
        aliases: "N/A",
        airdate: "N/A"
      }
    ]);
  }
}

/* =========================================================
 * Episodes
 * ========================================================= */

function parseEpisodes(html, parent) {
  const eps = [];
  const seen = {};

  const links = extractLinks(html, parent);

  for (let i = 0; i < links.length; i++) {
    const l = links[i];

    if (!/\/video\/[^/]+/i.test(getPath(l.href))) {
      continue;
    }

    const number = episodeNumber(
      l.text || l.href,
      0
    );

    if (!number) continue;

    if (seen[l.href]) continue;

    seen[l.href] = true;

    let title = cleanText(l.text);

    if (!title || title.length < 2) {
      title = "Bölüm " + number;
    }

    eps.push({
      href: l.href,
      number: number,
      title: title
    });
  }

  /*
   * Fallback: regex directly over HTML.
   */
  let m;

  const re =
    /href=["']([^"']*\/video\/[^"']+)["'][^>]*>/gi;

  while ((m = re.exec(html))) {
    const href = absUrl(m[1], parent);

    if (!href || seen[href]) continue;

    const n = episodeNumber(href, 0);

    if (!n) continue;

    seen[href] = true;

    eps.push({
      href: href,
      number: n,
      title: "Bölüm " + n
    });
  }

  eps.sort(function (a, b) {
    return a.number - b.number;
  });

  return eps;
}

async function extractEpisodes(url) {
  try {
    let seriesUrl = String(url || "");

    /*
     * If the app passes an episode URL, derive:
     *
     * /video/kimiai-8-bolum
     * -> /anime/kimiai
     */
    if (/\/video\//i.test(getPath(seriesUrl))) {
      const derived = seriesUrlFromEpisode(seriesUrl);

      if (derived) {
        seriesUrl = derived;
      }
    }

    const html = await getText(
      await soraFetch(seriesUrl, {
        headers: {
          Referer: baseUrl + "/",
          "User-Agent": UA,
          Accept: "text/html,*/*"
        }
      })
    );

    if (!html) {
      return JSON.stringify([]);
    }

    const eps = parseEpisodes(html, seriesUrl);

    /*
     * If the app somehow passed the actual episode page and
     * the series page did not expose the list, retain it.
     */
    if (!eps.length && /\/video\//i.test(getPath(url))) {
      const n = episodeNumber(url, 1);

      return JSON.stringify([
        {
          href: url,
          number: n,
          title: "Bölüm " + n
        }
      ]);
    }

    return JSON.stringify(
      eps.slice(0, 500)
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * Media extraction
 * ========================================================= */

function isMediaUrl(url) {
  const u = String(url || "");

  return (
    /\.m3u8(?:$|[?#])/i.test(u) ||
    /\.mp4(?:$|[?#])/i.test(u) ||
    /\.m4v(?:$|[?#])/i.test(u) ||
    /\.webm(?:$|[?#])/i.test(u) ||
    /\/hls\/|\/manifest\/|\/playlist\//i.test(u)
  );
}

function extractMediaUrls(text, parent) {
  const out = [];

  if (!text) return out;

  let m;

  /*
   * JW Player / video.js / Plyr
   */
  const sourceRe =
    /(?:["'](?:file|src|source|url|videoUrl|hls)["']?\s*[:=]\s*["'])([^"']+)(?:["'])/gi;

  while ((m = sourceRe.exec(text))) {
    const u = absUrl(m[1], parent);

    if (isMediaUrl(u)) {
      out.push(u);
    }
  }

  /*
   * HTML <source>
   */
  const htmlSource =
    /<source[^>]+(?:src|data-src)=["']([^"']+)["']/gi;

  while ((m = htmlSource.exec(text))) {
    const u = absUrl(m[1], parent);

    if (isMediaUrl(u)) {
      out.push(u);
    }
  }

  /*
   * Direct m3u8.
   */
  const m3u8 =
    /https?:\/\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/gi;

  while ((m = m3u8.exec(text))) {
    out.push(
      absUrl(
        m[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/"),
        parent
      )
    );
  }

  /*
   * Direct MP4.
   */
  const mp4 =
    /https?:\/\/[^"'\\\s<>]+?\.mp4(?:\?[^"'\\\s<>]*)?/gi;

  while ((m = mp4.exec(text))) {
    out.push(absUrl(m[0], parent));
  }

  /*
   * Generic JSON URLs.
   */
  const generic =
    /["'](https?:\/\/[^"']+)["']/gi;

  while ((m = generic.exec(text))) {
    const candidate = absUrl(m[1], parent);

    if (isMediaUrl(candidate)) {
      out.push(candidate);
    }
  }

  return unique(out);
}

/* =========================================================
 * JSON recursive extraction
 * ========================================================= */

function extractUrlsFromObject(obj, parent) {
  const out = [];

  function walk(value) {
    if (value == null) return;

    if (typeof value === "string") {
      const decoded = decodeEntities(value);
      const u = absUrl(decoded, parent);

      if (isMediaUrl(u)) {
        out.push(u);
      }

      /*
       * Sometimes JSON contains escaped JSON.
       */
      if (
        decoded.charAt(0) === "{" ||
        decoded.charAt(0) === "["
      ) {
        try {
          walk(JSON.parse(decoded));
        } catch (e) {}
      }

      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i]);
      }

      return;
    }

    if (typeof value === "object") {
      const keys = Object.keys(value);

      for (let i = 0; i < keys.length; i++) {
        walk(value[keys[i]]);
      }
    }
  }

  walk(obj);

  return unique(out);
}

/* =========================================================
 * Byse player
 * ========================================================= */

function extractByseCode(url) {
  const m = String(url || "").match(
    /bysesukior\.com\/e\/([A-Za-z0-9_-]+)/i
  );

  return m ? m[1] : "";
}

async function resolveByse(playerUrl, episodeUrl) {
  const found = [];

  const fileCode = extractByseCode(playerUrl);

  /*
   * 1. Public embed settings API.
   *
   * Byse uses:
   * /api/videos/{file_code}/embed/settings
   */
  if (fileCode) {
    const apiUrl =
      "https://bysesukior.com/api/videos/" +
      encodeURIComponent(fileCode) +
      "/embed/settings";

    const apiResponse = await soraFetch(apiUrl, {
      headers: {
        Referer: playerUrl,
        Origin: "https://bysesukior.com",
        "User-Agent": UA,
        Accept: "application/json,text/plain,*/*"
      }
    });

    const apiText = await getText(apiResponse);

    if (apiText) {
      /*
       * Raw text extraction.
       */
      const direct = extractMediaUrls(
        apiText,
        playerUrl
      );

      for (let i = 0; i < direct.length; i++) {
        found.push(direct[i]);
      }

      /*
       * JSON extraction.
       */
      try {
        const json = JSON.parse(apiText);

        const jsonUrls = extractUrlsFromObject(
          json,
          playerUrl
        );

        for (let i = 0; i < jsonUrls.length; i++) {
          found.push(jsonUrls[i]);
        }
      } catch (e) {}
    }
  }

  /*
   * 2. Fetch actual Byse embed.
   */
  const playerHtml = await getText(
    await soraFetch(playerUrl, {
      headers: {
        Referer: episodeUrl || baseUrl + "/",
        Origin: baseUrl,
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*"
      }
    })
  );

  if (playerHtml) {
    const direct = extractMediaUrls(
      playerHtml,
      playerUrl
    );

    for (let i = 0; i < direct.length; i++) {
      found.push(direct[i]);
    }

    /*
     * Look for JSON objects embedded in scripts.
     */
    const scripts =
      playerHtml.match(
        /<script[^>]*>([\s\S]*?)<\/script>/gi
      ) || [];

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];

      const media = extractMediaUrls(
        script,
        playerUrl
      );

      for (let x = 0; x < media.length; x++) {
        found.push(media[x]);
      }

      /*
       * Try JSON-looking portions.
       */
      const jsonCandidates =
        script.match(
          /\{[\s\S]{20,}\}/g
        ) || [];

      for (let x = 0; x < jsonCandidates.length; x++) {
        try {
          const obj = JSON.parse(
            jsonCandidates[x]
          );

          const urls = extractUrlsFromObject(
            obj,
            playerUrl
          );

          for (let z = 0; z < urls.length; z++) {
            found.push(urls[z]);
          }
        } catch (e) {}
      }
    }
  }

  return unique(found);
}

/* =========================================================
 * Other players
 * ========================================================= */

function playerName(url) {
  const u = String(url || "").toLowerCase();

  if (/filemoon/.test(u)) return "FILEMOON";
  if (/mediacm|media-cm/.test(u)) return "MEDIACM";
  if (/streamwish|swdyu|wish/.test(u)) return "STREAMWISH";
  if (/voe\.sx/.test(u)) return "VOE";
  if (/bysesukior/.test(u)) return "BYSE";

  try {
    return new URL(url).hostname;
  } catch (e) {
    return "Player";
  }
}

async function resolveGenericPlayer(
  playerUrl,
  episodeUrl,
  depth
) {
  if (depth > 2) {
    return [];
  }

  /*
   * Byse has its own resolver.
   */
  if (/bysesukior\.com/i.test(playerUrl)) {
    return await resolveByse(
      playerUrl,
      episodeUrl
    );
  }

  const html = await getText(
    await soraFetch(playerUrl, {
      headers: {
        Referer: episodeUrl || baseUrl + "/",
        "User-Agent": UA,
        Accept: "text/html,*/*"
      }
    })
  );

  if (!html) return [];

  let streams = extractMediaUrls(
    html,
    playerUrl
  );

  /*
   * If player page contains another iframe,
   * follow it once/twice.
   */
  if (!streams.length) {
    const nested =
      extractIframeUrls(
        html,
        playerUrl
      );

    for (
      let i = 0;
      i < nested.length && i < 5;
      i++
    ) {
      const n = await resolveGenericPlayer(
        nested[i],
        playerUrl,
        depth + 1
      );

      streams = streams.concat(n);
    }
  }

  return unique(streams);
}

/* =========================================================
 * Player discovery
 * ========================================================= */

function discoverPlayers(
  html,
  episodeUrl
) {
  const players = [];
  const seen = {};

  function add(url) {
    url = absUrl(url, episodeUrl);

    if (!url || !isHttp(url)) return;

    if (seen[url]) return;

    /*
     * Don't treat the TürkAnime page itself as a player.
     */
    if (/turkanime\.tv/i.test(url)) {
      return;
    }

    seen[url] = true;

    players.push(url);
  }

  /*
   * Main iframe.
   */
  const iframes =
    extractIframeUrls(
      html,
      episodeUrl
    );

  for (let i = 0; i < iframes.length; i++) {
    add(iframes[i]);
  }

  /*
   * Player buttons can contain hidden iframe URLs
   * inside onclick/data attributes.
   */
  let m;

  const hostRe =
    /https?:\/\/[^"'\\\s<>]+(?:bysesukior|filemoon|mediacm|streamwish|voe\.sx)[^"'\\\s<>]*/gi;

  while ((m = hostRe.exec(html))) {
    add(
      m[0]
        .replace(/&amp;/gi, "&")
        .replace(/\\\//g, "/")
    );
  }

  /*
   * Sort Byse first because it is the actual main iframe
   * shown on the current TürkAnime page.
   */
  players.sort(function (a, b) {
    const aa =
      /bysesukior/i.test(a) ? 0 : 1;

    const bb =
      /bysesukior/i.test(b) ? 0 : 1;

    return aa - bb;
  });

  return players;
}

/* =========================================================
 * Stream entry
 * ========================================================= */

async function extractStreamUrl(url) {
  try {
    const episodeUrl = String(url || "");

    const html = await getText(
      await soraFetch(episodeUrl, {
        headers: {
          Referer: baseUrl + "/",
          Origin: baseUrl,
          "User-Agent": UA,
          Accept: "text/html,*/*"
        }
      })
    );

    if (!html) {
      return JSON.stringify({
        streams: [],
        subtitles: ""
      });
    }

    const found = [];

    /*
     * Direct sources.
     */
    const direct =
      extractMediaUrls(
        html,
        episodeUrl
      );

    for (let i = 0; i < direct.length; i++) {
      found.push({
        url: direct[i],
        label: "TürkAnime",
        player: episodeUrl
      });
    }

    /*
     * External players.
     */
    const players =
      discoverPlayers(
        html,
        episodeUrl
      );

    for (
      let i = 0;
      i < players.length && i < 8;
      i++
    ) {
      const player = players[i];

      const streams =
        await resolveGenericPlayer(
          player,
          episodeUrl,
          0
        );

      for (
        let x = 0;
        x < streams.length;
        x++
      ) {
        found.push({
          url: streams[x],
          label: playerName(player),
          player: player
        });
      }
    }

    /*
     * Deduplicate.
     */
    const seen = {};
    const output = [];

    for (let i = 0; i < found.length; i++) {
      const item = found[i];

      if (!item.url || seen[item.url]) {
        continue;
      }

      seen[item.url] = true;

      let title =
        "TürkAnime · " +
        item.label;

      if (/master\.m3u8/i.test(item.url)) {
        title += " · HLS";
      } else if (/\.m3u8/i.test(item.url)) {
        title += " · HLS";
      } else if (/\.mp4/i.test(item.url)) {
        title += " · MP4";
      }

      if (/1080/i.test(item.url)) {
        title += " · 1080p";
      } else if (/720/i.test(item.url)) {
        title += " · 720p";
      } else if (/480/i.test(item.url)) {
        title += " · 480p";
      } else if (/360/i.test(item.url)) {
        title += " · 360p";
      }

      output.push({
        title: title,
        name: title,
        streamUrl: item.url,
        headers: {
          "User-Agent": UA,
          Referer:
            item.player ||
            episodeUrl,
          Accept:
            "application/vnd.apple.mpegurl,video/*,*/*"
        }
      });
    }

    /*
     * HLS first.
     */
    output.sort(function (a, b) {
      const ah =
        /\.m3u8/i.test(a.streamUrl)
          ? 0
          : 1;

      const bh =
        /\.m3u8/i.test(b.streamUrl)
          ? 0
          : 1;

      return ah - bh;
    });

    return JSON.stringify({
      streams: output.slice(0, 20),
      subtitles: ""
    });
  } catch (e) {
    return JSON.stringify({
      streams: [],
      subtitles: ""
    });
  }
}
