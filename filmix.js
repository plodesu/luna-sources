/**
 * Filmix – Sora / Luna (movies + series)
 * API: filmixapp.cyou/api/v2
 * v1.0.0
 */
const apiBases = [
  "http://filmixapp.cyou/api/v2/",
  "https://filmixapp.cyou/api/v2/",
];
const siteBase = "https://filmix.gg";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 11; Xiaomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ru-RU,ru;q=0.9",
};

// free tier ~720; pro would need token
const MAX_Q = 720;

function deviceParams() {
  // stable-ish random id for the session
  if (!deviceParams._id) {
    let s = "";
    const hex = "0123456789abcdef";
    for (let i = 0; i < 16; i++) s += hex[Math.floor(Math.random() * 16)];
    deviceParams._id = s;
  }
  return (
    "user_dev_apk=2.0.1&user_dev_id=" +
    deviceParams._id +
    "&user_dev_name=Xiaomi&user_dev_os=11&user_dev_token=&user_dev_vendor=Xiaomi"
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
    return JSON.parse(await getText(res));
  } catch (e) {
    return null;
  }
}

async function apiGet(path, extraQuery) {
  const q = deviceParams() + (extraQuery ? "&" + extraQuery : "");
  for (let i = 0; i < apiBases.length; i++) {
    const url = apiBases[i] + path + (path.indexOf("?") >= 0 ? "&" : "?") + q;
    try {
      const res = await soraFetch(url);
      const j = await getJson(res);
      if (j != null) return j;
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
  const id = (String(url).match(/(?:^|[?&#])id=(\d+)/i) || [])[1];
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
  if (u.charAt(0) === "/") return siteBase + u;
  return u;
}

function pickQualityUrl(link, maxQ) {
  if (!link) return "";
  maxQ = maxQ || MAX_Q;
  let file = String(link);

  // movie style: ...[360,480,720,1080]...
  const br = file.match(/\[([^\]]+)\]/);
  if (br) {
    const quals = br[1]
      .split(",")
      .map((x) => parseInt(String(x).trim(), 10))
      .filter((n) => n && n <= maxQ);
    if (quals.length) {
      const best = Math.max.apply(null, quals);
      file = file.replace(/\[[^\]]+\]/, String(best));
    }
  }

  // series style: %s.mp4
  if (file.indexOf("%s") !== -1) {
    file = file.replace("%s", String(maxQ));
  }

  // trailing _720.mp4 style
  file = file.replace(/_(\d+)\.mp4/i, "_" + maxQ + ".mp4");

  return file;
}

function isBadVoice(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.indexOf("eng") !== -1 ||
    n.indexOf("original") !== -1 ||
    n.indexOf("оригинал") !== -1 ||
    n.indexOf("укр") !== -1 ||
    n.indexOf("sub") !== -1 && n.indexOf("рус") === -1
  );
}

/* ---- API ---- */

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
        c.title ||
        c.rus ||
        c.name ||
        c.original_title ||
        c.alt_name ||
        "ID " + id;
      const year =
        c.year ||
        (c.alt_name && parseInt(String(c.alt_name).split("-").pop(), 10)) ||
        "";
      const poster =
        absPoster(c.poster) ||
        absPoster(c.poster_src) ||
        absPoster(c.img) ||
        "";

      out.push({
        title: year ? title + " (" + year + ")" : String(title),
        image: poster,
        href: siteBase + "/play/" + id + "?id=" + id,
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
    const id =
      se.id ||
      (String(url).match(/\/play\/(\d+)/) || [])[1] ||
      (String(url).match(/(\d{4,})/) || [])[1];
    if (!id)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);

    const post = await apiGet("post/" + id);
    let description = "N/A";
    if (post) {
      description =
        post.short_story ||
        post.story ||
        post.description ||
        post.plot ||
        "N/A";
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
    const id =
      se.id ||
      (String(url).match(/\/play\/(\d+)/) || [])[1] ||
      (String(url).match(/(\d{4,})/) || [])[1];
    if (!id) {
      return JSON.stringify([
        { href: url, number: 1, season: 1, title: "S1E1" },
      ]);
    }

    const post = await apiGet("post/" + id);
    if (!post || !post.player_links) {
      return JSON.stringify([
        {
          href: siteBase + "/play/" + id + "?id=" + id + "&s=1&e=1",
          number: 1,
          season: 1,
          title: "S1E1",
        },
      ]);
    }

    const pl = post.player_links;
    const eps = [];
    const seen = {};

    // series
    if (pl.playlist && typeof pl.playlist === "object") {
      for (const seasonKey in pl.playlist) {
        const seasonObj = pl.playlist[seasonKey];
        if (!seasonObj || typeof seasonObj !== "object") continue;
        for (const voice in seasonObj) {
          const episodes = seasonObj[voice];
          if (!episodes) continue;
          for (const epKey in episodes) {
            const ep = episodes[epKey];
            if (!ep) continue;
            let sn = parseInt(seasonKey, 10) || 1;
            let en = parseInt(epKey, 10) || 1;
            // parse from link if possible
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
                siteBase +
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
      // movie
      return JSON.stringify([
        {
          href: siteBase + "/play/" + id + "?id=" + id,
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
    const id =
      se.id ||
      (String(url).match(/\/play\/(\d+)/) || [])[1] ||
      (String(url).match(/(\d{4,})/) || [])[1];
    if (!id) return JSON.stringify({ streams: [], subtitles: "" });

    const season = se.season || 1;
    const episode = se.episode || 1;

    const post = await apiGet("post/" + id);
    if (!post || !post.player_links)
      return JSON.stringify({ streams: [], subtitles: "" });

    const pl = post.player_links;
    const streams = [];
    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: siteBase + "/",
    };

    // ---- movies ----
    if (pl.movie && (Array.isArray(pl.movie) || typeof pl.movie === "object")) {
      const arr = Array.isArray(pl.movie)
        ? pl.movie
        : Object.keys(pl.movie).map((k) => pl.movie[k]);
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (!item || !item.link) continue;
        const voice = item.translation || item.quality || "Filmix";
        if (isBadVoice(voice)) continue;
        const file = pickQualityUrl(item.link, MAX_Q);
        if (!file || file.indexOf("http") !== 0) continue;
        streams.push({
          title: String(voice) + " · " + MAX_Q + "p",
          streamUrl: file,
          headers: headers,
        });
      }
    }

    // ---- series ----
    if (pl.playlist && typeof pl.playlist === "object") {
      for (const seasonKey in pl.playlist) {
        const seasonObj = pl.playlist[seasonKey];
        if (!seasonObj) continue;
        for (const voice in seasonObj) {
          if (isBadVoice(voice)) continue;
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
            if (sn !== season || en !== episode) continue;
            let file = pickQualityUrl(link, MAX_Q);
            // series often needs %s → quality
            if (file.indexOf("%s") !== -1)
              file = file.replace("%s", String(MAX_Q));
            if (!file || file.indexOf("http") !== 0) continue;
            streams.push({
              title:
                "S" +
                sn +
                "E" +
                en +
                " · " +
                String(voice) +
                " · " +
                MAX_Q +
                "p",
              streamUrl: file,
              headers: headers,
            });
          }
        }
      }
    }

    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      const k = streams[i].streamUrl.slice(0, 100);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
