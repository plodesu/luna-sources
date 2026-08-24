/**
 * Filmix – Sora / Luna (movies + series, Russian)
 * Mobile API guest + quality expand + site #2 fallback
 * v1.2.0
 */
const API_BASES = [
  "https://filmixapp.cyou/api/v2",
  "http://filmixapp.cyou/api/v2",
];
const SITE = "https://filmix.gg";
const DEVICE =
  "user_dev_apk=2.0.1&user_dev_id=&user_dev_name=Xiaomi&user_dev_os=11&user_dev_token=&user_dev_vendor=Xiaomi";
const MAX_Q = 720; // free tier safe max

const UA =
  "Mozilla/5.0 (Linux; Android 11; Xiaomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const GARBAGE = [
  "MTluMWlLQnI4OXVic2tTNXpU",
  "MjJ0QXhMdl9fYjNKeU5q",
  "bXlfdG9rZW5fZ2FyYmFnZQ",
  "ZmlsbWl4X2VuY19jaHVuaw",
  "cGxheWVyX2RhdGFfYmFzZTY",
];

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
      Referer: SITE + "/",
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
    return await fetch(url, { method, headers, body });
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
  if (!t || t.charAt(0) === "<") return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function fixUrl(u) {
  u = String(u || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  if (u.indexOf("//") === 0) u = "https:" + u;
  if (u.indexOf("http://") === 0) u = "https://" + u.slice(7);
  return u;
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

async function apiGet(path) {
  for (let i = 0; i < API_BASES.length; i++) {
    const url =
      API_BASES[i] + path + (path.indexOf("?") >= 0 ? "&" : "?") + DEVICE;
    try {
      const j = await getJson(
        await soraFetch(url, {
          headers: {
            Referer: "http://filmixapp.cyou/",
            Origin: "http://filmixapp.cyou",
          },
        })
      );
      if (j) return j;
    } catch (e) {}
  }
  return null;
}

/* ---- #2 decode (site player-data) ---- */

function decodeHash2(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw;
  if (s.indexOf("#2") === 0) s = s.slice(2);
  s = s.split(":<:").join("");
  for (let i = 0; i < GARBAGE.length; i++) {
    s = s.split(GARBAGE[i]).join("");
  }
  // also strip known split garbage halves if present
  try {
    const bin = atob(s);
    return bin;
  } catch (e) {
    try {
      // pad base64
      while (s.length % 4) s += "=";
      return atob(s);
    } catch (e2) {
      return "";
    }
  }
}

function movieQualityUrls(link, maxQ) {
  const out = [];
  if (!link) return out;
  const m = String(link).match(/(.+)\[([^\]]+)\](.*)/i);
  if (m) {
    const base = m[1];
    const rest = m[3] || "";
    const qs = m[2]
      .split(",")
      .map(function (x) {
        return parseInt(String(x).trim(), 10);
      })
      .filter(function (n) {
        return n && n <= maxQ;
      })
      .sort(function (a, b) {
        return b - a;
      });
    for (let i = 0; i < qs.length; i++) {
      out.push({ q: qs[i], url: fixUrl(base + qs[i] + rest) });
    }
    return out;
  }
  // already numeric _720.mp4 style
  const fixed = fixUrl(link);
  if (isHttp(fixed)) out.push({ q: maxQ, url: fixed });
  return out;
}

function seriesQualityUrls(link, maxQ) {
  const out = [];
  if (!link) return out;
  const qualities = [720, 480, 360].filter(function (q) {
    return q <= maxQ;
  });
  for (let i = 0; i < qualities.length; i++) {
    const q = qualities[i];
    let u = String(link);
    if (u.indexOf("%s") !== -1) {
      u = u.replace("%s.mp4", q + ".mp4").replace("%s", String(q));
    } else {
      // replace trailing _N.mp4
      u = u.replace(/_\d+\.mp4/i, "_" + q + ".mp4");
    }
    u = fixUrl(u);
    if (isHttp(u)) out.push({ q: q, url: u });
  }
  return out;
}

function voiceOk(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return true;
  // skip pure english/original if labeled
  if (
    (n.indexOf("eng") !== -1 ||
      n.indexOf("original") !== -1 ||
      n.indexOf("оригинал") !== -1) &&
    n.indexOf("рус") === -1 &&
    n.indexOf("rus") === -1 &&
    n.indexOf("дуб") === -1
  ) {
    return false;
  }
  return true;
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const data = await apiGet("/search?story=" + encodeURIComponent(q));
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.items)) list = data.items;
    else if (data && Array.isArray(data.results)) list = data.results;

    const out = [];
    const seen = {};

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const id = c.id || c.post_id;
      if (!id || seen[id]) continue;
      seen[id] = true;

      const title =
        c.title ||
        c.rus ||
        c.name ||
        c.original_title ||
        c.alt_name ||
        "Untitled";
      const year =
        c.year ||
        (c.alt_name && (c.alt_name.match(/(\d{4})/) || [])[1]) ||
        "";
      const poster =
        c.poster ||
        c.poster_url ||
        c.image ||
        (c.poster_path ? SITE + c.poster_path : "");

      out.push({
        title: year ? title + " (" + year + ")" : title,
        image: poster ? fixUrl(poster) : "",
        href: "post/" + id,
      });
      if (out.length >= 20) break;
    }

    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const id = (String(url).match(/post\/(\d+)/) || [])[1];
    if (!id) {
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    }
    const data = await apiGet("/post/" + id);
    const description =
      (data && (data.short_story || data.full_story || data.description)) ||
      "N/A";
    const airdate = (data && (data.date || data.year)) || "N/A";
    return JSON.stringify([
      {
        description: String(description)
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 900),
        aliases: "N/A",
        airdate: String(airdate),
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
    const id = (String(url).match(/post\/(\d+)/) || [])[1];
    if (!id) {
      return JSON.stringify([
        { href: String(url), number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const data = await apiGet("/post/" + id);
    const pl = data && data.player_links;
    if (!pl) {
      return JSON.stringify([
        { href: "post/" + id, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    // series playlist
    if (pl.playlist && Object.keys(pl.playlist).length) {
      const eps = [];
      const seen = {};
      for (const seasonKey in pl.playlist) {
        const voices = pl.playlist[seasonKey];
        for (const voice in voices) {
          const episodes = voices[voice];
          for (const epKey in episodes) {
            const file = episodes[epKey];
            const link = file && file.link ? String(file.link) : "";
            let sn = 0;
            let en = 0;
            const se = link.match(/s(\d+)e(\d+)/i);
            if (se) {
              sn = +se[1];
              en = +se[2];
            } else {
              sn = parseInt(seasonKey, 10) || 1;
              en = parseInt(epKey, 10) || 0;
            }
            if (!en) continue;
            const k = sn + "-" + en;
            if (seen[k]) continue;
            seen[k] = true;
            eps.push({
              href: "post/" + id + "?s=" + sn + "&e=" + en,
              number: en,
              season: sn,
              title: "S" + sn + "E" + en,
            });
          }
        }
      }
      eps.sort(function (a, b) {
        return a.season - b.season || a.number - b.number;
      });
      if (eps.length) return JSON.stringify(eps);
    }

    // movie
    return JSON.stringify([
      { href: "post/" + id, number: 1, season: 1, title: "Смотреть" },
    ]);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0],
        number: 1,
        season: 1,
        title: "Смотреть",
      },
    ]);
  }
}

/* ---- streams from player_links ---- */

function streamsFromPlayerLinks(pl, season, episode) {
  const streams = [];
  if (!pl) return streams;

  // movies
  if (pl.movie && (pl.movie.length > 0 || Object.keys(pl.movie).length)) {
    const arr = Array.isArray(pl.movie) ? pl.movie : Object.keys(pl.movie).map(function (k) { return pl.movie[k]; });
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || !item.link) continue;
      const voice = item.translation || item.voice || item.name || "Озвучка " + (i + 1);
      if (!voiceOk(voice)) continue;
      const quals = movieQualityUrls(item.link, MAX_Q);
      for (let j = 0; j < quals.length; j++) {
        streams.push({
          title: quals[j].q + "p · " + voice,
          streamUrl: quals[j].url,
          headers: { "User-Agent": UA, Referer: SITE + "/" },
        });
      }
    }
  }

  // series playlist
  if (pl.playlist && Object.keys(pl.playlist).length) {
    for (const seasonKey in pl.playlist) {
      const voices = pl.playlist[seasonKey];
      for (const voiceName in voices) {
        if (!voiceOk(voiceName)) continue;
        const episodes = voices[voiceName];
        for (const epKey in episodes) {
          const file = episodes[epKey];
          if (!file || !file.link) continue;
          const link = String(file.link);
          let sn = parseInt(seasonKey, 10) || 1;
          let en = parseInt(epKey, 10) || 0;
          const se = link.match(/s(\d+)e(\d+)/i);
          if (se) {
            sn = +se[1];
            en = +se[2];
          }
          if (season && +sn !== +season) continue;
          if (episode && +en !== +episode) continue;

          const quals = seriesQualityUrls(link, MAX_Q);
          // also use qualities array if present
          if (file.qualities && file.qualities.length && !quals.length) {
            const qs = file.qualities
              .map(function (x) {
                return parseInt(x, 10);
              })
              .filter(function (n) {
                return n && n <= MAX_Q;
              })
              .sort(function (a, b) {
                return b - a;
              });
            for (let qi = 0; qi < qs.length; qi++) {
              const u = link
                .replace("%s.mp4", qs[qi] + ".mp4")
                .replace("%s", String(qs[qi]));
              quals.push({ q: qs[qi], url: fixUrl(u) });
            }
          }
          for (let j = 0; j < quals.length; j++) {
            streams.push({
              title:
                "S" +
                sn +
                "E" +
                en +
                " · " +
                quals[j].q +
                "p · " +
                voiceName,
              streamUrl: quals[j].url,
              headers: { "User-Agent": UA, Referer: SITE + "/" },
            });
          }
        }
      }
    }
  }

  return streams;
}

/* ---- site player-data fallback ---- */

async function sitePlayerStreams(postId, season, episode) {
  const streams = [];
  try {
    // warm-up
    await soraFetch(SITE + "/play/" + postId, {
      headers: { Referer: SITE + "/" },
    });

    const body = "post_id=" + postId + "&showfull=true";
    const raw = await getText(
      await soraFetch(SITE + "/api/movies/player_data", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: SITE + "/play/" + postId,
          Origin: SITE,
        },
        body: body,
      })
    );
    if (!raw) return streams;

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      // maybe already object-like
    }

    // walk tree for #2 encoded or plain links
    function walk(node, voice) {
      if (!node) return;
      if (typeof node === "string") {
        if (node.indexOf("#2") === 0) {
          const dec = decodeHash2(node);
          if (dec && isHttp(dec)) {
            streams.push({
              title: (voice || "Filmix") + " · site",
              streamUrl: fixUrl(dec),
              headers: { "User-Agent": UA, Referer: SITE + "/" },
            });
          }
        } else if (isHttp(node) && /\.(mp4|m3u8)/i.test(node)) {
          streams.push({
            title: (voice || "Filmix") + " · site",
            streamUrl: fixUrl(node),
            headers: { "User-Agent": UA, Referer: SITE + "/" },
          });
        }
        return;
      }
      if (typeof node === "object") {
        if (node.link || node.file || node.src) {
          walk(node.link || node.file || node.src, voice || node.translation || node.name);
        }
        for (const k in node) {
          if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
          if (k === "link" || k === "file" || k === "src") continue;
          walk(node[k], voice);
        }
      }
    }

    if (data) walk(data, "");
    else if (raw.indexOf("#2") !== -1) {
      const parts = raw.match(/#2[A-Za-z0-9+/:=\-_:<>]+/g) || [];
      for (let i = 0; i < parts.length; i++) {
        const dec = decodeHash2(parts[i]);
        if (dec && isHttp(dec)) {
          streams.push({
            title: "Filmix · site " + (i + 1),
            streamUrl: fixUrl(dec),
            headers: { "User-Agent": UA, Referer: SITE + "/" },
          });
        }
      }
    }
  } catch (e) {}
  return streams;
}

async function extractStreamUrl(url) {
  try {
    const id = (String(url).match(/post\/(\d+)/) || [])[1];
    if (!id) return JSON.stringify({ streams: [], subtitles: "" });

    const se = parseSE(url);
    const season = se.season;
    const episode = se.episode;

    let streams = [];

    // 1) mobile API post
    const data = await apiGet("/post/" + id);
    if (data && data.player_links) {
      streams = streamsFromPlayerLinks(data.player_links, season, episode);
    }

    // 2) site fallback if empty
    if (!streams.length) {
      const siteStreams = await sitePlayerStreams(id, season, episode);
      streams = streams.concat(siteStreams);
    }

    // dedupe
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!streams[i].streamUrl || !isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 160);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 15), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
