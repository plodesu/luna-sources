/**
 * diziwatch (diziwatch8.com) – Sora / Luna
 * Search: /api/search.php?q=
 * Series: /dizi/{slug}
 * Episodes: /bolum/{slug}-{s}-sezon-{e}-bolum
 * Movies:  /film/{slug} → videoplay.vip/film/{id}
 * Player: videoplay.vip → HLS master
 * Seasons: episode number resets each season (1,2,… then 1,2,…) so Sora shows season picker
 * v1.0.6
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
// The diziwatch site's content id IS the TMDB id (verified: Bleach poster
// dizi_poster_bleach_30984 -> TMDB 30984 -> imdb tt0434665; Demon Slayer
// film content 1311031 -> imdb tt32820897). Resolve the ACCURATE IMDb id via
// TMDB external_ids (through the same keyless proxy the reference imdb module
// uses) instead of fuzzy title search. Community TMDB read key, no account.
const TMDB_PROXY = "https://post-eosin.vercel.app/api/proxy?url=";
const TMDB_KEY = "ad301b7cc82ffe19273e55e4d4206885";
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

  // Live iframe – series
  let m = html.match(
    /(?:src|data-src)=["'](https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"']+)["']/i
  );
  if (m) return m[1];

  // Live iframe – movie
  m = html.match(
    /(?:src|data-src)=["'](https?:\/\/videoplay\.vip\/film\/[^"']+)["']/i
  );
  if (m) return m[1];

  m = html.match(
    /(https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"'\s<>]+)/i
  );
  if (m) return m[1];

  m = html.match(/(https?:\/\/videoplay\.vip\/film\/\d+\?[^"'\s<>]*)/i);
  if (m) return m[1];

  m =
    html.match(/encodedContent\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/) ||
    html.match(/const encodedContent\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
  if (m) {
    try {
      const dec = b64decode(m[1]);
      let u = dec.match(
        /(?:src|data-src)=["'](https?:\/\/videoplay\.vip\/(?:dizi|film)\/[^"']+)["']/i
      );
      if (u) return u[1];
      u = dec.match(
        /(https?:\/\/videoplay\.vip\/(?:dizi\/\d+\/\d+\/\d+|film\/\d+)\?[^"'\s]*)/i
      );
      if (u) return u[1];
    } catch (e) {}
  }

  // Series progressKey: "114410_1_1"
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

  // Movie progressKey: "1218925"
  m = html.match(/progressKey\s*=\s*['"](\d+)['"]/);
  if (m && m[1].indexOf("_") < 0)
    return playerHost + "/film/" + m[1] + "?sid=diziwatch8.com";

  const p = parseHref(epUrl || "");
  const seriesId = html.match(
    /(?:dizi_poster|bolum_|dizi_backdrop)[^"'/]*_(\d+)\.(?:webp|jpg|png)/i
  );
  if (seriesId && p.season && p.episode) {
    return (
      playerHost +
      "/dizi/" +
      seriesId[1] +
      "/" +
      p.season +
      "/" +
      p.episode +
      "?sid=diziwatch8.com"
    );
  }

  const filmId = html.match(/film_poster[^"'/]*_(\d+)\.(?:webp|jpg|png)/i);
  if (filmId) return playerHost + "/film/" + filmId[1] + "?sid=diziwatch8.com";

  return "";
}

function parsePlayerPage(html) {
  const result = { hls: [], subs: [] };
  if (!html) return result;
  if (/Hata\s*\/\s*Error/i.test(html) && html.length < 8000) return result;

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
// The site's content id lives in the episode page's poster/backdrop filename
// (dizi_poster_bleach_30984) or progressKey (30984_2_1). It IS the TMDB id.
function extractTmdbId(html) {
  if (!html) return "";
  let m = html.match(
    /(?:dizi_poster|bolum_|dizi_backdrop|film_poster)[^"'/]*_(\d+)\.(?:webp|jpg|png)/i
  );
  if (m) return m[1];
  m = html.match(/progressKey\s*=\s*['"](\d+)(?:_(\d+)_(\d+))?['"]/);
  if (m) return m[1];
  return "";
}

// Accurate IMDb id from a TMDB id via external_ids (keyless proxy). More
// reliable than fuzzy title search when the site exposes the TMDB id (it does).
const __imdbCache = {};
async function resolveImdbFromTmdb(tmdbId, tmdbType) {
  if (!tmdbId || !/^\d+$/.test(String(tmdbId))) return "";
  const key = "tmdb2imdb/" + tmdbType + "/" + tmdbId;
  if (__imdbCache[key]) return __imdbCache[key];
  try {
    const inner =
      "https://api.themoviedb.org/3/" + tmdbType + "/" + tmdbId +
      "?api_key=" + TMDB_KEY + "&append_to_response=external_ids&language=en";
    const r = await cachedJson(TMDB_PROXY + encodeURIComponent(inner));
    const imdb = String((r && r.external_ids && r.external_ids.imdb_id) || "");
    if (imdb) __imdbCache[key] = imdb;
    return imdb;
  } catch (e) {
    return "";
  }
}

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

/* ---------------- Episode validation (SUBTITLES.md §5) -------------------- *
 * OpenSubtitles v3's imdbId:s:e mapping is polluted for some shows: it can
 * list OTHER seasons'/episodes' premieres alongside the true episode (the
 * Family Guy case: "Blue Harvest" S06E01, "Lottery Fever" S10E01, ...). A
 * large wrong-episode file otherwise auto-loads -> "right video, wrong subs".
 * Validate through the OS REST SEPARATE-endpoint, which returns each row's
 * release NAME (SubFileName). Parse an s:e code out of it and classify:
 *   verified (name == requested s:e)  -> keep, outrank
 *   blocked  (name != requested s:e)  -> drop for every language
 *   unknown  (no parsable code)       -> keep, lower priority
 * ----------------------------------------------------------------------- */
