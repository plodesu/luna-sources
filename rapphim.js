/**
 * RapPhim (rapphim.vip) – Sora / Luna
 * API: https://api.rapphim.vip/api
 * Search: anime only (filter movies)
 * Streams: /upload/signed-urls/{movieId}/{epIndex}
 * Subs: VI on s1.cloud152.stream
 * v1.0.4
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
    .replace(/\((?:Ss?|Season)\s*\d+\)/gi, " ")
    .replace(/\b(?:Ss?|Season)\s*\d+\b/gi, " ")
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
function fixCdn(u) {
  u = forceHttps(u);
  if (!u) return u;
  return u.replace(
    /https?:\/\/s2\.cloud152\.stream\/movies\//i,
    "https://s1.cloud152.stream/movies/"
  );
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

function seriesHref(slug) {
  return baseUrl + "/anime/" + slug;
}
function watchHref(slug, ep) {
  return baseUrl + "/anime/" + slug + "/xem/tap-" + ep;
}

function serverRank(name) {
  const n = String(name || "").toLowerCase();
  if (n.indexOf("zeus") >= 0) return 0;
  if (n.indexOf("kaa") >= 0) return 1;
  if (n.indexOf("miruro") >= 0) return 2;
  if (n.indexOf("vietsub") >= 0) return 3;
  return 5;
}

function isAnimeItem(it) {
  if (!it) return false;
  if (it.isAnime === true) return true;
  if (it.anilistId || it.malId) return true;
  const type = String(it.type || "").toLowerCase();
  if (type === "series" || type === "anime" || type === "tv") return true;
  if (type === "movie" || type === "film") return false;
  const slug = String(it.slug || it.href || "").toLowerCase();
  if (slug.indexOf("/anime/") >= 0) return true;
  const cats = it.categories || it.genres || [];
  if (Array.isArray(cats)) {
    for (let i = 0; i < cats.length; i++) {
      const n = String(
        (cats[i] && (cats[i].name || cats[i].slug || cats[i])) || ""
      ).toLowerCase();
      if (n.indexOf("anime") >= 0 || n.indexOf("hoat-hinh") >= 0) return true;
    }
  }
  return false;
}

function scoreTitle(query, title, slug) {
  const q = norm(query);
  const t = norm(title);
  const s = norm(slug).replace(/-/g, " ");
  if (!q) return 0;
  if (t === q || s === q) return 100;
  if (t.indexOf(q) >= 0 || s.indexOf(q) >= 0) return 80;
  const qw = q.split(" ").filter(function (w) {
    return w.length > 2;
  });
  let hit = 0;
  for (let i = 0; i < qw.length; i++) {
    if (t.indexOf(qw[i]) >= 0 || s.indexOf(qw[i]) >= 0) hit++;
  }
  if (!qw.length) return 0;
  return Math.round((hit / qw.length) * 70);
}

async function apiGet(path) {
  return await getJson(await soraFetch(apiBase + path));
}

async function searchFromAnimePage(keyword) {
  const results = [];
  try {
    const html = await getText(await soraFetch(baseUrl + "/anime"));
    if (!html) return results;
    const reLink = /href="\/anime\/([a-z0-9-]+)"/gi;
    let m;
    const seenSlug = {};
    const slugs = [];
    while ((m = reLink.exec(html))) {
      const slug = m[1];
      if (slug === "danh-sach" || slug === "lich-chieu" || seenSlug[slug])
        continue;
      seenSlug[slug] = true;
      slugs.push(slug);
    }
    const tokens = norm(keyword)
      .split(" ")
      .filter(function (t) {
        return t.length > 2;
      });
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      let title = slug;
      const reAlt = new RegExp(
        'href="/anime/' +
          slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          '"[\\s\\S]{0,700}?alt="([^"]*)"',
        "i"
      );
      const am = html.match(reAlt);
      if (am && am[1]) title = am[1];
      let eng = "";
      const idx = html.indexOf("/anime/" + slug);
      if (idx >= 0) {
        const chunk = html.substr(idx, 1000);
        const em = chunk.match(/italic[^>]*>([^<]{2,90})</i);
        if (em) eng = em[1];
      }
      const sc = Math.max(
        scoreTitle(keyword, title, slug),
        scoreTitle(keyword, eng, slug)
      );
      let tokenHit = 0;
      for (let t = 0; t < tokens.length; t++) {
        if (
          slug.indexOf(tokens[t]) >= 0 ||
          norm(title).indexOf(tokens[t]) >= 0 ||
          norm(eng).indexOf(tokens[t]) >= 0
        )
          tokenHit++;
      }
      if (sc < 20 && !(tokens.length && tokenHit >= 1)) continue;
      let image = "";
      if (idx >= 0) {
        const im = html.substr(idx, 1100).match(/src="(https?:\/\/[^"]+)"/i);
        if (im) image = im[1];
      }
      results.push({
        title: title || eng || slug,
        image: absUrl(image),
        href: seriesHref(slug),
        _score: sc || 30 + tokenHit * 10,
      });
    }
  } catch (e) {}
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
    const results = [];
    const seen = {};

    const tries = [cleaned];
    const words = cleaned.match(/[A-Za-z0-9\u00C0-\u024F]+/g) || [];
    if (words.length >= 2) tries.push(words.slice(0, 2).join(" "));
    if (words.length) tries.push(words[0]);

    for (let v = 0; v < tries.length; v++) {
      try {
        const data = await apiGet(
          "/movies?q=" + encodeURIComponent(tries[v]) + "&limit=25"
        );
        let items = (data && data.data) || [];
        if (!Array.isArray(items)) items = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it || !it.slug || seen[it.slug]) continue;
          if (!isAnimeItem(it)) continue;
          seen[it.slug] = true;
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
            href: seriesHref(it.slug),
          });
        }
      } catch (e) {}
    }

    try {
      const ac = await apiGet(
        "/movies/search/autocomplete?q=" +
          encodeURIComponent(cleaned) +
          "&limit=20"
      );
      const sug = (ac && ac.data && ac.data.suggestions) || [];
      for (let i = 0; i < sug.length; i++) {
        const it = sug[i];
        if (!it || !it.slug || seen[it.slug]) continue;
        if (!isAnimeItem(it)) continue;
        seen[it.slug] = true;
        results.push({
          title: String(it.title || it.slug).trim(),
          image: absUrl(it.posterUrl || ""),
          href: seriesHref(it.slug),
        });
      }
    } catch (e) {}

    try {
      const pageHits = await searchFromAnimePage(cleaned);
      for (let i = 0; i < pageHits.length; i++) {
        const it = pageHits[i];
        const slug = parseHref(it.href).slug;
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        results.push({
          title: it.title,
          image: it.image || "",
          href: seriesHref(slug),
        });
      }
    } catch (e) {}

    return JSON.stringify(results.slice(0, 25));
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
    return JSON.stringify([
      {
        description: String(d.description || d.descriptionEn || "N/A").slice(
          0,
          900
        ),
        aliases: d.englishName || d.originalTitle || d.title || "N/A",
        airdate: String(d.releaseYear || d.releaseDate || "N/A"),
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
    const epsRaw = d.episodes || [];
    const eps = [];
    const seen = {};
    for (let i = 0; i < epsRaw.length; i++) {
      const e = epsRaw[i];
      if (!e) continue;
      const num = parseInt(e.episodeNumber, 10) || i + 1;
      if (seen[num]) continue;
      seen[num] = true;
      eps.push({
        href: watchHref(p.slug, num),
        number: num,
        title:
          e.title && String(e.title).trim()
            ? "Tập " + num + " · " + e.title
            : "Tập " + num,
      });
    }
    if (!eps.length) {
      eps.push({
        href: watchHref(p.slug, 1),
        number: 1,
        title: d.type === "movie" ? "Full Movie" : "Tập 1",
      });
    }
    eps.sort(function (a, b) {
      return a.number - b.number;
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
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const data = await apiGet("/movies/slug/" + encodeURIComponent(p.slug));
    const d = (data && data.data) || {};
    if (!d._id)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const epsRaw = d.episodes || [];
    const want = p.episode || 1;
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

    let sources = [];
    let subList = [];
    try {
      const signed = await apiGet(
        "/upload/signed-urls/" + d._id + "/" + epIndex
      );
      if (signed && signed.success && signed.data) {
        sources = signed.data.sources || [];
        subList = signed.data.subtitles || [];
      }
    } catch (e) {}
    if (!sources.length && ep) sources = ep.sources || [];
    if (!subList.length && ep) subList = ep.subtitles || [];

    sources = sources.slice().sort(function (a, b) {
      return serverRank(a.serverName) - serverRank(b.serverName);
    });

    const streams = [];
    const seen = {};
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const media = fixCdn(s.signedUrl || s.url || "");
      if (!isHttp(media) || seen[media]) continue;
      if (
        media.indexOf("m3u8") < 0 &&
        !/\.mp4(\?|$)/i.test(media) &&
        media.indexOf("cloud152.stream") < 0
      )
        continue;
      seen[media] = true;
      streams.push({
        title: s.serverName || "Server " + (i + 1),
        streamUrl: media,
        headers: headers,
      });
    }

    const pairs = [];
    let viUrl = "";
    for (let i = 0; i < subList.length; i++) {
      const sub = subList[i];
      const su = fixCdn(sub.signedUrl || sub.url || "");
      if (!isHttp(su)) continue;
      const lang = String(sub.language || "");
      const label = String(sub.label || lang || "und");
      const isVi =
        /^(vi|vie)/i.test(lang) || /việt|tiếng việt/i.test(label);
      pairs.push({
        url: su,
        language: isVi ? "vi" : lang || "und",
        label: label,
      });
      if (isVi && !viUrl) viUrl = su;
    }
    if (!viUrl && pairs.length) viUrl = pairs[0].url;

    for (let i = 0; i < streams.length; i++) {
      if (viUrl) streams[i].subtitle = viUrl;
    }

    const primary = streams.length ? streams[0].streamUrl : "";

    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 10),
      subtitle: viUrl || "",
      subtitles: viUrl || "",
      allSubtitles: pairs,
      subtitlesHeaders: headers,
      subtitleHeaders: headers,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
