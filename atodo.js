/**
 * ATodo / MSX (atodo.fun) – Sora / Luna
 * API: http://api.atodo.fun
 * Russian dubs via balancers (jator / xinu / krud)
 * Qualities: 1080p / 720p / 480p
 * v1.0.0
 */
const apiBase = "http://api.atodo.fun";
const imageBase = "http://image.atodo.fun";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const BALANCERS = ["jator", "xinu", "krud"];

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json,text/html,*/*",
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
  return imageBase + "/small" + path;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHref(url) {
  // atodo://movie/1315772  or  atodo://tv/1396?s=1&e=1
  const m = String(url).match(/atodo:\/\/(movie|tv)\/(\d+)/i);
  const se = String(url).match(/[?&#]s=(\d+)/i);
  const ee = String(url).match(/[?&#]e=(\d+)/i);
  return {
    type: m ? m[1].toLowerCase() : "movie",
    id: m ? m[2] : "",
    season: se ? +se[1] : 1,
    episode: ee ? +ee[1] : 1,
  };
}

function b64utf8(obj) {
  const json = JSON.stringify(obj);
  try {
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(json)));
    }
  } catch (e) {}
  // fallback
  const bytes = [];
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) {
      bytes.push(192 | (c >> 6), 128 | (c & 63));
    } else {
      bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
  }
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
  return String(base).replace(/[^/]+$/, "") + u;
}

async function expandHls(masterUrl, labelPrefix, headers) {
  const out = [];
  if (!isHttp(masterUrl)) return out;
  const hdr = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/vnd.apple.mpegurl,*/*",
      Referer: "http://atodo.fun/",
    },
    headers || {}
  );
  let text = "";
  try {
    text = await getText(await soraFetch(masterUrl, { headers: hdr }));
  } catch (e) {
    return out;
  }
  if (!text || text.indexOf("#EXT") !== 0) {
    out.push({
      title: labelPrefix + " · Auto",
      streamUrl: masterUrl,
      headers: hdr,
    });
    return out;
  }
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
  if (!out.length) {
    out.push({
      title: labelPrefix + " · Auto",
      streamUrl: masterUrl,
      headers: hdr,
    });
  }
  return out;
}

async function resolveStream(balancer, dataObj) {
  try {
    const data = b64utf8(dataObj);
    const json = await getJson(
      apiBase + "/api/source/" + balancer + "?data=" + encodeURIComponent(data)
    );
    const master =
      json &&
      json.streams &&
      json.streams.video &&
      json.streams.video.hls &&
      json.streams.video.hls.master;
    return master || "";
  } catch (e) {
    return "";
  }
}

async function fetchSource(type, id, balancer) {
  // type: movie | tv  (API returns type "show" for series content)
  const apiType = type === "tv" ? "tv" : "movie";
  const json = await getJson(
    apiBase +
      "/api/source/" +
      balancer +
      "?id=" +
      encodeURIComponent(id) +
      "&type=" +
      apiType
  );
  return json;
}

/* ---------------- search ---------------- */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const json = await getJson(
      apiBase + "/api/search?query=" + encodeURIComponent(cleaned)
    );
    const results = [];
    const list = (json && json.results) || [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const media =
        r.media_type === "tv" || r.name
          ? "tv"
          : "movie";
      const id = r.id;
      if (!id) continue;
      const title = (r.title || r.name || "").replace(/\s+/g, " ").trim();
      if (!title) continue;
      results.push({
        title: title + (media === "tv" ? " (сериал)" : ""),
        image: posterUrl(r.poster_path),
        href: "atodo://" + media + "/" + id,
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
    return JSON.stringify([
      {
        description: String(overview).slice(0, 900),
        aliases: (json && (json.original_title || json.original_name)) || "N/A",
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
          href: "atodo://movie/" + p.id,
          number: 1,
          season: 1,
          title: "Смотреть",
        },
      ]);
    }

    // series – load first working balancer for season list
    let src = null;
    for (let i = 0; i < BALANCERS.length; i++) {
      src = await fetchSource("tv", p.id, BALANCERS[i]);
      if (src && src.translations && src.translations.length) break;
    }
    const eps = [];
    if (src && src.translations) {
      // use first translation that has seasons
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
          const sid = season.season_id || s + 1;
          const episodes = season.episodes || [];
          for (let e = 0; e < episodes.length; e++) {
            const ep = episodes[e];
            const eid = ep.episode_id || e + 1;
            eps.push({
              href:
                "atodo://tv/" +
                p.id +
                "?s=" +
                sid +
                "&e=" +
                eid,
              number: +eid,
              season: +sid,
              title: "S" + sid + "E" + eid,
            });
          }
        }
      }
    }
    if (!eps.length) {
      eps.push({
        href: "atodo://tv/" + p.id + "?s=1&e=1",
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

async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    if (!p.id) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const seen = {};

    function add(item) {
      if (!item || !isHttp(item.streamUrl)) return;
      const t = item.title;
      if (seen[t]) return;
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

    for (let b = 0; b < BALANCERS.length; b++) {
      const bal = BALANCERS[b];
      const src = await fetchSource(p.type, p.id, bal);
      if (!src || !src.translations || !src.translations.length) continue;

      for (let t = 0; t < src.translations.length; t++) {
        const tr = src.translations[t];
        const voice = tr.translation_name || "Озвучка";
        let dataObj = null;

        if (p.type === "movie") {
          dataObj = tr.data || null;
        } else if (tr.seasons) {
          for (let s = 0; s < tr.seasons.length; s++) {
            const season = tr.seasons[s];
            if (+(season.season_id || s + 1) !== p.season) continue;
            const episodes = season.episodes || [];
            for (let e = 0; e < episodes.length; e++) {
              const ep = episodes[e];
              if (+(ep.episode_id || e + 1) !== p.episode) continue;
              dataObj = ep.data || null;
              break;
            }
          }
        }

        if (!dataObj) continue;
        const master = await resolveStream(bal, dataObj);
        if (!master) continue;

        const label = bal + " · " + voice;
        const quals = await expandHls(master, label, {
          "User-Agent": UA,
          Referer: "http://atodo.fun/",
        });
        for (let q = 0; q < quals.length; q++) add(quals[q]);
      }

      if (streams.length >= 3) break; // enough qualities
    }

    // 1080 → 720 → 480
    const rank = { "1080p": 3, "720p": 2, "480p": 1, Auto: 0 };
    streams.sort(function (a, b) {
      const qa = (a.title.match(/(1080|720|480)p|Auto/) || [])[0] || "";
      const qb = (b.title.match(/(1080|720|480)p|Auto/) || [])[0] || "";
      return (rank[qb] || 0) - (rank[qa] || 0);
    });

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
