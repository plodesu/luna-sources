/**
 * Filmix – Sora / Luna (movies + series)
 * v1.1.0 – fixed streams (API + site player_data + #2 decode)
 */
const apiBases = [
  "https://filmixapp.cyou/api/v2/",
  "http://filmixapp.cyou/api/v2/",
];
const siteMirrors = ["https://filmix.gg", "https://filmix.my", "https://filmix.biz"];

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 11; Redmi Note 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
};

const MAX_Q = 720;
const QUALITIES = [720, 480, 360];

// #2 garbage chunks (go-filmix)
const GARBAGE = [
  "MTluMWlLQnI4OXVic2tTNXpU",
  "Mm93S0RVb0d6c3VMTkV5aE54",
  "SURhQnQwOEM5V2Y3bFlyMGVI",
  "bE5qSTlWNVUxZ01uc3h0NFFy",
  "bzl3UHQwaWk0MkdXZVM3TDdB",
];

function deviceQuery() {
  // Lampa uses empty user_dev_id for free access
  return (
    "user_dev_apk=2.0.1&user_dev_id=&user_dev_name=Xiaomi&user_dev_os=11&user_dev_token=&user_dev_vendor=Xiaomi"
  );
}

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
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
  try {
    if (res && typeof res.json === "function") return await res.json();
    const t = await getText(res);
    if (!t) return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

async function apiGet(path, extraQuery) {
  const q = deviceQuery() + (extraQuery ? "&" + extraQuery : "");
  for (let i = 0; i < apiBases.length; i++) {
    const base = apiBases[i];
    const url = base + path + (path.indexOf("?") >= 0 ? "&" : "?") + q;
    try {
      const res = await soraFetch(url, {
        headers: {
          Referer: base,
          Origin: base.replace(/\/api\/v2\/?/, ""),
        },
      });
      const j = await getJson(res);
      if (j != null && typeof j === "object") return j;
    } catch (e) {}
  }
  return null;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/[Ss]\d+[Ee]\d+/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/Episode\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  const id = (String(url).match(/(?:^|[?&#/])id=(\d+)/i) ||
    String(url).match(/\/play\/(\d+)/) ||
    String(url).match(/[?&#]post_id=(\d+)/i) ||
    [])[1];
  return {
    season: s ? +s : null,
    episode: e ? +e : null,
    id: id || null,
  };
}

function absPoster(u) {
  if (!u) return "";
  u = String(u);
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return siteMirrors[0] + u;
  return u;
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

/** Lampa-style quality pick for movie links with [360,480,720] */
function movieQualityUrl(link, maxQ) {
  if (!link) return "";
  let file = String(link);
  const m = file.match(/\[([^\]]+)\]/);
  if (m) {
    const quals = m[1]
      .split(",")
      .map((x) => parseInt(String(x).trim(), 10))
      .filter((n) => n && n <= maxQ);
    if (quals.length) {
      const best = Math.max.apply(null, quals);
      // Lampa: replace [..] with quality number only
      file = file.replace(/\[[^\]]+\]/, String(best));
    } else {
      // strip brackets if nothing usable
      file = file.replace(/\[[^\]]+\]/, String(maxQ));
    }
  }
  return file;
}

/** Series: %s.mp4 → 720.mp4 */
function seriesQualityUrl(link, maxQ) {
  if (!link) return "";
  let file = String(link);
  if (file.indexOf("%s") !== -1) {
    file = file.replace("%s", String(maxQ));
  }
  file = file.replace(/_(\d+)\.mp4/i, "_" + maxQ + ".mp4");
  return file;
}

function expandQualities(url) {
  const out = [];
  if (!url) return out;
  for (let i = 0; i < QUALITIES.length; i++) {
    const q = QUALITIES[i];
    let u = String(url);
    u = u.replace(/%s/g, String(q));
    u = u.replace(/_(\d+)\.mp4/i, "_" + q + ".mp4");
    // if still has brackets
    if (/\[[^\]]+\]/.test(u)) u = movieQualityUrl(u, q);
    if (isHttp(u)) out.push({ q: q, url: u });
  }
  if (!out.length && isHttp(url)) out.push({ q: MAX_Q, url: url });
  return out;
}

function decodeHash2(enc) {
  if (!enc) return "";
  let s = String(enc).trim();
  if (s.indexOf("#2") === 0) s = s.substring(2);
  s = s.replace(/:<:/g, "").replace(/: <:/g, "");
  for (let i = 0; i < GARBAGE.length; i++) {
    const g = GARBAGE[i];
    if (s.indexOf(g) !== -1) {
      s = s.split(g).join("");
    } else {
      // split chunk fallback (prefix+suffix)
      const half = Math.floor(g.length / 2);
      const a = g.slice(0, half);
      const b = g.slice(half);
      if (s.indexOf(a) !== -1 && s.indexOf(b) !== -1) {
        s = s.split(a).join("").split(b).join("");
      }
    }
  }
  try {
    if (typeof atob !== "function") return "";
    const pad = s.length % 4;
    if (pad) s += "====".substring(0, 4 - pad);
    const bin = atob(s);
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(bin, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch (e) {
      return bin;
    }
  } catch (e) {
    return "";
  }
}

/** older filmix char-swap + base64 */
function decodeSwap(enc) {
  if (!enc) return "";
  let encoded = String(enc);
  const codec_a = [
    "l", "u", "T", "D", "Q", "H", "0", "3", "G", "1", "f", "M",
    "p", "U", "a", "I", "6", "k", "d", "s", "b", "W", "5", "e", "y", "=",
  ];
  const codec_b = [
    "w", "g", "i", "Z", "c", "R", "z", "v", "x", "n", "N", "2",
    "8", "J", "X", "t", "9", "V", "7", "4", "B", "m", "Y", "o", "L", "h",
  ];
  for (let i = 0; i < codec_a.length; i++) {
    const a = codec_a[i];
    const b = codec_b[i];
    encoded = encoded.split(a).join("___");
    encoded = encoded.split(b).join(a);
    encoded = encoded.split("___").join(b);
  }
  try {
    if (typeof atob !== "function") return "";
    const pad = encoded.length % 4;
    if (pad) encoded += "====".substring(0, 4 - pad);
    return atob(encoded);
  } catch (e) {
    return "";
  }
}

function decodeAny(enc) {
  if (!enc) return "";
  if (String(enc).indexOf("http") === 0) return String(enc);
  if (String(enc).indexOf("#2") === 0) {
    const d = decodeHash2(enc);
    if (d) return d;
  }
  const d2 = decodeSwap(enc);
  return d2 || "";
}

function flattenPlaylist(node, out) {
  out = out || [];
  if (!node) return out;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) flattenPlaylist(node[i], out);
    return out;
  }
  if (typeof node === "object") {
    if (node.file) out.push(node);
    if (node.playlist) flattenPlaylist(node.playlist, out);
    for (const k in node) {
      if (k === "file" || k === "playlist") continue;
      if (typeof node[k] === "object") flattenPlaylist(node[k], out);
    }
  }
  return out;
}

/* -------- site player_data fallback -------- */

async function sitePlayerStreams(postId, season, episode) {
  const streams = [];
  for (let m = 0; m < siteMirrors.length; m++) {
    const base = siteMirrors[m];
    try {
      // warm-up
      await soraFetch(base + "/play/" + postId, {
        headers: { Referer: base + "/" },
      });

      const body = "post_id=" + encodeURIComponent(String(postId));
      const res = await soraFetch(base + "/api/movies/player_data", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: base + "/play/" + postId,
          Origin: base,
        },
        body: body,
      });
      const j = await getJson(res);
      if (!j) continue;

      const flash =
        (j.message && j.message.translations && j.message.translations.flash) ||
        (j.translations && j.translations.flash) ||
        j.flash ||
        (j.message && j.message.video) ||
        null;

      // also try video map (go-filmix shape)
      const videoMap =
        flash ||
        (j.message && j.message.translations) ||
        j.video ||
        null;

      if (!videoMap || typeof videoMap !== "object") continue;

      for (const voice in videoMap) {
        if (!Object.prototype.hasOwnProperty.call(videoMap, voice)) continue;
        let enc = videoMap[voice];
        if (typeof enc !== "string") continue;
        let decoded = decodeAny(enc);
        if (!decoded) continue;

        // if .txt manifest
        if (/\.txt(\?|$)/i.test(decoded) || decoded.indexOf("/pl/") !== -1) {
          try {
            const txtRes = await soraFetch(decoded, {
              headers: { Referer: base + "/" },
            });
            let txt = await getText(txtRes);
            if (txt.indexOf("#2") === 0 || txt.indexOf("http") !== 0) {
              const d2 = decodeAny(txt.indexOf("#2") === 0 ? txt : "#2" + txt);
              if (d2) txt = d2;
            }
            let pl = null;
            try {
              pl = JSON.parse(txt);
            } catch (e) {
              const d3 = decodeAny(txt);
              if (d3) {
                try {
                  pl = JSON.parse(d3);
                } catch (e2) {}
              }
            }
            const items = flattenPlaylist(pl);
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              const sn = parseInt(it.season || it.s || 0, 10) || 0;
              const en = parseInt(
                it.serieId || it.episode || it.e || it.seria || 0,
                10
              ) || 0;
              // movie or matching ep
              if (season && episode && sn && en) {
                if (sn !== season || en !== episode) continue;
              }
              const file = String(it.file || "");
              const expanded = expandQualities(file);
              for (let k = 0; k < expanded.length; k++) {
                streams.push({
                  title:
                    (voice || "Filmix") +
                    (sn ? " S" + sn + "E" + en : "") +
                    " · " +
                    expanded[k].q +
                    "p",
                  streamUrl: expanded[k].url,
                  headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    Referer: base + "/",
                  },
                });
              }
            }
          } catch (e) {}
        } else if (isHttp(decoded)) {
          const expanded = expandQualities(decoded);
          for (let k = 0; k < expanded.length; k++) {
            streams.push({
              title: (voice || "Filmix") + " · " + expanded[k].q + "p",
              streamUrl: expanded[k].url,
              headers: {
                "User-Agent": defaultHeaders["User-Agent"],
                Referer: base + "/",
              },
            });
          }
        }
      }

      if (streams.length) return streams;
    } catch (e) {}
  }
  return streams;
}

