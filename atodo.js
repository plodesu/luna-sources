/**
 * ATodo – Sora / Luna
 * Fast path: jator HLS masters (playable)
 * Fallback: xinu HTTPS (HDRezka when present)
 * v1.3.0
 */
const apiBase = "https://api.atodo.fun";
const tmdbImg = "https://image.tmdb.org/t/p/w500";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const streamHeaders = {
  "User-Agent": UA,
  Referer: "http://atodo.fun/",
  Origin: "http://atodo.fun",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json,*/*",
      "Accept-Language": "ru-RU,ru;q=0.9",
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
    if (!t) return null;
    const c = t.charAt(0);
    if (c !== "{" && c !== "[") return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function forceHttps(u) {
  if (!u) return "";
  return String(u).replace(/^http:\/\//i, "https://");
}

function posterUrl(path) {
  if (!path) return "";
  if (isHttp(path)) return path;
  return tmdbImg + path;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yearOf(r) {
  const d = r.release_date || r.first_air_date || "";
  const m = String(d).match(/^(\d{4})/);
  return m ? m[1] : "";
}

function parseHref(url) {
  const s = String(url || "");
  let type = "movie";
  let id = "";
  let m = s.match(/\/watch\/(movie|tv)\/(\d+)/i);
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
  if (type === "tv") h += "?s=" + (season || 1) + "&e=" + (episode || 1);
  return h;
}

function b64encode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = [];
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff);
  let out = "";
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

function isHdrezka(name) {
  return /hd\s*rezka|hdrezka/i.test(String(name || ""));
}

function niceVoice(name) {
  const n = String(name || "Озвучка").replace(/\s+/g, " ").trim();
  if (isHdrezka(n)) {
    if (/дубл/i.test(n)) return "HDRezka · Дубляж";
    if (/18\+/i.test(n)) return "HDRezka · 18+";
    return "HDRezka · Studio";
  }
  return n;
}

function pickEpisodeData(tr, season, episode) {
  if (!tr) return null;
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

async function resolvePlayable(balancer, dataObj) {
  if (!dataObj) return [];
  const url =
    apiBase + "/api/source/" + balancer + "?data=" + dataToParam(dataObj);
  const json = await getJson(url);
  if (!json || !json.streams || !json.streams.video) return [];
  const video = json.streams.video;
  const out = [];

  // Prefer HLS master (best for iOS AVPlayer)
  if (video.hls && video.hls.master && isHttp(video.hls.master)) {
    out.push({
      kind: "hls",
      url: forceHttps(video.hls.master),
    });
  }

  // HTTP progressive – only https + only 720/1080 (skip low junk)
  if (video.http && video.http.qualities) {
    const qs = video.http.qualities;
    ["1080", "720"].forEach(function (k) {
      if (qs[k] && isHttp(qs[k])) {
        out.push({ kind: "mp4", quality: k + "p", url: forceHttps(qs[k]) });
      }
    });
  }
  return out;
}

async function fetchSource(balancer, type, id, kpId) {
  let url = apiBase + "/api/source/" + balancer + "?type=" + type;
  if (kpId) url += "&kinopoisk_id=" + encodeURIComponent(kpId);
  else url += "&id=" + encodeURIComponent(id);
  const json = await getJson(url);
  if (!json || json.error) return null;
  return json;
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
      if (r.media_type === "person") continue;
      const media =
        r.media_type === "tv" || (r.name && !r.title) ? "tv" : "movie";
      const id = r.id;
      if (!id || seen[media + ":" + id]) continue;
      seen[media + ":" + id] = true;
      const ru = (r.title || r.name || "").replace(/\s+/g, " ").trim();
      const en = (r.original_title || r.original_name || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!ru && !en) continue;
      const year = yearOf(r);
      let title = ru || en;
      if (en && ru && en.toLowerCase() !== ru.toLowerCase()) {
        title = ru + " / " + en;
      }
      if (year) title += " (" + year + ")";
      if (media === "tv") title += " [сериал]";
      results.push({
        title: title,
        image: posterUrl(r.poster_path),
        href: makeHref(media, id, media === "tv" ? 1 : 0, media === "tv" ? 1 : 0),
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
    return JSON.stringify([
      {
        description: String(
          (json && (json.overview || json.description)) || "N/A"
        ).slice(0, 900),
        aliases:
          (json &&
            (json.original_title ||
              json.original_name ||
              json.title ||
              json.name)) ||
          "N/A",
        airdate:
          (json && (json.release_date || json.first_air_date)) || "N/A",
        image: posterUrl(json && json.poster_path),
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

    // One request only
    let src = await fetchSource("jator", "tv", p.id, null);
    if (!src || !src.translations) {
      const det = await getJson(apiBase + "/api/details/tv/" + p.id);
      const kp = det && det.kinopoisk_id ? String(det.kinopoisk_id) : "";
      if (kp) src = await fetchSource("xinu", "tv", p.id, kp);
    }

    const eps = [];
    if (src && src.translations) {
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
      { href: String(url), number: 1, season: 1, title: "Смотреть" },
    ]);
  }
}

/**
 * FAST extractStreamUrl
 * 1) jator with TMDB id (HLS masters – usually play)
 * 2) if empty → details for KP + xinu (HDRezka / OK CDN https)
 * Max ~2–4 network hops, max 8 stream rows
 */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    if (!p.id) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const seen = {};

    function push(title, streamUrl) {
      streamUrl = forceHttps(streamUrl);
      if (!isHttp(streamUrl)) return;
      if (seen[title] || seen[streamUrl]) return;
      seen[title] = true;
      seen[streamUrl] = true;
      streams.push({
        title: title,
        name: title,
        streamUrl: streamUrl,
        headers: streamHeaders,
      });
    }

    async function consume(balancer, src) {
      if (!src || !src.translations) return;
      // HDRezka first, then others; max 4 voices
      const trs = src.translations.slice().sort(function (a, b) {
        return (isHdrezka(a.translation_name) ? 0 : 1) -
          (isHdrezka(b.translation_name) ? 0 : 1);
      });
      const limit = Math.min(trs.length, 4);
      for (let i = 0; i < limit; i++) {
        const tr = trs[i];
        const voice = niceVoice(tr.translation_name);
        const dataObj =
          p.type === "movie"
            ? tr.data || null
            : pickEpisodeData(tr, p.season, p.episode);
        if (!dataObj) continue;

        const playable = await resolvePlayable(balancer, dataObj);
        for (let j = 0; j < playable.length; j++) {
          const item = playable[j];
          if (item.kind === "hls") {
            // Master only – AVPlayer picks quality, most reliable
            push(voice, item.url);
          } else if (item.kind === "mp4") {
            push(voice + " · " + item.quality, item.url);
          }
        }
        if (streams.length >= 8) return;
      }
    }

    // --- fast path: jator ---
    const jator = await fetchSource("jator", p.type, p.id, null);
    await consume("jator", jator);

    // --- fallback / HDRezka: xinu with kinopoisk ---
    if (streams.length < 2) {
      let kp = jator && jator.kinopoisk_id ? String(jator.kinopoisk_id) : "";
      if (!kp) {
        const det = await getJson(
          apiBase + "/api/details/" + p.type + "/" + p.id
        );
        if (det && det.kinopoisk_id) kp = String(det.kinopoisk_id);
      }
      if (kp) {
        const xinu = await fetchSource("xinu", p.type, p.id, kp);
        await consume("xinu", xinu);
      }
    }

    return JSON.stringify({
      streams: streams.slice(0, 8),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
