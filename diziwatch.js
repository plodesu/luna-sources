/**
 * diziwatch (diziwatch8.com) – Sora / Luna
 * Search: /api/search.php?q=
 * Series: /dizi/{slug}
 * Episodes: /bolum/{slug}-{s}-sezon-{e}-bolum
 * Player: videoplay.vip → HLS master (A/V together)
 * Subtitle: embedded tracks from the player (Provider C) — must carry the
 *   player Referer header (403 without it). Emitted at the TOP LEVEL of the
 *   return, matching the working hydrahd shape: subtitle (default auto-load),
 *   subtitles ([label,url,…] pair-array), subtitlesHeaders (Referer!), and
 *   allSubtitles ([{url,label,kind,headers}]).
 * Async: bounded response cache (static pages only) to avoid redundant
 *   fetches across the flow; the player page is never cached (expiring token).
 * Episodes: number = in-season episode number + separate `season` field
 *   (docs contract), so clients render "Sezon X / Bölüm Y" instead of "1001".
 * v1.4.0
 */
const baseUrl = "https://diziwatch8.com";
const playerHost = "https://videoplay.vip";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      Accept: "text/html,application/json,*/*",
      // The fetchv2 bridge cannot decompress gzip/brotli (SUBTITLES.md §8).
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

/* ---------------------------------------------------------------- *
 *  Bounded in-memory response cache (SUBTITLES.md §8).              *
 *  Caches only successful (2xx) non-empty bodies, keyed by URL.     *
 *  The same module instance handles the whole flow (search →        *
 *  details → episodes → stream), so the series page fetched by      *
 *  extractDetails/extractEpisodes is reused by extractStreamUrl,    *
 *  and re-opening an episode reuses its already-fetched player page.*
 * ---------------------------------------------------------------- */
const __httpCache = Object.create(null);
const __httpCacheMax = 80;
function __cacheSet(key, value) {
  const keys = Object.keys(__httpCache);
  if (keys.length >= __httpCacheMax) delete __httpCache[keys[0]];
  __httpCache[key] = value;
}

async function cachedText(url, options) {
  if (typeof __httpCache[url] === "string") return __httpCache[url];
  const res = await soraFetch(url, options);
  const text = await getText(res);
  if (!text) return text; // don't cache failures
  // `.status` is present on the fetchv2 bridge response; the legacy
  // `fetch` fallback returns a bare string with no status, treat as ok.
  const status =
    res && res.status != null
      ? res.status
      : res && res.ok === false
        ? 500
        : 200;
  if (status >= 200 && status < 300) __cacheSet(url, text);
  return text;
}

async function cachedJson(url, options) {
  const text = await cachedText(url, options);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}
function forceHttps(u) {
  return String(u || "").replace(/^http:\/\//i, "https://");
}
function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    })
    .replace(/\\u([0-9a-f]{4})/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
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
function b64decode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  str = String(str || "").replace(/[^A-Za-z0-9+/=]/g, "");
  let out = "";
  for (let i = 0; i < str.length; i += 4) {
    const a = chars.indexOf(str.charAt(i));
    const b = chars.indexOf(str.charAt(i + 1));
    const c = chars.indexOf(str.charAt(i + 2));
    const d = chars.indexOf(str.charAt(i + 3));
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== -1 && str.charAt(i + 2) !== "=")
      out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== -1 && str.charAt(i + 3) !== "=")
      out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}