/* -------- mobile API streams -------- */

function streamsFromPlayerLinks(pl, season, episode) {
  const streams = [];
  if (!pl) return streams;

  // movies
  if (pl.movie) {
    const arr = Array.isArray(pl.movie)
      ? pl.movie
      : Object.keys(pl.movie).map((k) => pl.movie[k]);
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || !item.link) continue;
      const voice = item.translation || item.quality || "Filmix";
      const baseUrl = movieQualityUrl(item.link, MAX_Q);
      const expanded = expandQualities(baseUrl);
      // also try raw Lampa replace
      if (isHttp(baseUrl)) {
        expanded.unshift({ q: MAX_Q, url: baseUrl });
      }
      for (let k = 0; k < expanded.length; k++) {
        streams.push({
          title: String(voice) + " · " + expanded[k].q + "p",
          streamUrl: expanded[k].url,
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: siteMirrors[0] + "/",
          },
        });
      }
    }
  }

  // series
  if (pl.playlist && typeof pl.playlist === "object") {
    for (const seasonKey in pl.playlist) {
      const seasonObj = pl.playlist[seasonKey];
      if (!seasonObj) continue;
      for (const voice in seasonObj) {
        const episodes = seasonObj[voice];
        if (!episodes) continue;
        for (const epKey in episodes) {
          const ep = episodes[epKey];
          if (!ep || !ep.link) continue;
          let sn = parseInt(seasonKey, 10) || 1;
          let en = parseInt(epKey, 10) || 1;
          const link = String(ep.link);
          const m = link.match(/s(\d+)e(\d+)/i);
          if (m) {
            sn = +m[1];
            en = +m[2];
          }
          if (season && episode && (sn !== season || en !== episode)) continue;

          let maxQ = MAX_Q;
          if (Array.isArray(ep.qualities) && ep.qualities.length) {
            const qs = ep.qualities
              .map((x) => parseInt(x, 10))
              .filter((n) => n && n <= MAX_Q);
            if (qs.length) maxQ = Math.max.apply(null, qs);
          }
          let file = seriesQualityUrl(link, maxQ);
          const expanded = expandQualities(file);
          for (let k = 0; k < expanded.length; k++) {
            streams.push({
              title:
                "S" +
                sn +
                "E" +
                en +
                " · " +
                String(voice) +
                " · " +
                expanded[k].q +
                "p",
              streamUrl: expanded[k].url,
              headers: {
                "User-Agent": defaultHeaders["User-Agent"],
                Referer: siteMirrors[0] + "/",
              },
            });
          }
        }
      }
    }
  }

  return streams;
}

