/**
 * RapPhim (rapphim.vip) – Sora / Luna
 * API: https://api.rapphim.vip/api
 * Search: GET /movies?q=
 * Detail: GET /movies/slug/{slug}
 * Streams: episode.sources[] (hls) – prefer Zeus when present
 * Softsub: episode.subtitles[] (.vtt)
 * v1.0.0
 */
const baseUrl = "https://rapphim.vip";
const apiBase = "https://api.rapphim.vip/api";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json,text/html,*/*",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      Referer: baseUrl + "/",
      Origin: baseUrl,
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

async function getJson(res) {
  const t = await getText(res);
  if (!t) return null;
  try {
    return JSON.parse(t);
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
function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHref(url) {
  const s = String(url || "");
  // /anime/{slug}/xem/tap-3  or /phim/{slug}/xem
  let m = s.match(/\/(?:anime|phim)\/([^/?#]+)\/xem(?:\/tap-(\d+))?/i);
  if (m)
    return {
      slug: m[1],
      episode: m[2] ? parseInt(m[2], 10) : 1,
      type: s.indexOf("/anime/") >= 0 ? "anime" : "movie",
    };
  m = s.match(/\/(?:anime|phim)\/([^/?#]+)/i);
  if (m)
    return {
      slug: m[1],
      episode: 0,
      type: s.indexOf("/anime/") >= 0 ? "anime" : "movie",
    };
  // custom href we store: rapphim://{slug}|{ep}
  m = s.match(/^rapphim:\/\/([^|]+)\|(\d+)/i);
  if (m) return { slug: m[1], episode: parseInt(m[2], 10), type: "anime" };
  m = s.match(/^rapphim:\/\/([^|]+)/i);
  if (m) return { slug: m[1], episode: 0, type: "anime" };
  return { slug: "", episode: 0, type: "unknown" };
}

function seriesHref(slug, isAnime) {
  if (isAnime) return baseUrl + "/anime/" + slug;
  return baseUrl + "/phim/" + slug;
}

function watchHref(slug, ep, isAnime) {
  if (isAnime) return baseUrl + "/anime/" + slug + "/xem/tap-" + ep;
  return baseUrl + "/phim/" + slug + "/xem";
}

function serverRank(name) {
  const n = String(name || "").toLowerCase();
  if (n.indexOf("zeus") >= 0) return 0;
  if (n.indexOf("kaa") >= 0) return 1;
  if (n.indexOf("miruro") >= 0) return 2;
  if (n.indexOf("vietsub") >= 0) return 3;
  return 5;
}

async function apiGet(path) {
  const data = await getJson(await soraFetch(apiBase + path));
  return data;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const data = await apiGet(
      "/movies?q=" + encodeURIComponent(cleaned) + "&limit=30"
    );
    let items = (data && data.data) || [];
    if (!Array.isArray(items)) items = [];
    // autocomplete fallback
    if (!items.length) {
      const ac = await apiGet(
        "/movies/search/autocomplete?q=" +
          encodeURIComponent(cleaned) +
          "&limit=20"
      );
      items = ((ac && ac.data && ac.data.suggestions) || []).slice();
    }
    const results = [];
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.slug) continue;
      if (seen[it.slug]) continue;
      seen[it.slug] = true;
      const isAnime = !!(it.isAnime || it.type === "series" || it.anilistId);
      const title =
        it.title || it.englishName || it.originalTitle || it.slug;
      const image =
        it.posterUrl ||
        it.poster ||
        (it.posterKey
          ? "https://s1.cloud152.stream/" + it.posterKey
          : "");
      results.push({
        title: String(title).trim(),
        image: absUrl(image),
        href: seriesHref(it.slug, isAnime || it.type !== "movie"),
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
    if (!p.slug)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    const data = await apiGet("/movies/slug/" + encodeURIComponent(p.slug));
    const d = (data && data.data) || {};
    const description = String(
      d.description || d.descriptionEn || "N/A"
    ).slice(0, 900);
    const aliases =
      d.englishName || d.originalTitle || d.title || "N/A";
    const airdate = String(d.releaseYear || d.releaseDate || "N/A");
    return JSON.stringify([
      {
        description: description || "N/A",
        aliases: aliases,
        airdate: airdate,
      },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

/* ===================== EPISODES ===================== */
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    if (!p.slug) return JSON.stringify([]);
    const data = await apiGet("/movies/slug/" + encodeURIComponent(p.slug));
    const d = (data && data.data) || {};
    const isAnime = !!(d.isAnime || d.type === "series");
    const epsRaw = d.episodes || [];
    const eps = [];
    const seen = {};

    for (let i = 0; i < epsRaw.length; i++) {
      const e = epsRaw[i];
      if (!e) continue;
      const num = parseInt(e.episodeNumber, 10) || i + 1;
      if (seen[num]) continue;
      seen[num] = true;
      const season = parseInt(e.season, 10) || 1;
      eps.push({
        href: watchHref(p.slug, num, isAnime),
        number: num,
        season: season,
        episode: num,
        title:
          e.title && String(e.title).trim()
            ? "Tập " + num + " · " + e.title
            : "Tập " + num,
      });
    }

    // Movies with no episode list
    if (!eps.length) {
      eps.push({
        href: watchHref(p.slug, 1, isAnime),
        number: 1,
        season: 1,
        episode: 1,
        title: d.type === "movie" ? "Full Movie" : "Tập 1",
      });
    }

    // Sora season detection: reset numbers per season when multi-season
    const seasons = {};
    for (let i = 0; i < eps.length; i++) {
      seasons[eps[i].season] = true;
    }
    const multi = Object.keys(seasons).length > 1;
    if (multi) {
      // keep episode number as episode within season (resets each season)
      // already using episodeNumber from API
    }

    eps.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    if (!p.slug)
      return JSON.stringify({ streams: [], subtitles: "" });

    const data = await apiGet("/movies/slug/" + encodeURIComponent(p.slug));
    const d = (data && data.data) || {};
    const epsRaw = d.episodes || [];
    const want = p.episode || 1;

    let ep = null;
    for (let i = 0; i < epsRaw.length; i++) {
      if (parseInt(epsRaw[i].episodeNumber, 10) === want) {
        ep = epsRaw[i];
        break;
      }
    }
    if (!ep && epsRaw.length) ep = epsRaw[0];
    if (!ep) return JSON.stringify({ streams: [], subtitles: "" });

    const sources = (ep.sources || []).slice();
    sources.sort(function (a, b) {
      return serverRank(a.serverName) - serverRank(b.serverName);
    });

    const streams = [];
    const seen = {};
    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: baseUrl + "/",
      Origin: baseUrl,
    };

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      let media = forceHttps(s.url || s.signedUrl || "");
      if (!isHttp(media) || seen[media]) continue;
      // prefer real media
      if (
        media.indexOf("m3u8") < 0 &&
        !/\.mp4(\?|$)/i.test(media) &&
        s.type !== "hls" &&
        s.type !== "m3u8_proxy" &&
        s.type !== "mp4"
      ) {
        // still allow cloud152 proxy links
        if (media.indexOf("cloud152.stream") < 0) continue;
      }
      seen[media] = true;
      const name = s.serverName || "Server " + (i + 1);
      const q = s.quality && s.quality !== "auto" ? " · " + s.quality : "";
      streams.push({
        title: name + q,
        streamUrl: media,
        headers: headers,
      });
    }

    // Softsubs
    let subtitles = "";
    const subs = ep.subtitles || [];
    const subOut = [];
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const su = forceHttps(sub.url || "");
      if (!isHttp(su)) continue;
      subOut.push({
        url: su,
        language: sub.language || sub.label || "und",
        headers: headers,
      });
    }
    // Prefer Vietnamese first
    subOut.sort(function (a, b) {
      const av = /vi/i.test(a.language) ? 0 : 1;
      const bv = /vi/i.test(b.language) ? 0 : 1;
      return av - bv;
    });
    if (subOut.length) {
      // Sora/Luna often take a single URL or JSON string
      try {
        subtitles = JSON.stringify(subOut);
      } catch (e) {
        subtitles = subOut[0].url;
      }
    }

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: subtitles,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
