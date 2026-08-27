/**
 * Yêu Anime (yeuanime.buzz) – Sora / Luna
 * API: api.yeuanime.buzz
 * Search: GET /api/v1/search?keyword=
 * Detail: GET /api/v1/movie/{slug}
 * Episodes: GET /api/v1/episode/{slug}
 * Stream: GET /api/v1/episode/{slug}/{tap}/vietsub → video.link_m3u8
 * v1.0.0
 */
const baseUrl = "https://yeuanime.buzz";
const apiBase = "https://api.yeuanime.buzz";
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
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
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

function parseWatchHref(url) {
  const s = String(url || "");
  // /xem-phim/{slug}/{tap-n}/{lang}?server=
  let m = s.match(
    /\/xem-phim\/([^/?#]+)\/(tap-\d+|full)\/(vietsub|engsub|thuyetminh)(?:\?[^#]*)?/i
  );
  if (m)
    return {
      type: "watch",
      slug: m[1],
      episodeSlug: m[2],
      lang: m[3].toLowerCase(),
    };
  m = s.match(/\/phim\/([^/?#]+)/i);
  if (m) return { type: "series", slug: m[1], episodeSlug: "", lang: "vietsub" };
  return { type: "unknown", slug: "", episodeSlug: "", lang: "vietsub" };
}

function epNumberFromSlug(epSlug) {
  const m = String(epSlug || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const data = await getJson(
      await soraFetch(
        apiBase +
          "/api/v1/search?keyword=" +
          encodeURIComponent(cleaned) +
          "&limit=30",
        { headers: { Accept: "application/json", Referer: baseUrl + "/" } }
      )
    );
    const items =
      (data && data.data && data.data.items) ||
      (data && data.items) ||
      [];
    const results = [];
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || !item.slug) continue;
      const href = baseUrl + "/phim/" + item.slug;
      if (seen[href]) continue;
      seen[href] = true;
      const title = decodeEntities(
        item.name || item.origin_name || item.slug
      )
        .replace(/\s+/g, " ")
        .trim();
      let image = item.poster_url || item.thumb_url || "";
      results.push({
        title: title,
        image: forceHttps(image),
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
    const p = parseWatchHref(url);
    const slug = p.slug;
    if (!slug)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    const data = await getJson(
      await soraFetch(apiBase + "/api/v1/movie/" + encodeURIComponent(slug), {
        headers: { Accept: "application/json", Referer: baseUrl + "/" },
      })
    );
    const m = (data && data.data) || {};
    let description = decodeEntities(m.description || "N/A")
      .replace(/<[^>]+>/g, "")
      .slice(0, 900);
    if (!description) description = "N/A";
    const aliases = decodeEntities(m.origin_name || m.name || "N/A");
    const airdate = m.year ? String(m.year) : "N/A";
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
async function extractEpisodes(url) {
  try {
    const p = parseWatchHref(url);
    const slug = p.slug;
    if (!slug) return JSON.stringify([]);

    // Prefer Vietsub list (more complete on this site)
    const data = await getJson(
      await soraFetch(
        apiBase + "/api/v1/episode/" + encodeURIComponent(slug),
        { headers: { Accept: "application/json", Referer: baseUrl + "/" } }
      )
    );
    const d = (data && data.data) || {};
    const list = d.episodes || [];
    const sources = d.available_sources || [];

    // Prefer vietsub server for href language
    let lang = "vietsub";
    for (let i = 0; i < sources.length; i++) {
      if (String(sources[i].language_slug || "").toLowerCase() === "vietsub") {
        lang = "vietsub";
        break;
      }
    }
    if (
      !sources.some(function (s) {
        return String(s.language_slug || "").toLowerCase() === "vietsub";
      }) &&
      sources[0]
    ) {
      lang = String(sources[0].language_slug || "vietsub").toLowerCase();
    }

    const eps = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.slug) continue;
      if (e.source_is_lock) continue;
      const num = epNumberFromSlug(e.slug);
      if (seen[num]) continue;
      seen[num] = true;
      const href =
        baseUrl +
        "/xem-phim/" +
        slug +
        "/" +
        e.slug +
        "/" +
        lang;
      eps.push({
        href: href,
        number: num,
        title: decodeEntities(e.episode_label || "Tập " + num),
      });
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    // Single episode fallback
    if (!eps.length && p.episodeSlug) {
      eps.push({
        href: String(url),
        number: epNumberFromSlug(p.episodeSlug),
        title: "Tập " + epNumberFromSlug(p.episodeSlug),
      });
    }

    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    let p = parseWatchHref(url);
    if (p.type === "series" && p.slug) {
      // first episode
      const listData = await getJson(
        await soraFetch(
          apiBase + "/api/v1/episode/" + encodeURIComponent(p.slug),
          { headers: { Accept: "application/json", Referer: baseUrl + "/" } }
        )
      );
      const eps = ((listData && listData.data) || {}).episodes || [];
      if (!eps.length) return JSON.stringify({ streams: [], subtitles: "" });
      p = {
        type: "watch",
        slug: p.slug,
        episodeSlug: eps[0].slug,
        lang: "vietsub",
      };
    }
    if (!p.slug || !p.episodeSlug)
      return JSON.stringify({ streams: [], subtitles: "" });

    // Discover available sources for this episode
    const meta = await getJson(
      await soraFetch(
        apiBase +
          "/api/v1/episode/" +
          encodeURIComponent(p.slug) +
          "/" +
          encodeURIComponent(p.episodeSlug) +
          "/" +
          encodeURIComponent(p.lang || "vietsub"),
        { headers: { Accept: "application/json", Referer: baseUrl + "/" } }
      )
    );
    const md = (meta && meta.data) || {};
    let sources = md.episode_sources || md.available_sources || [];
    if (!sources.length) {
      sources = [
        {
          server: { name: "KK Phim", slug: "KK" },
          language: { name: "Vietsub", slug: p.lang || "vietsub" },
        },
      ];
    }

    const streams = [];
    const seen = {};
    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: baseUrl + "/",
      Origin: baseUrl,
    };

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const server =
        (src.server && (src.server.slug || src.server.name)) ||
        src.server_slug ||
        "KK";
      const serverName =
        (src.server && src.server.name) || src.server_name || String(server);
      const lang =
        (src.language && src.language.slug) ||
        src.language_slug ||
        p.lang ||
        "vietsub";
      const langName =
        (src.language && src.language.name) ||
        src.language_name ||
        lang;

      if (src.is_lock || src.source_is_lock) continue;

      const apiUrl =
        apiBase +
        "/api/v1/episode/" +
        encodeURIComponent(p.slug) +
        "/" +
        encodeURIComponent(p.episodeSlug) +
        "/" +
        encodeURIComponent(lang) +
        "?server=" +
        encodeURIComponent(server);

      let body = null;
      try {
        body = await getJson(
          await soraFetch(apiUrl, {
            headers: { Accept: "application/json", Referer: baseUrl + "/" },
          })
        );
      } catch (e) {
        continue;
      }
      const video = ((body && body.data) || {}).video || {};
      let m3u8 = video.link_m3u8 || "";
      // sometimes only embed has ?url=
      if (!m3u8 && video.link_embed) {
        const mm = String(video.link_embed).match(/[?&]url=([^&]+)/i);
        if (mm) {
          try {
            m3u8 = decodeURIComponent(mm[1]);
          } catch (e2) {
            m3u8 = mm[1];
          }
        }
      }
      m3u8 = forceHttps(m3u8);
      if (!isHttp(m3u8) || m3u8.indexOf("m3u8") < 0) continue;
      if (seen[m3u8]) continue;
      seen[m3u8] = true;

      const title = serverName + " · " + langName;
      streams.push({
        title: title,
        streamUrl: m3u8,
        headers: headers,
      });
    }

    // Prefer Vietsub first
    streams.sort(function (a, b) {
      const av = /vietsub/i.test(a.title) ? 0 : 1;
      const bv = /vietsub/i.test(b.title) ? 0 : 1;
      return av - bv;
    });

    return JSON.stringify({
      streams: streams.slice(0, 8),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
