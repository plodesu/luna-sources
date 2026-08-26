/**
 * diziwatch (diziwatch8.com) – Sora / Luna
 * Search: /api/search.php?q=
 * Series: /dizi/{slug}
 * Episodes: /bolum/{slug}-{s}-sezon-{e}-bolum
 * Player: videoplay.vip → HLS master (A/V together)
 * Subtitle: BOTH sources, so every client shows subs.
 *   - Provider C (site/player embedded): `allSubtitles` carries the Referer
 *     (videoplay.vip 403 without it) for clients that send per-track headers.
 *   - Provider A (keyless OpenSubtitles v3): HEADER-FREE URLs that the
 *     Sora/Sulfur client can load (it reads `subtitles` as [String] and
 *     fetches each with URLSession.shared — no headers). Resolved via keyless
 *     Cinemeta title -> IMDb id. Best-effort + success-cached.
 *   `subtitles` = header-free [String] URLs; `allSubtitles` = both sources.
 * Episodes: number = in-season episode number + separate `season` field
 *   (docs contract), so clients render "Sezon X / Bölüm Y" instead of "1001".
 * Async: bounded response cache (static pages only) to avoid redundant
 *   fetches across the flow; the player page is never cached (expiring token).
 * v1.5.0
 */
const baseUrl = "https://diziwatch8.com";
const playerHost = "https://videoplay.vip";
// Keyless providers (SUBTITLES.md) for HEADER-FREE subtitles. The diziwatch
// player's own tracks are Referer-gated (videoplay.vip 403 without it), and
// the Sora/Sulfur client loads `subtitles` with URLSession.shared (NO custom
// headers), so those can never render there. OpenSubtitles URLs need no
// header and DO load in every client. Cinemeta resolves the title -> IMDb id.
const OS_V3 = "https://opensubtitles-v3.strem.io";
const CINEMETA = "https://v3-cinemeta.strem.io";
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
// Human-readable labels for 3-letter subtitle language codes.
const LANG_NAMES = {
  en: "English", eng: "English", tr: "Türkçe", tur: "Türkçe",
  spa: "Español", es: "Español", por: "Português", por: "Português",
  pob: "Português (BR)", pt: "Português", fra: "Français", fre: "Français",
  deu: "Deutsch", ger: "Deutsch", ita: "Italiano", kor: "한국어", ko: "한국어",
  jpn: "日本語", ja: "日本語", ara: "العربية", rus: "Русский", ru: "Русский",
  vie: "Tiếng Việt", vi: "Tiếng Việt", zho: "中文", zh: "中文", pol: "Polski",
  ukr: "Українська", heb: "עברית", fas: "فارسی", ind: "Indonesia",
};
function langLabel(code) {
  return LANG_NAMES[String(code || "").toLowerCase()] || String(code || "Sub");
}

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

/* ---------------- Header-free subtitle providers (SUBTITLES.md) --------- *
 * The diziwatch player's own tracks are Referer-gated and the Sora/Sulfur
 * client fetches `subtitles` with URLSession.shared (no headers), so those
 * can't render there. OpenSubtitles URLs need no header, so they load in
 * every client. Resolve the title -> IMDb id via keyless Cinemeta, then pull
 * the episode's OpenSubtitles v3 tracks. All success-cached.
 * ----------------------------------------------------------------------- */
const __imdbCache = {};
async function resolveImdbId(title, type) {
  if (!title) return "";
  const key = type + ":" + String(title).trim().toLowerCase();
  if (__imdbCache[key]) return __imdbCache[key];
  try {
    const r = await cachedJson(
      CINEMETA + "/catalog/" + type + "/top/search=" + encodeURIComponent(title) + ".json"
    );
    const metas = (r && r.metas) || [];
    if (!metas.length) return "";
    const lower = String(title).trim().toLowerCase();
    let best = null;
    for (let i = 0; i < metas.length; i++) {
      if (String(metas[i].name || "").toLowerCase() === lower) { best = metas[i]; break; }
    }
    if (!best) {
      for (let i = 0; i < metas.length; i++) {
        if (String(metas[i].name || "").toLowerCase().indexOf(lower) === 0) { best = metas[i]; break; }
      }
    }
    if (!best) best = metas[0];
    const id = String((best && best.id) || "");
    if (id) __imdbCache[key] = id;
    return id;
  } catch (e) {
    return "";
  }
}

