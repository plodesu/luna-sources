/**
 * RapPhim (rapphim.vip) – Sora / Luna
 * API: https://api.rapphim.vip/api
 * Streams: /upload/signed-urls/{movieId}/{epIndex}
 * Subs: prefer VI on s1.cloud152.stream
 * v1.0.2
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
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** s2 direct /movies/ paths 400 – rewrite to s1 */
function fixCdn(u) {
  u = forceHttps(u);
  if (!u) return u;
  // broken: s2.cloud152.stream/movies/...
  u = u.replace(
    /https?:\/\/s2\.cloud152\.stream\/movies\//i,
    "https://s1.cloud152.stream/movies/"
  );
  return u;
}

function queryVariants(keyword) {
  const raw = String(keyword || "").trim();
  const out = [];
  const push = function (v) {
    v = String(v || "").trim();
    if (v && out.indexOf(v) < 0) out.push(v);
  };
  push(raw);
  let c = raw
    .replace(/\((?:Ss?|Season)\s*\d+\)/gi, " ")
    .replace(/\b(?:Ss?|Season)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  push(c);
  push(c.split(":")[0]);
  push(c.split(" - ")[0]);
  const words = c.match(/[A-Za-z0-9\u00C0-\u024F]+/g) || [];
  if (words.length >= 2) push(words.slice(0, 2).join(" "));
  if (words.length >= 3) push(words.slice(0, 3).join(" "));
  if (words.length) push(words[0]);
  return out.slice(0, 6);
}

function scoreTitle(query, title, slug) {
  const q = norm(query);
  const t = norm(title);
  const s = norm(slug).replace(/-/g, " ");
  if (!q) return 0;
  if (t === q || s === q) return 100;
  if (t.indexOf(q) >= 0 || s.indexOf(q) >= 0) return 80;
  const qw = q.split(" ").filter(Boolean);
  let hit = 0;
  for (let i = 0; i < qw.length; i++) {
    if (qw[i].length < 2) continue;
    if (t.indexOf(qw[i]) >= 0 || s.indexOf(qw[i]) >= 0) hit++;
  }
  if (!qw.length) return 0;
  return Math.round((hit / qw.length) * 70);
}

function parseHref(url) {
  const s = String(url || "");
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
  return { slug: "", episode: 0, type: "unknown" };
}

function seriesHref(slug, isAnime) {
  return isAnime
    ? baseUrl + "/anime/" + slug
    : baseUrl + "/phim/" + slug;
}
function watchHref(slug, ep, isAnime) {
  return isAnime
    ? baseUrl + "/anime/" + slug + "/xem/tap-" + ep
    : baseUrl + "/phim/" + slug + "/xem";
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
  return await getJson(await soraFetch(apiBase + path));
}

/** Scrape anime hub pages (API search misses English titles) */
async function searchFromAnimePages(keyword) {
  const results = [];
  const seen = {};
  const pages = [baseUrl + "/anime", baseUrl + "/anime/danh-sach"];
  const qn = norm(keyword);
  const tokens = qn.split(" ").filter(function (t) {
    return t.length > 2;
  });

  for (let p = 0; p < pages.length; p++) {
    try {
      const html = await getText(await soraFetch(pages[p]));
      if (!html) continue;

      // slug from any /anime/{slug} link
      const reLink = /href="\/anime\/([a-z0-9-]+)"/gi;
      let m;
      const slugSet = {};
      while ((m = reLink.exec(html))) {
        const slug = m[1];
        if (slug === "danh-sach" || slug === "lich-chieu") continue;
        slugSet[slug] = true;
      }

      const slugs = Object.keys(slugSet);
      for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i];
        if (seen[slug]) continue;
        // title from alt near this slug
        let title = slug;
        const reAlt = new RegExp(
          'href="/anime/' +
            slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            '"[\\s\\S]{0,600}?alt="([^"]*)"',
          "i"
        );
        const am = html.match(reAlt);
        if (am && am[1]) title = am[1];

        // also match italic english name near slug
        let eng = "";
        const idx = html.indexOf("/anime/" + slug);
        if (idx >= 0) {
          const chunk = html.substr(idx, 900);
          const em = chunk.match(
            /italic[^>]*>([^<]{2,80})</i
          );
          if (em) eng = em[1];
        }

        const sc = Math.max(
          scoreTitle(keyword, title, slug),
          scoreTitle(keyword, eng, slug)
        );
        if (sc < 25) {
          // token hit on slug
          let th = 0;
          for (let t = 0; t < tokens.length; t++) {
            if (slug.indexOf(tokens[t]) >= 0 || norm(title).indexOf(tokens[t]) >= 0 || norm(eng).indexOf(tokens[t]) >= 0)
              th++;
          }
          if (tokens.length && th >= Math.ceil(tokens.length * 0.5)) {
            // ok
          } else if (sc < 20) continue;
        }

        seen[slug] = true;
        let image = "";
        if (idx >= 0) {
          const chunk = html.substr(idx, 1000);
          const im = chunk.match(/src="(https?:\/\/[^"]+)"/i);
          if (im) image = im[1];
        }
        results.push({
          title: title || eng || slug,
          image: absUrl(image),
          href: baseUrl + "/anime/" + slug,
          _score: sc || 30,
        });
      }
    } catch (e) {}
  }

  results.sort(function (a, b) {
    return (b._score || 0) - (a._score || 0);
  });
  for (let i = 0; i < results.length; i++) delete results[i]._score;
  return results;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const variants = queryVariants(cleaned);
    const results = [];
    const seen = {};

    // 1) API
    for (let v = 0; v < Math.min(variants.length, 4); v++) {
      try {
        const data = await apiGet(
          "/movies?q=" + encodeURIComponent(variants[v]) + "&limit=20"
        );
        let items = (data && data.data) || [];
        if (!Array.isArray(items)) items = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it || !it.slug || seen[it.slug]) continue;
          seen[it.slug] = true;
          const isAnime = !!(
            it.isAnime ||
            it.type === "series" ||
            it.anilistId
          );
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
            _score: scoreTitle(cleaned, title, it.slug),
          });
        }
      } catch (e) {}
    }

    // 2) autocomplete
    try {
      const ac = await apiGet(
        "/movies/search/autocomplete?q=" +
          encodeURIComponent(cleaned) +
          "&limit=15"
      );
      const sug = (ac && ac.data && ac.data.suggestions) || [];
      for (let i = 0; i < sug.length; i++) {
        const it = sug[i];
        if (!it || !it.slug || seen[it.slug]) continue;
        seen[it.slug] = true;
        results.push({
          title: String(it.title || it.slug).trim(),
          image: absUrl(it.posterUrl || ""),
          href: seriesHref(it.slug, it.type !== "movie"),
          _score: scoreTitle(cleaned, it.title, it.slug),
        });
      }
    } catch (e) {}

    // 3) Anime pages (Mushoku, Bleach TYBW, etc.)
    try {
      const pageHits = await searchFromAnimePages(cleaned);
      for (let i = 0; i < pageHits.length; i++) {
        const it = pageHits[i];
        const slug = parseHref(it.href).slug;
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        results.push(it);
      }
    } catch (e) {}

    results.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
    for (let i = 0; i < results.length; i++) delete results[i]._score;

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
    const aliases = d.englishName || d.originalTitle || d.title || "N/A";
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

    if (!eps.length) {
      eps.push({
        href: watchHref(p.slug, 1, isAnime),
        number: 1,
        season: 1,
        episode: 1,
        title: d.type === "movie" ? "Full Movie" : "Tập 1",
      });
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
    if (!d || !d._id)
      return JSON.stringify({ streams: [], subtitles: "" });

    const epsRaw = d.episodes || [];
    const want = p.episode || 1;

    // find episode + 0-based index for signed-urls API
    let ep = null;
    let epIndex = 0;
    for (let i = 0; i < epsRaw.length; i++) {
      const n = parseInt(epsRaw[i].episodeNumber, 10) || i + 1;
      if (n === want) {
        ep = epsRaw[i];
        epIndex = i;
        break;
      }
    }
    if (!ep && epsRaw.length) {
      ep = epsRaw[0];
      epIndex = 0;
    }

    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: baseUrl + "/",
      Origin: baseUrl,
    };

    // Prefer signed URLs (fresh)
    let sources = [];
    let signedSubs = [];
    try {
      const signed = await apiGet(
        "/upload/signed-urls/" + d._id + "/" + epIndex
      );
      if (signed && signed.success && signed.data) {
        sources = signed.data.sources || [];
        signedSubs = signed.data.subtitles || [];
      }
    } catch (e) {}

    // Fallback: raw episode sources
    if (!sources.length && ep) sources = ep.sources || [];
    if (!signedSubs.length && ep) signedSubs = ep.subtitles || [];

    sources = sources.slice();
    sources.sort(function (a, b) {
      return serverRank(a.serverName) - serverRank(b.serverName);
    });

    const streams = [];
    const seen = {};
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      let media = fixCdn(s.signedUrl || s.url || "");
      if (!isHttp(media) || seen[media]) continue;
      if (
        media.indexOf("m3u8") < 0 &&
        !/\.mp4(\?|$)/i.test(media) &&
        s.type !== "hls" &&
        s.type !== "m3u8_proxy" &&
        s.type !== "mp4" &&
        media.indexOf("cloud152.stream") < 0
      ) {
        continue;
      }
      seen[media] = true;
      const name = s.serverName || "Server " + (i + 1);
      streams.push({
        title: name,
        streamUrl: media,
        headers: headers,
      });
    }

    // Vietnamese subtitles first
    const subOut = [];
    const subSeen = {};
    for (let i = 0; i < signedSubs.length; i++) {
      const sub = signedSubs[i];
      let su = fixCdn(sub.signedUrl || sub.url || "");
      if (!isHttp(su) || subSeen[su]) continue;
      subSeen[su] = true;
      const lang = String(sub.language || sub.label || "und");
      subOut.push({
        url: su,
        language: lang,
        label: sub.label || lang,
      });
    }
    // VI first, then others
    subOut.sort(function (a, b) {
      const av = /^(vi|vie)/i.test(a.language) || /việt|tiếng việt/i.test(a.label) ? 0 : 1;
      const bv = /^(vi|vie)/i.test(b.language) || /việt|tiếng việt/i.test(b.label) ? 0 : 1;
      return av - bv;
    });

    let subtitles = "";
    if (subOut.length) {
      // Prefer single VI URL string (most compatible) + full list
      const vi = subOut.filter(function (s) {
        return (
          /^(vi|vie)/i.test(s.language) ||
          /việt|tiếng việt/i.test(s.label || "")
        );
      });
      const primary = (vi[0] || subOut[0]).url;
      try {
        // Array form for apps that support multi-track
        subtitles = JSON.stringify(
          subOut.map(function (s) {
            return {
              url: s.url,
              language: s.language,
              headers: headers,
            };
          })
        );
      } catch (e) {
        subtitles = primary;
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
