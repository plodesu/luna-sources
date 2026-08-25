/**
 * Lift (liftw.ws) – Sora / Luna
 * API: api.liftw.ws · embed.liftw.ws (Collaps HLS)
 * Multi-voice picker like GidOnline
 * v1.0.0
 */
const siteUrl = "https://liftw.ws";
const apiBase = "https://api.liftw.ws";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      Accept: "application/json,text/html,*/*",
      Referer: siteUrl + "/",
      Origin: siteUrl,
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
  return String(u || "").replace(/^http:\/\//i, "https://");
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
  let id = "";
  let m = s.match(/[?&#]id=(\d+)/i) || s.match(/\/(?:movie|info|watch)\/(\d+)/i);
  if (m) id = m[1];
  const se = s.match(/[?&#]s=(\d+)/i);
  const ee = s.match(/[?&#]e=(\d+)/i);
  return {
    id: id,
    season: se ? parseInt(se[1], 10) : 1,
    episode: ee ? parseInt(ee[1], 10) : 1,
  };
}

function makeHref(id, season, episode) {
  let h = apiBase + "/watch?id=" + id;
  if (season) h += "&s=" + season;
  if (episode) h += "&e=" + episode;
  return h;
}

function isEnglish(name) {
  return /eng\.?\s*original|eng\.?original|english|английск|\beng\b/i.test(
    String(name || "")
  );
}

function isRussianVoice(name) {
  const n = String(name || "");
  if (!n.trim() || isEnglish(n)) return false;
  if (/укр|ukr|україн|багатоголосий/i.test(n) && !/рус|дубл|hdrezka|lost/i.test(n))
    return false;
  if (/субтитр|subtitle|^sub\b/i.test(n) && !/рус/i.test(n)) return false;
  return true;
}

function voiceRank(name) {
  const n = String(name || "");
  if (/rezka|hdrezka/i.test(n) && /дубл/i.test(n)) return 0;
  if (/rezka|hdrezka/i.test(n)) return 1;
  if (/дубл/i.test(n)) return 2;
  if (/lostfilm|coldfilm|baibako|tvshows|winmedia|dragon/i.test(n)) return 3;
  return 4;
}

function heightToLabel(h) {
  h = parseInt(h, 10) || 0;
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  return "";
}

function absFrom(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").replace(/\\u0026/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (isHttp(u)) return u;
  if (u.charAt(0) === "/") {
    const m = String(base).match(/^(https?:\/\/[^/]+)/i);
    return (m ? m[1] : "") + u;
  }
  return String(base).replace(/\/[^/]*$/, "/") + u.replace(/^\.\//, "");
}

function unescapeJs(s) {
  return String(s || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

/** Parse Collaps-style makePlayer from embed HTML */
function parseEmbed(html) {
  const out = { hls: "", names: [], seasons: [] };
  if (!html) return out;

  // movie: source.hls + audio.names
  let m = html.match(
    /hls\s*:\s*["'](https?:\/\/[^"']+)["']/i
  );
  if (m) out.hls = unescapeJs(m[1]);

  m = html.match(/audio\s*:\s*\{[^}]*names\s*:\s*\[([^\]]*)\]/i);
  if (m) {
    const parts = m[1].match(/["']([^"']+)["']/g);
    if (parts) {
      for (let i = 0; i < parts.length; i++) {
        out.names.push(parts[i].replace(/["']/g, "").trim());
      }
    }
  }

  // series: seasons with episode hls + audio.names
  if (/"season"\s*:/.test(html) || /seasons\s*:/.test(html)) {
    const chunks = html.split(/\{"season"\s*:/);
    for (let c = 1; c < chunks.length; c++) {
      const chunk = chunks[c];
      const sm = chunk.match(/^(\d+)/);
      if (!sm) continue;
      const seasonNum = parseInt(sm[1], 10);
      const episodes = [];
      const epRe =
        /\{"episode"\s*:\s*"?(\d+)"?[\s\S]*?"hls"\s*:\s*"(https:[^"]+)"[\s\S]*?"names"\s*:\s*\[([^\]]*)\]/g;
      let em;
      while ((em = epRe.exec(chunk))) {
        const names = [];
        const np = em[3].match(/["']([^"']+)["']/g);
        if (np) {
          for (let i = 0; i < np.length; i++) {
            names.push(np[i].replace(/["']/g, "").trim());
          }
        }
        episodes.push({
          episode: parseInt(em[1], 10),
          hls: unescapeJs(em[2]),
          names: names,
        });
      }
      if (episodes.length) {
        out.seasons.push({ season: seasonNum, episodes: episodes });
      }
    }
  }

  return out;
}

async function expandHls(masterUrl) {
  const out = [];
  if (!isHttp(masterUrl)) return out;
  const master = forceHttps(masterUrl);
  out.push({ quality: "Auto", url: master });
  try {
    const text = await getText(
      await soraFetch(master, {
        headers: {
          "User-Agent": UA,
          Accept: "application/vnd.apple.mpegurl,*/*",
          Referer: "https://embed.liftw.ws/",
        },
      })
    );
    if (!text || text.indexOf("#EXT") !== 0) return out;
    const lines = text.split(/\r?\n/);
    const found = {};
    for (let i = 0; i < lines.length; i++) {
      if (!/^#EXT-X-STREAM-INF:/i.test(lines[i])) continue;
      if (/failover/i.test(lines[i])) continue;
      const resM = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
      const q = heightToLabel(resM ? resM[1] : 0);
      if (q) found[q] = true;
    }
    // Keep master URL so multi-audio tracks still work
    ["1080p", "720p", "480p"].forEach(function (q) {
      if (found[q]) out.push({ quality: q, url: master });
    });
  } catch (e) {}
  return out;
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const json = await getJson(
      apiBase + "/search?q=" + encodeURIComponent(cleaned)
    );
    const items = (json && json.items) || [];
    const results = [];
    const seen = {};

    for (let i = 0; i < items.length && results.length < 20; i++) {
      const it = items[i];
      if (!it || !it.id) continue;
      const id = String(it.id);
      if (seen[id]) continue;
      seen[id] = true;

      const ru = String(it.name || "").trim();
      const en = String(it.origin_name || "").trim();
      let title = ru || en;
      if (en && ru && en.toLowerCase() !== ru.toLowerCase()) {
        title = ru + " / " + en;
      }
      if (it.year) title += " (" + it.year + ")";
      // type 3 = series (and sometimes others with serial_status)
      const isSeries =
        it.type === 3 ||
        (it.serial_status && String(it.serial_status).length > 0);
      if (isSeries) title += " [сериал]";

      results.push({
        title: title,
        image: it.poster || "",
        href: makeHref(id, isSeries ? 1 : 0, isSeries ? 1 : 0),
      });
    }

    return JSON.stringify(results);
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
    const json = await getJson(apiBase + "/info/" + encodeURIComponent(p.id));
    const info = (json && json.info) || {};
    const description = String(
      info.description || info.slogan || "N/A"
    ).slice(0, 900);
    const aliases = String(
      info.name_eng || (json && json.origin_name) || "N/A"
    );
    const airdate = String(
      info.premier || info.premier_rus || (json && json.year) || "N/A"
    );
    return JSON.stringify([
      {
        description: description,
        aliases: aliases,
        airdate: airdate,
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
    const json = await getJson(apiBase + "/info/" + encodeURIComponent(p.id));
    if (!json) {
      return JSON.stringify([
        {
          href: makeHref(p.id),
          number: 1,
          season: 1,
          title: "Смотреть",
        },
      ]);
    }

    const eps = [];
    const episodes = json.episodes;
    // episodes: { "1": ["1","2",...], "2": [...] }
    if (episodes && typeof episodes === "object") {
      const seasons = Object.keys(episodes).sort(function (a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      });
      for (let s = 0; s < seasons.length; s++) {
        const sid = parseInt(seasons[s], 10) || s + 1;
        const list = episodes[seasons[s]] || [];
        // normalize episode numbers
        const nums = list
          .map(function (x) {
            return parseInt(x, 10);
          })
          .filter(function (n) {
            return n > 0;
          })
          .sort(function (a, b) {
            return a - b;
          });
        // unique
        const seen = {};
        for (let e = 0; e < nums.length; e++) {
          if (seen[nums[e]]) continue;
          seen[nums[e]] = true;
          eps.push({
            href: makeHref(p.id, sid, nums[e]),
            number: nums[e],
            season: sid,
            title: "S" + sid + "E" + nums[e],
          });
        }
      }
    }

    if (!eps.length) {
      eps.push({
        href: makeHref(p.id),
        number: 1,
        season: 1,
        title: "Смотреть",
      });
    }

    return JSON.stringify(eps.slice(0, 500));
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

    const info = await getJson(apiBase + "/info/" + encodeURIComponent(p.id));
    if (!info || !info.iframe_uri) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    let embedUrl = info.iframe_uri;
    // series: request specific episode
    if (info.episodes || info.type === 3) {
      const sep = embedUrl.indexOf("?") >= 0 ? "&" : "?";
      embedUrl +=
        sep +
        "season=" +
        (p.season || 1) +
        "&episode=" +
        (p.episode || 1);
    }

    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          Referer: siteUrl + "/",
          Accept: "text/html,*/*",
          "User-Agent": UA,
        },
      })
    );

    const emb = parseEmbed(html);
    let hls = emb.hls;
    let names = emb.names || [];

    // series: pick matching episode from seasons if present
    if (emb.seasons && emb.seasons.length) {
      const seasonNum = p.season || 1;
      const episodeNum = p.episode || 1;
      for (let s = 0; s < emb.seasons.length; s++) {
        if (emb.seasons[s].season !== seasonNum) continue;
        const eps = emb.seasons[s].episodes || [];
        for (let e = 0; e < eps.length; e++) {
          if (eps[e].episode === episodeNum) {
            hls = eps[e].hls || hls;
            names = eps[e].names || names;
            break;
          }
        }
        break;
      }
      // fallback first episode of season
      if ((!hls || !names.length) && emb.seasons[0].episodes[0]) {
        const ep0 = emb.seasons[0].episodes[0];
        hls = hls || ep0.hls;
        if (!names.length) names = ep0.names || [];
      }
    }

    if (!hls || !isHttp(hls)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    let voices = names.filter(isRussianVoice);
    if (!voices.length) voices = names.length ? names.slice() : ["Русский"];

    voices.sort(function (a, b) {
      return voiceRank(a) - voiceRank(b);
    });

    const quals = await expandHls(hls);
    const streams = [];
    const seen = {};

    for (let v = 0; v < voices.length; v++) {
      for (let q = 0; q < quals.length; q++) {
        const title =
          voices[v] +
          (quals[q].quality !== "Auto" ? " · " + quals[q].quality : "");
        if (seen[title]) continue;
        seen[title] = true;
        streams.push({
          title: title,
          name: title,
          streamUrl: forceHttps(quals[q].url),
          headers: {
            "User-Agent": UA,
            Referer: "https://embed.liftw.ws/",
          },
        });
      }
    }

    streams.sort(function (a, b) {
      const ra = voiceRank(a.title);
      const rb = voiceRank(b.title);
      if (ra !== rb) return ra - rb;
      const order = { "1080p": 0, "720p": 1, "480p": 2, Auto: 3 };
      const qa = (a.title.match(/(1080|720|480)p|Auto/) || ["Auto"])[0];
      const qb = (b.title.match(/(1080|720|480)p|Auto/) || ["Auto"])[0];
      return (order[qa] != null ? order[qa] : 9) -
        (order[qb] != null ? order[qb] : 9);
    });

    return JSON.stringify({
      streams: streams.slice(0, 20),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