function pad2(n) {
  n = String(n);
  return n.length < 2 ? "0" + n : n;
}
function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/bolum\/([^/?#]+?)-(\d+)-sezon-(\d+)-bolum\/?/i);
  if (m)
    return {
      type: "episode",
      slug: m[1],
      season: parseInt(m[2], 10),
      episode: parseInt(m[3], 10),
    };
  m = s.match(/\/dizi\/([^/?#]+)\/?/i);
  if (m) return { type: "series", slug: m[1], season: 0, episode: 0 };
  m = s.match(/\/film\/([^/?#]+)\/?/i);
  if (m) return { type: "movie", slug: m[1], season: 0, episode: 0 };
  return { type: "unknown", slug: "", season: 0, episode: 0 };
}

function extractPlayerEmbed(html, epUrl) {
  if (!html) return "";

  // Player URL form: /dizi/{contentId}/{s}/{e} (series) OR /film/{contentId} (movie)
  let m = html.match(
    /(?:src|data-src)=["'](https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"']+)["']/i
  );
  if (m) return m[1];

  m = html.match(
    /(https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"'\s<>]+)/i
  );
  if (m) return m[1];

  m =
    html.match(/encodedContent\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/) ||
    html.match(/const encodedContent\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
  if (m) {
    try {
      const dec = b64decode(m[1]);
      const u = dec.match(
        /(?:src|data-src)=["'](https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"']+)["']/i
      );
      if (u) return u[1];
      const u2 = dec.match(
        /(https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"'\s]*)/i
      );
      if (u2) return u2[1];
    } catch (e) {}
  }

  const p = parseHref(epUrl || "");

  // Series progressKey: "<contentId>_<season>_<episode>"
  m = html.match(/progressKey\s*=\s*['"](\d+)_(\d+)_(\d+)['"]/);
  if (m) {
    return (
      playerHost +
      "/dizi/" +
      m[1] +
      "/" +
      m[2] +
      "/" +
      m[3] +
      "?sid=diziwatch8.com"
    );
  }

  // Series fallback: poster/backdrop id + season/episode parsed from the URL
  const idMatch = html.match(
    /(?:dizi_poster|bolum_|dizi_backdrop)[^"'/]*_(\d+)\.(?:webp|jpg|png)/i
  );
  if (idMatch && p.season && p.episode) {
    return (
      playerHost +
      "/dizi/" +
      idMatch[1] +
      "/" +
      p.season +
      "/" +
      p.episode +
      "?sid=diziwatch8.com"
    );
  }

  // Movie progressKey: "<contentId>" (single number, no season/episode)
  m = html.match(/progressKey\s*=\s*['"](\d+)['"]/);
  if (m) return playerHost + "/film/" + m[1] + "?sid=diziwatch8.com";

  // Movie fallback: poster/backdrop id
  const fim = html.match(
    /(?:film_poster|film_backdrop|dizi_poster|bolum_)[^"'/]*_(\d+)\.(?:webp|jpg|png)/i
  );
  if (fim && p.type === "movie")
    return playerHost + "/film/" + fim[1] + "?sid=diziwatch8.com";

  return "";
}

function parsePlayerPage(html) {
  const result = { hls: [], subs: [] };
  if (!html) return result;

  const masters = html.match(
    /\/play\.m3u8\?id=\d+&t=m&token=[A-Za-z0-9_-]+&expires=\d+/g
  );
  if (masters) {
    const seen = {};
    masters.forEach(function (p) {
      if (p.indexOf("${") >= 0) return;
      const u = playerHost + p;
      if (seen[u]) return;
      seen[u] = true;
      result.hls.push(u);
    });
  }

  if (!result.hls.length) {
    const sm = html.match(
      /const\s+src\s*=\s*['"](\/play\.m3u8\?id=\d+[^'"]+)['"]/
    );
    if (sm && sm[1].indexOf("token=") >= 0) result.hls.push(playerHost + sm[1]);
  }

  let vid = "";
  if (result.hls.length) {
    const mm = result.hls[0].match(/id=(\d+)/);
    if (mm) vid = mm[1];
  }
  let hlsBase = "";
  const bp = html.match(/hlsBasePath\s*=\s*['"]([^'"]+)['"]/);
  if (bp) hlsBase = bp[1].replace(/\\+/g, "/").replace(/^\/+/, "");
  if (!hlsBase && vid) hlsBase = "uploads/hls/" + vid + "/";

  const td = html.match(/tracksData\s*=\s*(\{[\s\S]*?\});/);
  if (td) {
    try {
      const j = JSON.parse(td[1].replace(/\\\//g, "/"));
      const list = (j && j.subtitles) || [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s || !s.url) continue;
        let rel = String(s.url).replace(/\\\//g, "/").replace(/^\//, "");
        let subUrl = "";
        if (/^https?:\/\//i.test(rel)) subUrl = rel;
        else if (hlsBase) subUrl = playerHost + "/" + hlsBase + rel;
        else if (vid) subUrl = playerHost + "/uploads/hls/" + vid + "/" + rel;
        if (!subUrl) continue;
        result.subs.push({
          url: forceHttps(subUrl),
          label: decodeEntities(String(s.name || s.lang || "Sub")),
          lang: String(s.lang || "").toLowerCase(),
          default: !!s.default,
        });
      }
    } catch (e) {}
  }

  result.subs.sort(function (a, b) {
    function rank(x) {
      if (x.lang === "tr" || /t[uü]rk/i.test(x.label)) return 0;
      if (x.default) return 1;
      if (x.lang === "en" || /ingiliz|english/i.test(x.label)) return 2;
      return 3;
    }
    return rank(a) - rank(b);
  });
  return result;
}

/**
 * Curate embedded tracks (Provider C) into one entry per language, deduped
 * by URL, preserving the provider's rank order. Each entry carries its own
 * headers (Referer!) so the app can fetch the VTT without a 403 (§4).
 */
function curatedSubtitleEntries(tracks, subHeaders) {
  const out = [];
  const seenUrl = {};
  const seenLang = {};
  if (!tracks) return out;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.url) continue;
    const url = String(t.url);
    const lang = String(t.lang || "und").toLowerCase();
    if (seenUrl[url] || seenLang[lang]) continue;
    seenUrl[url] = true;
    seenLang[lang] = true;
    out.push({
      url: url,
      label: decodeEntities(String(t.label || t.lang || "Sub")),
      lang: lang,
      headers: subHeaders,
    });
  }
  return out;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const data = await cachedJson(
      baseUrl + "/api/search.php?q=" + encodeURIComponent(cleaned),
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: baseUrl + "/",
        },
      }
    );
    const list = (data && data.results) || [];
    const results = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || !item.slug) continue;
      const type = String(item.type || "series").toLowerCase();
      const path =
        type === "movie" || type === "film"
          ? "/film/" + item.slug
          : "/dizi/" + item.slug;
      const href = absUrl(path);
      if (seen[href]) continue;
      seen[href] = true;
      let image = item.poster || "";
      if (image && image.charAt(0) === "/") image = baseUrl + image;
      results.push({
        title: decodeEntities(item.title || item.slug)
          .replace(/\s+/g, " ")
          .trim(),
        image: absUrl(image),
        href: href,
      });
    }
    return JSON.stringify(results.slice(0, 30));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const p = parseHref(url);
    let page = String(url);
    if (p.type === "episode" && p.slug) page = baseUrl + "/dizi/" + p.slug;
    const html = await cachedText(page);
    let description = "N/A";
    const dm =
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      ) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i);
    if (dm)
      description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);
    let aliases = "N/A";
    const am = html.match(/og:title[^>]+content=["']([^"']+)/i);
    if (am) aliases = decodeEntities(am[1]).replace(/\s*izle.*$/i, "").trim();
    let airdate = "N/A";
    const ym =
      html.match(/YEAR OF PUBLICATION[\s\S]{0,80}?>(\d{4})</i) ||
      html.match(/Yayın Yılı[\s\S]{0,80}?>(\d{4})</i) ||
      html.match(/>\s*(20\d{2})\s*</);
    if (ym) airdate = ym[1];
    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

/* ===================== EPISODES ===================== */
/**
 * number = episode number within its season (docs contract: extractEpisodes
 * → {href, number:"1", season}). A separate `season` field lets the client
 * group/display seasons; an app-facing `title` carries "S03E01 · …".
 * (Do NOT use season*1000+episode — clients render that literal "1001".)
 */
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);

    // Movies have no episode list — expose the film itself as a single
    // entry so the client can play it (see extractStreamUrl / /film/*).
    if (p.type === "movie") {
      return JSON.stringify([
        {
          href: String(url),
          number: 1,
          season: 1,
          episode: 1,
          title: "Film · 1 Bölüm",
        },
      ]);
    }

    const seriesUrl =
      p.slug && p.type !== "movie"
        ? baseUrl + "/dizi/" + p.slug
        : String(url);

    const html = await cachedText(seriesUrl);
    const raw = [];
    const seen = {};

    const re =
      /href="((?:https?:\/\/[^"]+)?\/bolum\/([^"/]+?)-(\d+)-sezon-(\d+)-bolum\/?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const season = parseInt(m[3], 10);
      const ep = parseInt(m[4], 10);
      const key = season + "-" + ep;
      if (seen[key]) continue;
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0)
        continue;
      seen[key] = true;
      raw.push({ href: absUrl(m[1]), season: season, episode: ep });
    }

    raw.sort(function (a, b) {
      return a.season - b.season || a.episode - b.episode;
    });

    const eps = raw.map(function (e) {
      const code = "S" + pad2(e.season) + "E" + pad2(e.episode);
      return {
        href: e.href,
        number: e.episode,
        season: e.season,
        episode: e.episode,
        title: code + " · " + e.season + ". Sezon " + e.episode + ". Bölüm",
      };
    });

    if (!eps.length && /\/bolum\//i.test(String(url))) {
      const pe = parseHref(url);
      const s = pe.season || 1;
      const e = pe.episode || 1;
      eps.push({
        href: String(url),
        number: e,
        season: s,
        episode: e,
        title: "S" + pad2(s) + "E" + pad2(e),
      });
    }

    return JSON.stringify(eps.slice(0, 800));
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url),
        number: 1,
        season: 1,
        episode: 1,
        title: "S01E01",
      },
    ]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    let epUrl = String(url).split("?")[0];
    if (!/^https?:\/\//i.test(epUrl))
      epUrl = baseUrl + (epUrl.charAt(0) === "/" ? epUrl : "/" + epUrl);

    // Series page → first episode
    if (/\/dizi\//i.test(epUrl) && !/\/bolum\//i.test(epUrl)) {
      const seriesHtml = await cachedText(epUrl);
      const all = [];
      const re =
        /href="((?:https?:\/\/[^"]+)?\/bolum\/[^"]+?-(\d+)-sezon-(\d+)-bolum\/?)"/gi;
      let x;
      while ((x = re.exec(seriesHtml))) {
        all.push({
          href: absUrl(x[1]),
          s: parseInt(x[2], 10),
          e: parseInt(x[3], 10),
        });
      }
      all.sort(function (a, b) {
        return a.s - b.s || a.e - b.e;
      });
      if (!all.length) return JSON.stringify({ streams: [], subtitles: "" });
      epUrl = all[0].href;
    }

    const epHtml = await cachedText(epUrl, {
      headers: { Referer: baseUrl + "/", "User-Agent": UA },
    });
    if (!epHtml || epHtml.length < 200)
      return JSON.stringify({ streams: [], subtitles: "" });

    const embed = extractPlayerEmbed(epHtml, epUrl);
    if (!embed || !isHttp(embed))
      return JSON.stringify({ streams: [], subtitles: "" });

    // NOTE: the player page is NOT cached — its HLS master carries an
    // expiring token, so a cached page could serve a dead stream URL.
    const playerHtml = await getText(
      await soraFetch(embed, {
        headers: {
          "User-Agent": UA,
          Referer: epUrl,
          Accept: "text/html,*/*",
        },
      })
    );
    if (!playerHtml || playerHtml.length < 100)
      return JSON.stringify({ streams: [], subtitles: "" });

    const parsed = parsePlayerPage(playerHtml);
    if (!parsed.hls.length)
      return JSON.stringify({ streams: [], subtitles: "" });

    // Must be sent on playlist AND every segment (.jpg TS)
    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: playerHost + "/",
      Origin: playerHost,
    };

    // Subtitle tracks come from the player origin and 403 without the
    // Referer/Origin (SUBTITLES.md §4) — carry the headers on every track so
    // the app never renders an empty track.
    const subHeaders = {
      "User-Agent": UA,
      Accept: "text/vtt,*/*",
      Referer: playerHost + "/",
      Origin: playerHost,
    };
    const curated = curatedSubtitleEntries(parsed.subs, subHeaders);

    // Default (auto-load) subtitle: the provider's own default track, else
    // the first one available. For diziwatch that is the Turkish track.
    let subtitle = "";
    let subtitleHeaders = null;
    if (curated.length) {
      let def = null;
      for (let i = 0; i < parsed.subs.length; i++) {
        if (parsed.subs[i] && parsed.subs[i].default) { def = parsed.subs[i]; break; }
      }
      if (!def) def = parsed.subs[0];
      if (def) {
        subtitle = String(def.url);
        subtitleHeaders = subHeaders;
      }
    }

    // Sora picker shape: flat [label, url, label, url, ...] pair-array.
    const subtitlePairs = [];
    curated.forEach(function (entry) { subtitlePairs.push(entry.label, entry.url); });
    let finalSubtitles;
    if (subtitlePairs.length >= 2) finalSubtitles = subtitlePairs;
    else if (subtitle) finalSubtitles = subtitle;
    else finalSubtitles = [];

    // Shirox-family builds read [{url,label,kind,headers}] instead.
    const allSubtitles = curated.map(function (entry) {
      return { url: entry.url, label: entry.label, kind: "subtitles", headers: entry.headers || {} };
    });

    // Master only — keeps VIDEO + AUDIO together (better for Luna)
    const streams = [];
    for (let i = 0; i < parsed.hls.length; i++) {
      const master = forceHttps(parsed.hls[i]);
      if (!isHttp(master)) continue;
      const stream = {
        title: i === 0 ? "Videoplay · HLS" : "Videoplay · HLS " + (i + 1),
        streamUrl: master,
        headers: headers,
      };
      if (subtitle) stream.subtitle = subtitle;
      streams.push(stream);
    }

    const primary = streams.length ? streams[0].streamUrl : "";
    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 4),
      subtitle: subtitle,
      subtitles: finalSubtitles,
      subtitlesHeaders: subtitleHeaders || {},
      allSubtitles: allSubtitles,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
