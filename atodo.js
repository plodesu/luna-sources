/**
 * ATodo – Sora / Luna
 * Crash-safe / limited requests
 * v1.3.3
 */
const apiBase = "https://api.atodo.fun";
const tmdbImg = "https://image.tmdb.org/t/p/w500";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json,*/*",
      Referer: "http://atodo.fun/",
    },
    options.headers || {}
  );
  const method = options.method || "GET";
  const body = options.body || null;
  try {
    if (typeof fetch === "function") {
      const r = await fetch(url, { method: method, headers: headers, body: body });
      if (r) return r;
    }
  } catch (e) {}
  try {
    if (typeof fetchv2 === "function") {
      const r = await fetchv2(url, headers, method, body);
      if (r) return r;
    }
  } catch (e2) {}
  return null;
}

async function getText(res) {
  try {
    if (res == null) return "";
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
    if (!t || (t.charAt(0) !== "{" && t.charAt(0) !== "[")) return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function isHttp(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

function forceHttps(u) {
  try {
    return String(u || "").replace(/^http:\/\//i, "https://");
  } catch (e) {
    return "";
  }
}

function posterUrl(path) {
  try {
    if (!path) return "";
    if (isHttp(path)) return path;
    return tmdbImg + path;
  } catch (e) {
    return "";
  }
}

function cleanQuery(keyword) {
  try {
    return String(keyword || "")
      .replace(/&/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (e) {
    return "";
  }
}

function parseHref(url) {
  try {
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
  } catch (e) {
    return { type: "movie", id: "", season: 1, episode: 1 };
  }
}

function makeHref(type, id, season, episode) {
  let h = apiBase + "/watch/" + type + "/" + id;
  if (type === "tv") h += "?s=" + (season || 1) + "&e=" + (episode || 1);
  return h;
}

function b64encode(str) {
  try {
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
  } catch (e) {
    return "";
  }
}

function dataToParam(obj) {
  try {
    return encodeURIComponent(b64encode(JSON.stringify(obj)));
  } catch (e) {
    return "";
  }
}

function isHdrezka(name) {
  return /hdrezka|hd\s*rezka/i.test(String(name || ""));
}

function niceVoice(name) {
  const n = String(name || "Озвучка").replace(/\s+/g, " ").trim();
  if (isHdrezka(n)) {
    if (/дубл/i.test(n)) return "HDRezka · Дубляж";
    if (/18\+/i.test(n)) return "HDRezka · 18+";
    return "HDRezka · Studio";
  }
  return n || "Озвучка";
}

function heightToLabel(h) {
  h = +h || 0;
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  return "";
}

function absUrl(u, base) {
  try {
    if (!u) return "";
    u = String(u).replace(/&amp;/g, "&").trim();
    if (u.indexOf("//") === 0) return "https:" + u;
    if (isHttp(u)) return u;
    if (u.charAt(0) === "/") {
      const m = String(base).match(/^(https?:\/\/[^/]+)/i);
      return (m ? m[1] : "") + u;
    }
    return String(base).replace(/\/[^/]*$/, "/") + u.replace(/^\.\//, "");
  } catch (e) {
    return "";
  }
}

function pickEpisodeData(tr, season, episode) {
  try {
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
  } catch (e) {}
  return null;
}

async function fetchSource(balancer, type, id, kpId) {
  try {
    let url = apiBase + "/api/source/" + balancer + "?type=" + type;
    if (kpId) url += "&kinopoisk_id=" + encodeURIComponent(String(kpId));
    else url += "&id=" + encodeURIComponent(String(id));
    const json = await getJson(url);
    if (!json || json.error) return null;
    return json;
  } catch (e) {
    return null;
  }
}

/** Max 1 HLS master expand; only 1080/720/480 + Auto */
async function resolveQualities(balancer, dataObj, voiceLabel) {
  const out = [];
  try {
    if (!dataObj) return out;
    const param = dataToParam(dataObj);
    if (!param) return out;
    const json = await getJson(
      apiBase + "/api/source/" + balancer + "?data=" + param
    );
    if (!json || !json.streams || !json.streams.video) return out;
    const video = json.streams.video;

    if (video.hls && isHttp(video.hls.master)) {
      const master = forceHttps(video.hls.master);
      out.push({ title: voiceLabel + " · Auto", streamUrl: master });
      try {
        const text = await getText(
          await soraFetch(master, {
            headers: {
              "User-Agent": UA,
              Accept: "application/vnd.apple.mpegurl,*/*",
            },
          })
        );
        if (text && text.indexOf("#EXT") === 0) {
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
            const q = heightToLabel(resM ? +resM[1] : 0);
            if (!q) continue;
            const abs = forceHttps(absUrl(next, master));
            if (isHttp(abs)) byQ[q] = abs;
          }
          if (byQ["1080p"])
            out.push({ title: voiceLabel + " · 1080p", streamUrl: byQ["1080p"] });
          if (byQ["720p"])
            out.push({ title: voiceLabel + " · 720p", streamUrl: byQ["720p"] });
          if (byQ["480p"])
            out.push({ title: voiceLabel + " · 480p", streamUrl: byQ["480p"] });
        }
      } catch (e) {}
    }

    if (video.http && video.http.qualities) {
      const qs = video.http.qualities;
      if (isHttp(qs["1080"]))
        out.push({
          title: voiceLabel + " · 1080p",
          streamUrl: forceHttps(qs["1080"]),
        });
      if (isHttp(qs["720"]))
        out.push({
          title: voiceLabel + " · 720p",
          streamUrl: forceHttps(qs["720"]),
        });
      if (isHttp(qs["480"]))
        out.push({
          title: voiceLabel + " · 480p",
          streamUrl: forceHttps(qs["480"]),
        });
    }
  } catch (e) {}
  return out;
}

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return "[]";
    const json = await getJson(
      apiBase + "/api/search?query=" + encodeURIComponent(cleaned)
    );
    const list = (json && json.results) || [];
    const results = [];
    const seen = {};
    for (let i = 0; i < list.length && results.length < 20; i++) {
      try {
        const r = list[i];
        if (!r || r.media_type === "person") continue;
        const media =
          r.media_type === "tv" || (r.name && !r.title) ? "tv" : "movie";
        const id = r.id;
        if (!id || seen[media + ":" + id]) continue;
        seen[media + ":" + id] = true;
        const ru = String(r.title || r.name || "").replace(/\s+/g, " ").trim();
        const en = String(r.original_title || r.original_name || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!ru && !en) continue;
        let title = ru || en;
        if (en && ru && en.toLowerCase() !== ru.toLowerCase()) {
          title = ru + " / " + en;
        }
        const y = String(r.release_date || r.first_air_date || "").slice(0, 4);
        if (/^\d{4}$/.test(y)) title += " (" + y + ")";
        if (media === "tv") title += " [сериал]";
        results.push({
          title: title,
          image: posterUrl(r.poster_path),
          href: makeHref(media, id, media === "tv" ? 1 : 0, media === "tv" ? 1 : 0),
        });
      } catch (e) {}
    }
    return JSON.stringify(results);
  } catch (e) {
    return "[]";
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
        ).slice(0, 500),
        aliases: String(
          (json &&
            (json.original_title ||
              json.original_name ||
              json.title ||
              json.name)) ||
            "N/A"
        ),
        airdate: String(
          (json && (json.release_date || json.first_air_date)) || "N/A"
        ),
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
        { href: String(url), number: 1, season: 1, title: "Смотреть" },
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

    const src = await fetchSource("jator", "tv", p.id, null);
    const eps = [];
    if (src && src.translations && src.translations.length) {
      let tr = null;
      for (let i = 0; i < src.translations.length; i++) {
        if (
          src.translations[i] &&
          src.translations[i].seasons &&
          src.translations[i].seasons.length
        ) {
          tr = src.translations[i];
          break;
        }
      }
      if (tr) {
        for (let s = 0; s < tr.seasons.length; s++) {
          const season = tr.seasons[s];
          if (!season) continue;
          const sid = +(season.season_id != null ? season.season_id : s + 1);
          const episodes = season.episodes || [];
          for (let e = 0; e < episodes.length; e++) {
            const ep = episodes[e];
            if (!ep) continue;
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
    // Cap huge series (Naruto etc.) to avoid memory crash
    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, season: 1, title: "Смотреть" },
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
      try {
        if (!item || !isHttp(item.streamUrl)) return;
        const t = String(item.title || "").trim();
        const u = forceHttps(item.streamUrl);
        if (!t || !u || seen[t] || seen[u]) return;
        seen[t] = true;
        seen[u] = true;
        streams.push({ title: t, name: t, streamUrl: u });
      } catch (e) {}
    }

    // --- only jator, max 3 voices (avoids crash / timeout) ---
    const src = await fetchSource("jator", p.type, p.id, null);
    if (src && src.translations && src.translations.length) {
      const trs = src.translations.slice(0, 3);
      for (let i = 0; i < trs.length; i++) {
        try {
          const tr = trs[i];
          if (!tr) continue;
          const voice = niceVoice(tr.translation_name);
          const dataObj =
            p.type === "movie"
              ? tr.data || null
              : pickEpisodeData(tr, p.season, p.episode);
          if (!dataObj) continue;
          const items = await resolveQualities("jator", dataObj, voice);
          for (let j = 0; j < items.length; j++) add(items[j]);
          if (streams.length >= 12) break;
        } catch (e) {}
      }
    }

    // optional: one xinu HDRezka try if few results
    if (streams.length < 2) {
      try {
        let kp = src && src.kinopoisk_id ? String(src.kinopoisk_id) : "";
        if (!kp) {
          const det = await getJson(
            apiBase + "/api/details/" + p.type + "/" + p.id
          );
          if (det && det.kinopoisk_id) kp = String(det.kinopoisk_id);
        }
        if (kp) {
          const xinu = await fetchSource("xinu", p.type, p.id, kp);
          if (xinu && xinu.translations) {
            let picked = null;
            for (let i = 0; i < xinu.translations.length; i++) {
              if (isHdrezka(xinu.translations[i].translation_name)) {
                picked = xinu.translations[i];
                break;
              }
            }
            if (!picked) picked = xinu.translations[0];
            if (picked) {
              const voice = niceVoice(picked.translation_name);
              const dataObj =
                p.type === "movie"
                  ? picked.data || null
                  : pickEpisodeData(picked, p.season, p.episode);
              if (dataObj) {
                const items = await resolveQualities("xinu", dataObj, voice);
                for (let j = 0; j < items.length; j++) add(items[j]);
              }
            }
          }
        }
      } catch (e) {}
    }

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
