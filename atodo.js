/**
 * ATodo (atodo.fun / MSX) – Sora / Luna
 * Movies + Series, Russian dubs (jator / xinu)
 * Qualities: 1080p / 720p / 480p
 * v1.1.0
 */
const apiBase = "https://api.atodo.fun";
const imageBase = "https://image.atodo.fun";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json,*/*",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      Referer: "http://atodo.fun/",
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

async function getJson(url) {
  try {
    const t = await getText(await soraFetch(url));
    if (!t || t.charAt(0) !== "{" && t.charAt(0) !== "[") return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function posterUrl(path) {
  if (!path) return "";
  if (isHttp(path)) return path;
  // TMDB-style path → ATodo image proxy
  return imageBase + "/small" + path;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * href format: https://api.atodo.fun/watch/movie/1315772
 *              https://api.atodo.fun/watch/tv/108978?s=1&e=1
 */
function parseHref(url) {
  const s = String(url || "");
  let type = "movie";
  let id = "";
  let m = s.match(/\/watch\/(movie|tv)\/(\d+)/i);
  if (m) {
    type = m[1].toLowerCase();
    id = m[2];
  } else {
    m = s.match(/atodo:\/\/(movie|tv)\/(\d+)/i);
    if (m) {
      type = m[1].toLowerCase();
      id = m[2];
    } else {
      m = s.match(/\/(movie|tv)\/(\d+)/i);
      if (m) {
        type = m[1].toLowerCase();
        id = m[2];
      }
    }
  }
  const se = s.match(/[?&#]s=(\d+)/i);
  const ee = s.match(/[?&#]e=(\d+)/i);
  return {
    type: type,
    id: id,
    season: se ? +se[1] : 1,
    episode: ee ? +ee[1] : 1,
  };
}

function makeHref(type, id, season, episode) {
  let h = apiBase + "/watch/" + type + "/" + id;
  if (type === "tv" && season && episode) {
    h += "?s=" + season + "&e=" + episode;
  }
  return h;
}

/** Pure base64 (ASCII JSON) – no btoa dependency */
function b64encode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return out;
}

function dataToParam(obj) {
  return encodeURIComponent(b64encode(JSON.stringify(obj)));
}

function heightToLabel(h) {
  h = +h || 0;
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  return "";
}

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (isHttp(u)) return u;
  if (u.charAt(0) === "/") {
    const m = String(base).match(/^(https?:\/\/[^/]+)/i);
    return (m ? m[1] : "") + u;
  }
  // ./720/index.m3u8 relative to master folder
  const dir = String(base).replace(/\/[^/]*$/, "/");
  return dir + u.replace(/^\.\//, "");
}

async function expandHls(masterUrl, labelPrefix) {
  const out = [];
  if (!isHttp(masterUrl)) return out;
  const hdr = {
    "User-Agent": UA,
    Accept: "application/vnd.apple.mpegurl,*/*",
    Referer: "http://atodo.fun/",
  };

  // Always offer Auto (master) first – most reliable audio/video
  out.push({
    title: labelPrefix + " · Auto",
    streamUrl: masterUrl,
    headers: hdr,
  });

  let text = "";
  try {
    text = await getText(await soraFetch(masterUrl, { headers: hdr }));
  } catch (e) {
    return out;
  }
  if (!text || text.indexOf("#EXT") !== 0) return out;

  const lines = text.split(/\r?\n/);
  const byQ = {};
  for (let i = 0; i < lines.length; i++) {
    if (!/^#EXT-X-STREAM-INF:/i.test(lines[i])) continue;
    const resM = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
    let next = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] && lines[j].charAt(0) !== "#") {
        next = lines[j].trim();
        break;
      }
    }
    if (!next) continue;
    const label = heightToLabel(resM ? +resM[1] : 0);
    if (!label) continue;
    const url = absUrl(next, masterUrl);
    if (!isHttp(url)) continue;
    byQ[label] = url;
  }
  ["1080p", "720p", "480p"].forEach(function (q) {
    if (!byQ[q]) return;
    out.push({
      title: labelPrefix + " · " + q,
      streamUrl: byQ[q],
      headers: hdr,
    });
  });
  return out;
}

async function resolveData(balancer, dataObj) {
  if (!dataObj) return "";
  try {
    const url =
      apiBase + "/api/source/" + balancer + "?data=" + dataToParam(dataObj);
    const json = await getJson(url);
    const master =
      json &&
      json.streams &&
      json.streams.video &&
      json.streams.video.hls &&
      json.streams.video.hls.master;
    return isHttp(master) ? master : "";
  } catch (e) {
    return "";
  }
}

async function fetchSource(balancer, type, id, kpId) {
  // jator prefers tmdb id; xinu prefers kinopoisk id
  let url = apiBase + "/api/source/" + balancer + "?type=" + type;
  if (balancer === "xinu" && kpId) {
    url += "&kinopoisk_id=" + encodeURIComponent(kpId);
  } else {
    url += "&id=" + encodeURIComponent(id);
  }
  const json = await getJson(url);
  if (!json || json.error) return null;
  return json;
}

function pickEpisodeData(tr, season, episode) {
  if (!tr) return null;
  // movie-style flat data
  if (tr.data) return tr.data;
  const seasons = tr.seasons || [];
  for (let i = 0; i < seasons.length; i++) {
    const s = seasons[i];
    const sid = +(s.season_id != null ? s.season_id : i + 1);
    if (sid !== season) continue;
    const eps = s.episodes || [];
    for (let j = 0; j < eps.length; j++) {
      const e = eps[j];
      const eid = +(e.episode_id != null ? e.episode_id : j + 1);
      if (eid !== episode) continue;
      return e.data || null;
    }
  }
  return null;
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const json = await getJson(
      apiBase + "/api/search?query=" + encodeURIComponent(cleaned)
    );
    const list = (json && json.results) || [];
    const results = [];
    const seen = {};

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      // skip people
      if (r.media_type === "person") continue;
      if (!r.media_type && !r.title && !r.name) continue;

      const media =
        r.media_type === "tv" || (r.name && !r.title) ? "tv" : "movie";
      const id = r.id;
      if (!id || seen[media + id]) continue;
      seen[media + id] = true;

      const ru = (r.title || r.name || "").replace(/\s+/g, " ").trim();
      const en = (r.original_title || r.original_name || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!ru && !en) continue;

      // Prefer Russian title; append original for matching
      let title = ru || en;
      if (en && ru && en.toLowerCase() !== ru.toLowerCase()) {
        title = ru + " / " + en;
      }
      if (media === "tv") title += " (сериал)";

      results.push({
        title: title,
        image: posterUrl(r.poster_path),
        href: makeHref(media, id),
      });
    }
    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    if (!p.id) {
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    }
    const json = await getJson(
      apiBase + "/api/details/" + p.type + "/" + p.id
    );
    const overview =
      (json && (json.overview || json.description)) || "N/A";
    const air =
      (json && (json.release_date || json.first_air_date)) || "N/A";
    const alias =
      (json && (json.original_title || json.original_name || json.title || json.name)) ||
      "N/A";
    return JSON.stringify([
      {
        description: String(overview).slice(0, 900),
        aliases: alias,
        airdate: air,
      },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    if (!p.id) {
      return JSON.stringify([
        { href: url, number: 1, season: 1, title: "Смотреть" },
      ]);
    }
    if (p.type === "movie") {
      return JSON.stringify([
        {
          href: makeHref("movie", p.id),
          number: 1,
          season: 1,
          title: "Смотреть",
        },
      ]);
    }

    // series: get season list from jator
    let src = await fetchSource("jator", "tv", p.id, null);
    if (!src || !src.translations || !src.translations.length) {
      // try xinu if we can get kp from details
      const det = await getJson(apiBase + "/api/details/tv/" + p.id);
      // fallback empty → single episode
      if (!src || !src.translations) {
        return JSON.stringify([
          {
            href: makeHref("tv", p.id, 1, 1),
            number: 1,
            season: 1,
            title: "S1E1",
          },
        ]);
      }
    }

    const eps = [];
    let tr = null;
    for (let i = 0; i < src.translations.length; i++) {
      if (src.translations[i].seasons && src.translations[i].seasons.length) {
        tr = src.translations[i];
        break;
      }
    }
    if (tr) {
      for (let s = 0; s < tr.seasons.length; s++) {
        const season = tr.seasons[s];
        const sid = +(season.season_id != null ? season.season_id : s + 1);
        const episodes = season.episodes || [];
        for (let e = 0; e < episodes.length; e++) {
          const ep = episodes[e];
          const eid = +(ep.episode_id != null ? ep.episode_id : e + 1);
          eps.push({
            href: makeHref("tv", p.id, sid, eid),
            number: eid,
            season: sid,
            title: "S" + sid + "E" + eid,
          });
        }
      }
    }
    if (!eps.length) {
      eps.push({
        href: makeHref("tv", p.id, 1, 1),
        number: 1,
        season: 1,
        title: "S1E1",
      });
    }
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url),
        number: 1,
        season: 1,
        title: "Смотреть",
      },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    if (!p.id) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const seen = {};

    function add(item) {
      if (!item || !isHttp(item.streamUrl)) return;
      const t = String(item.title || "").trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      streams.push({
        title: t,
        name: t,
        streamUrl: item.streamUrl,
        headers: item.headers || {
          "User-Agent": UA,
          Referer: "http://atodo.fun/",
        },
      });
    }

    // 1) jator with TMDB id
    let src = await fetchSource("jator", p.type, p.id, null);
    const kpId = src && src.kinopoisk_id ? String(src.kinopoisk_id) : "";

    async function consume(balancer, source) {
      if (!source || !source.translations) return;
      for (let i = 0; i < source.translations.length; i++) {
        const tr = source.translations[i];
        const voice = (tr.translation_name || "Озвучка").replace(/\s+/g, " ");
        const dataObj =
          p.type === "movie"
            ? tr.data || null
            : pickEpisodeData(tr, p.season, p.episode);
        if (!dataObj) continue;

        const master = await resolveData(balancer, dataObj);
        if (!master) continue;

        const label = balancer + " · " + voice;
        const quals = await expandHls(master, label);
        for (let q = 0; q < quals.length; q++) add(quals[q]);
      }
    }

    await consume("jator", src);

    // 2) xinu with kinopoisk id (more voices)
    if (kpId) {
      const src2 = await fetchSource("xinu", p.type, p.id, kpId);
      await consume("xinu", src2);
    }

    // sort Auto last, then 1080→720→480
    const rank = { "1080p": 4, "720p": 3, "480p": 2, Auto: 1 };
    streams.sort(function (a, b) {
      const qa = (a.title.match(/(1080|720|480)p|Auto/) || [])[0] || "";
      const qb = (b.title.match(/(1080|720|480)p|Auto/) || [])[0] || "";
      return (rank[qb] || 0) - (rank[qa] || 0);
    });

    return JSON.stringify({
      streams: streams.slice(0, 16),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