async function fetchStremioSubs(imdbId, type, s, e) {
  if (!imdbId) return [];
  // Series MUST use the colon path imdbId:s:e (SUBTITLES.md §2); the query
  // form is silently ignored by the addon.
  const id = type === "series"
    ? imdbId + ":" + encodeURIComponent(s) + ":" + encodeURIComponent(e)
    : imdbId;
  try {
    const r = await cachedJson(OS_V3 + "/subtitles/" + type + "/" + id + ".json", {
      headers: { Accept: "application/json", Referer: "https://app.strem.io/" },
    });
    const subs = (r && r.subtitles) || [];
    const out = [];
    const seen = {};
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      if (!sub || !sub.url) continue;
      const url = String(sub.url);
      if (seen[url]) continue;
      seen[url] = true;
      const code = String(sub.lang || "und").toLowerCase();
      out.push({ lang: code, url: url, label: langLabel(code) });
    }
    return out;
  } catch (e) {
    return [];
  }
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

    // Default (auto-load) subtitle for HEADER-CAPABLE clients: the player's
    // own default track (Turkish on diziwatch), with its Referer headers kept
    // attached (SUBTITLES.md §7).
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

    // Header-free OpenSubtitles tracks (SUBTITLES.md provider A). The
    // Sora/Sulfur client loads `subtitles` with URLSession.shared (no
    // headers), so the Referer-gated videoplay.vip tracks can never render
    // there; OpenSubtitles URLs need no header and load in every client.
    // Best-effort and success-cached; never blocks the stream list.
    let osSubs = [];
    try {
      const hf = parseHref(epUrl);
      const isMovie = /\/film\//i.test(epUrl) || hf.type === "movie";
      const type = isMovie ? "movie" : "series";
      const s = isMovie ? 1 : (hf.season || 1);
      const e = isMovie ? 1 : (hf.episode || 1);
      const title = String(hf.slug || "").replace(/-/g, " ").trim();
      const imdbId = await resolveImdbId(title, type);
      if (imdbId) osSubs = await fetchStremioSubs(imdbId, type, s, e);
    } catch (e2) { osSubs = []; }
    // Order header-free tracks: Turkish first, then English, then the rest.
    osSubs.sort(function (a, b) {
      function r(x) { if (/^(tr|tur)$/i.test(x.lang)) return 0; if (/^(en|eng)$/i.test(x.lang)) return 1; return 2; }
      return r(a) - r(b);
    });
    const osEntries = curatedSubtitleEntries(osSubs, null);

    // `subtitles` = header-free URLs only (these are what the Sora/Sulfur
    // client can actually load without a Referer). Keep OpenSubtitles ahead of
    // the site tracks so the auto-load picks a loadable track.
    const subtitleUrls = osEntries.length
      ? osEntries.map(function (x) { return x.url; })
      : curated.map(function (x) { return x.url; });

    // Header-carrying list for clients that send per-track headers
    // (Shirox-family / SUBTITLES.md §7): site tracks keep their Referer,
    // OpenSubtitles need none.
    const allSubtitles = curated.map(function (entry) {
      return { url: entry.url, label: entry.label, kind: "subtitles", headers: entry.headers || {} };
    }).concat(osEntries.map(function (entry) {
      return { url: entry.url, label: entry.label, kind: "subtitles", headers: entry.headers || {} };
    }));

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
      subtitles: subtitleUrls,
      subtitlesHeaders: subtitleHeaders || {},
      subtitleHeaders: subtitleHeaders || {},
      allSubtitles: allSubtitles,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
