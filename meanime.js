/**
 * MeAnime (meanime.net) – Sora / Luna
 * Search:   GET /api/public/search?keyword=
 * Details:  GET /api/public/film/{slug}
 * Episodes: film.episodes[].server_data
 * Streams:  GET /api/public/playback?slug=&ep=&server=
 * v1.0.1
 */
const baseUrl = "https://www.meanime.net";
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

function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/phim\/([^/?#]+)\/xem\/(tap-\d+|full)(?:\?[^#]*)?/i);
  if (m) return { type: "watch", slug: m[1], episodeSlug: m[2] };
  m = s.match(/\/phim\/([^/?#]+)\/?/i);
  if (m) return { type: "series", slug: m[1], episodeSlug: "" };
  return { type: "unknown", slug: "", episodeSlug: "" };
}

function epNum(slug) {
  const m = String(slug || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function hostLabel(u) {
  try {
    const h = String(u)
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .toLowerCase();
    if (h.indexOf("phim1280") >= 0) return "Phim1280";
    if (h.indexOf("kkphim") >= 0) return "KKPhim";
    if (h.indexOf("opstream") >= 0) return "OPhim";
    if (h.indexOf("streamc") >= 0) return "StreamC";
    if (h.indexOf("phimapi") >= 0) return "PhimAPI";
    return h.split(".")[0] || "HLS";
  } catch (e) {
    return "HLS";
  }
}

function pushM3u8(streams, seen, m3u8, title, headers) {
  m3u8 = forceHttps(String(m3u8 || "").trim());
  if (!isHttp(m3u8)) return;
  if (m3u8.indexOf("m3u8") < 0 && !/\.mp4(\?|$)/i.test(m3u8)) return;
  if (seen[m3u8]) return;
  seen[m3u8] = true;
  streams.push({
    title: title || hostLabel(m3u8),
    streamUrl: m3u8,
    headers: headers,
  });
}

function extractFromEmbedList(embeds, streams, seen, serverName, headers) {
  if (!embeds || !embeds.length) return;
  for (let i = 0; i < embeds.length; i++) {
    const emb = String(embeds[i] || "");
    // player.phimapi.com/player/?url=https://...m3u8
    const mm = emb.match(/[?&]url=([^&]+)/i);
    if (mm) {
      let u = mm[1];
      try {
        u = decodeURIComponent(u);
      } catch (e) {}
      const title =
        (serverName ? serverName + " · " : "") + hostLabel(u);
      pushM3u8(streams, seen, u, title, headers);
    }
  }
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const data = await getJson(
      await soraFetch(
        baseUrl +
          "/api/public/search?keyword=" +
          encodeURIComponent(cleaned),
        { headers: { Accept: "application/json" } }
      )
    );
    const items = (data && data.items) || [];
    const results = [];
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || !item.slug) continue;
      const href = baseUrl + "/phim/" + item.slug;
      if (seen[href]) continue;
      seen[href] = true;
      const title = decodeEntities(item.name || item.original_name || item.slug)
        .replace(/\s+/g, " ")
        .trim();
      results.push({
        title: title,
        image: absUrl(item.poster_url || item.thumb_url || ""),
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
    if (!p.slug)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    const data = await getJson(
      await soraFetch(
        baseUrl + "/api/public/film/" + encodeURIComponent(p.slug),
        { headers: { Accept: "application/json" } }
      )
    );
    const f = (data && data.film) || {};
    let description = decodeEntities(f.description || "N/A")
      .replace(/<[^>]+>/g, "")
      .slice(0, 900);
    if (!description) description = "N/A";
    const aliases = decodeEntities(f.original_name || f.name || "N/A");
    let airdate = "N/A";
    const ym = String(f.time || "").match(/(20\d{2}|19\d{2})/);
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
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    if (!p.slug) return JSON.stringify([]);
    const data = await getJson(
      await soraFetch(
        baseUrl + "/api/public/film/" + encodeURIComponent(p.slug),
        { headers: { Accept: "application/json" } }
      )
    );
    const f = (data && data.film) || {};
    const servers = f.episodes || [];

    let list = [];
    for (let i = 0; i < servers.length; i++) {
      if (/vietsub/i.test(String(servers[i].server_name || ""))) {
        list = servers[i].server_data || [];
        break;
      }
    }
    if (!list.length && servers[0]) list = servers[0].server_data || [];

    const eps = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.slug) continue;
      const num = epNum(e.slug);
      if (seen[num]) continue;
      seen[num] = true;
      eps.push({
        href: baseUrl + "/phim/" + p.slug + "/xem/" + e.slug,
        number: num,
        title: "Tập " + (e.name || num),
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
    let p = parseHref(url);
    if (!p.slug) return JSON.stringify({ streams: [], subtitles: "" });

    const filmData = await getJson(
      await soraFetch(
        baseUrl + "/api/public/film/" + encodeURIComponent(p.slug),
        { headers: { Accept: "application/json" } }
      )
    );
    const film = (filmData && filmData.film) || {};
    const serverList = film.episodes || [];

    // Resolve first episode if series page
    if (!p.episodeSlug) {
      let list = [];
      for (let i = 0; i < serverList.length; i++) {
        if (/vietsub/i.test(String(serverList[i].server_name || ""))) {
          list = serverList[i].server_data || [];
          break;
        }
      }
      if (!list.length && serverList[0])
        list = serverList[0].server_data || [];
      if (!list.length)
        return JSON.stringify({ streams: [], subtitles: "" });
      p.episodeSlug = list[0].slug;
    }

    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: baseUrl + "/",
      Origin: baseUrl,
    };

    const streams = [];
    const seen = {};

    // 1) Playback WITHOUT server (often returns full hls list)
    const basePlay =
      baseUrl +
      "/api/public/playback?slug=" +
      encodeURIComponent(p.slug) +
      "&ep=" +
      encodeURIComponent(p.episodeSlug);

    let body = await getJson(
      await soraFetch(basePlay, { headers: { Accept: "application/json" } })
    );
    if (body && body.status !== "error") {
      const hls = body.hls || [];
      for (let i = 0; i < hls.length; i++) {
        pushM3u8(
          streams,
          seen,
          hls[i],
          hostLabel(hls[i]) + " · HLS",
          headers
        );
      }
      extractFromEmbedList(body.embed, streams, seen, "", headers);
    }

    // 2) Per-server (Vietsub / Lồng Tiếng …) — # must be encoded
    for (let s = 0; s < serverList.length; s++) {
      const serverName = String(serverList[s].server_name || "").trim();
      if (!serverName) continue;
      const api =
        basePlay + "&server=" + encodeURIComponent(serverName);
      let pb = null;
      try {
        pb = await getJson(
          await soraFetch(api, { headers: { Accept: "application/json" } })
        );
      } catch (e) {
        continue;
      }
      if (!pb || pb.status === "error") continue;
      const hls = pb.hls || [];
      for (let i = 0; i < hls.length; i++) {
        pushM3u8(
          streams,
          seen,
          hls[i],
          serverName + " · " + hostLabel(hls[i]),
          headers
        );
      }
      extractFromEmbedList(pb.embed, streams, seen, serverName, headers);
    }

    // Prefer Vietsub-labeled first
    streams.sort(function (a, b) {
      const av = /vietsub/i.test(a.title) ? 0 : 1;
      const bv = /vietsub/i.test(b.title) ? 0 : 1;
      if (av !== bv) return av - bv;
      const ap = /phim1280/i.test(a.title) ? 0 : 1;
      const bp = /phim1280/i.test(b.title) ? 0 : 1;
      return ap - bp;
    });

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