/* ---- Luna API ---- */

async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);

    const j = await apiGet("search", "story=" + encodeURIComponent(q));
    if (!j) return JSON.stringify([]);

    const list = Array.isArray(j) ? j : j.list || j.data || [];
    const out = [];
    const seen = {};

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || !c.id) continue;
      const id = String(c.id);
      if (seen[id]) continue;
      seen[id] = true;

      const title =
        c.title || c.rus || c.name || c.original_title || c.alt_name || "ID " + id;
      let year = c.year || "";
      if (!year && c.alt_name) {
        const y = parseInt(String(c.alt_name).split("-").pop(), 10);
        if (y > 1900) year = y;
      }
      const poster =
        absPoster(c.poster) ||
        absPoster(c.poster_src) ||
        absPoster(c.img) ||
        "";

      out.push({
        title: year ? title + " (" + year + ")" : String(title),
        image: poster,
        href: siteMirrors[0] + "/play/" + id + "?id=" + id,
      });
    }
    return JSON.stringify(out.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const se = parseSE(url);
    const id = se.id;
    if (!id) {
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    }
    const post = await apiGet("post/" + id);
    let description = "N/A";
    if (post) {
      description =
        post.short_story || post.story || post.description || post.plot || "N/A";
      description = String(description)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
    }
    return JSON.stringify([
      {
        description: description || "N/A",
        aliases: (post && (post.original_title || post.alt_name)) || "N/A",
        airdate: (post && String(post.year || "")) || "N/A",
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
    const se = parseSE(url);
    const id = se.id;
    if (!id) {
      return JSON.stringify([
        { href: url, number: 1, season: 1, title: "S1E1" },
      ]);
    }

    const post = await apiGet("post/" + id);
    if (!post || !post.player_links) {
      return JSON.stringify([
        {
          href: siteMirrors[0] + "/play/" + id + "?id=" + id,
          number: 1,
          season: 1,
          title: "Смотреть",
        },
      ]);
    }

    const pl = post.player_links;
    const eps = [];
    const seen = {};

    if (pl.playlist && typeof pl.playlist === "object") {
      for (const seasonKey in pl.playlist) {
        const seasonObj = pl.playlist[seasonKey];
        if (!seasonObj) continue;
        for (const voice in seasonObj) {
          const episodes = seasonObj[voice];
          if (!episodes) continue;
          for (const epKey in episodes) {
            const ep = episodes[epKey];
            if (!ep) continue;
            let sn = parseInt(seasonKey, 10) || 1;
            let en = parseInt(epKey, 10) || 1;
            const link = String(ep.link || "");
            const m = link.match(/s(\d+)e(\d+)/i);
            if (m) {
              sn = +m[1];
              en = +m[2];
            }
            const key = sn + "-" + en;
            if (seen[key]) continue;
            seen[key] = true;
            eps.push({
              href:
                siteMirrors[0] +
                "/play/" +
                id +
                "?id=" +
                id +
                "&s=" +
                sn +
                "&e=" +
                en,
              number: en,
              season: sn,
              title: "S" + sn + "E" + en,
            });
          }
        }
      }
    }

    if (!eps.length) {
      return JSON.stringify([
        {
          href: siteMirrors[0] + "/play/" + id + "?id=" + id,
          number: 1,
          season: 1,
          title: "Смотреть",
        },
      ]);
    }

    eps.sort((a, b) => a.season - b.season || a.number - b.number);
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, season: 1, title: "S1E1" },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const se = parseSE(url);
    const id = se.id;
    if (!id) return JSON.stringify({ streams: [], subtitles: "" });

    const season = se.season || 1;
    const episode = se.episode || 1;

    let streams = [];

    // 1) mobile API
    const post = await apiGet("post/" + id);
    if (post && post.player_links) {
      streams = streamsFromPlayerLinks(post.player_links, season, episode);
      // if series params but only movie links, still allow
      if (!streams.length) {
        streams = streamsFromPlayerLinks(post.player_links, null, null);
      }
    }

    // 2) site player_data fallback
    if (!streams.length) {
      streams = await sitePlayerStreams(id, season, episode);
    }

    // dedupe
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!streams[i].streamUrl || !isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 140);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 15), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