const OS_REST = "https://rest.opensubtitles.org/search";

// Numeric OpenSubtitles file id from either provider URL shape:
//   .../subencoding-stremio-utf8/src-api/file/1958351161   (v3)
//   .../dl.opensubtitles.org/en/download/filead/1957978378 (REST)
function subtitleFileId(url) {
  const m = String(url || "").match(/file(?:ad)?\/(\d+)/);
  return m ? m[1] : null;
}

// Parse (season, episode) from a release-style subtitle filename. Recognized:
// S01E01 / S01.E01, 1x01, [3.01], and the bare three-digit "101" form.
// Resolution tags like "1080p" cannot false-match (three-digit form needs
// word-ish boundaries around all digits AND rejects trailing letters).
function parseSubtitleNameEpisode(name) {
  const n = String(name || "");
  let m = n.match(/\bS(\d{1,2})[.\-_ ]?E(\d{1,3})\b/i);
  if (m) return { s: parseInt(m[1], 10), e: parseInt(m[2], 10) };
  m = n.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) return { s: parseInt(m[1], 10), e: parseInt(m[2], 10) };
  m = n.match(/\[(\d{1,2})\.(\d{1,3})\]/);
  if (m) return { s: parseInt(m[1], 10), e: parseInt(m[2], 10) };
  m = n.match(/(?:^|[\s\-_.])(\d)(\d{2})(?:[\s\-_.]|$)/);
  if (m) return { s: parseInt(m[1], 10), e: parseInt(m[2], 10) };
  return null;
}

const __trustCache = {};
async function fetchTrustedSubtitleIds(imdbId, isMovie, s, e) {
  const bare = String(imdbId || "").replace(/^tt/i, "");
  if (!/^\d+$/.test(bare)) return null;
  const key = "trusted/" + imdbId + "/" + (isMovie ? "m" : "s") + "/" + s + ":" + e;
  if (__trustCache[key]) return __trustCache[key];
  try {
    let url = OS_REST + "/";
    if (!isMovie) url += "episode-" + encodeURIComponent(String(e || 1)) + "/";
    url += "imdbid-" + bare;
    if (!isMovie) url += "/season-" + encodeURIComponent(String(s || 1));
    url += "/sublanguageid-eng";
    const r = await cachedJson(url, {
      headers: { "X-User-Agent": "trailers.to-UA", Accept: "application/json" },
    });
    if (!Array.isArray(r)) return null;
    const wantS = parseInt(s || "1", 10);
    const wantE = parseInt(e || "1", 10);
    const verified = {};
    const blocked = {};
    for (let i = 0; i < r.length; i++) {
      const row = r[i];
      if (!row || row.IDSubtitleFile == null) continue;
      const parsed = parseSubtitleNameEpisode(row.SubFileName);
      if (!parsed) continue;
      const id = String(row.IDSubtitleFile);
      if (parsed.s === wantS && parsed.e === wantE) verified[id] = true;
      else blocked[id] = true;
    }
    const result =
      Object.keys(verified).length > 0 || Object.keys(blocked).length > 0
        ? { verified: verified, blocked: blocked }
        : null;
    __trustCache[key] = result;
    return result;
  } catch (e2) {
    return null;
  }
}

// Apply the trust filter to a list of provider subs: drop blocked (foreign
// episode) files, keep verified first and unknown as eligible fallback.
// Returns the same {url,lang,label} list but ordered verified-first within
// each language and with wrong-episode files removed.
function applyTrustFilter(subs, trust) {
  if (!trust) return subs;
  const eligible = [];
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const fid = subtitleFileId(sub.url);
    if (!fid) { eligible.push(sub); continue; }
    if (trust.blocked && trust.blocked[fid]) continue; // foreign episode
    eligible.push(sub);
  }
  // verified-first within each language
  const byLang = {};
  const order = [];
  for (let i = 0; i < eligible.length; i++) {
    const sub = eligible[i];
    const lang = sub.lang;
    const cls = trust.verified && trust.verified[subtitleFileId(sub.url)] ? 1 : 0;
    const existing = byLang[lang];
    if (!existing) {
      byLang[lang] = { sub: sub, cls: cls };
      order.push(lang);
    } else if (cls > existing.cls) {
      byLang[lang] = { sub: sub, cls: cls };
    }
  }
  const out = [];
  for (let i = 0; i < order.length; i++) out.push(byLang[order[i]].sub);
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
 * Sora season picker:
 *   Ep 1..N  then Ep 1..M  → detects 2 seasons
 * So number = episode WITHIN season (resets every season).
 * Order must stay chronological: all S1, then all S2, …
 */
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);

    // Movies → single entry
    if (p.type === "movie" || /\/film\//i.test(String(url))) {
      const href =
        String(url).indexOf("http") === 0 ? String(url) : absUrl(String(url));
      return JSON.stringify([
        { href: href, number: 1, season: 1, episode: 1, title: "Film" },
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

    // Must be sorted: full season 1, then season 2, …
    raw.sort(function (a, b) {
      return a.season - b.season || a.episode - b.episode;
    });

    const eps = raw.map(function (e) {
      const code = "S" + pad2(e.season) + "E" + pad2(e.episode);
      return {
        href: e.href,
        // Reset per season → Sora builds Season 1 / Season 2 picker
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

    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: playerHost + "/",
      Origin: playerHost,
    };

    let subtitles = "";
    if (parsed.subs.length) subtitles = forceHttps(parsed.subs[0].url);

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
      subtitles: subtitlePairs,
      subtitlesHeaders: subtitleHeaders || {},
      subtitleHeaders: subtitleHeaders || {},
      allSubtitles: allSubtitles,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
