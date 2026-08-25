/**
 * Lift (liftw.ws) – Sora / Luna
 * API: api.liftw.ws · embed.liftw.ws (Collaps HLS)
 * Voice picker only · master HLS = highest quality + multi-audio
 * v1.0.1
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
  const m =
    s.match(/[?&#]id=(\d+)/i) || s.match(/\/(?:movie|info|watch)\/(\d+)/i);
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
  if (
    /укр|ukr|україн|багатоголосий/i.test(n) &&
    !/рус|дубл|hdrezka|lost/i.test(n)
  )
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

  let m = html.match(/hls\s*:\s*["'](https?:\/\/[^"']+)["']/i);
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

/**
 * Prefer highest video quality while keeping master if multi-audio.
 * Returns one URL: highest variant if single-audio, else master (audio safe).
 */
async function resolveBestHls(masterUrl, multiAudio) {
  masterUrl = forceHttps(masterUrl);
  if (!isHttp(masterUrl)) return "";
  // Multi audio tracks live on the master — must keep it
  if (multiAudio) return masterUrl;

  try {
    const text = await getText(
      await soraFetch(masterUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "application/vnd.apple.mpegurl,*/*",
          Referer: "https://embed.liftw.ws/",
        },
      })
    );
    if (!text || text.indexOf("#EXT") !== 0) return masterUrl;

    const lines = text.split(/\r?\n/);
    let bestH = 0;
    let bestUrl = "";
    let bestBw = 0;

    for (let i = 0; i < lines.length; i++) {
      if (!/^#EXT-X-STREAM-INF:/i.test(lines[i])) continue;
      if (/failover/i.test(lines[i])) continue;
      const resM = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
      const bwM = lines[i].match(/BANDWIDTH=(\d+)/i);
      const h = resM ? parseInt(resM[1], 10) : 0;
      const bw = bwM ? parseInt(bwM[1], 10) : 0;
      let next = "";
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && lines[j].charAt(0) !== "#") {
          next = lines[j].trim();
          break;
        }
      }
      if (!next) continue;
      if (h > bestH || (h === bestH && bw > bestBw)) {
        bestH = h;
        bestBw = bw;
        bestUrl = next;
      }
    }

    if (bestUrl) {
      if (bestUrl.indexOf("http") === 0) return forceHttps(bestUrl);
      const base = masterUrl.replace(/\/[^/]*$/, "/");
      if (bestUrl.charAt(0) === "/") {
        const host = masterUrl.match(/^(https?:\/\/[^/]+)/i);
        return host ? host[1] + bestUrl : forceHttps(bestUrl);
      }
      return forceHttps(base + bestUrl.replace(/^\.\//, ""));
    }
  } catch (e) {}
  return masterUrl;
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
    if (episodes && typeof episodes === "object") {
      const seasons = Object.keys(episodes).sort(function (a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      });
      for (let s = 0; s < seasons.length; s++) {
        const sid = parseInt(seasons[s], 10) || s + 1;
        const list = episodes[seasons[s]] || [];
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

    // Multi-audio → keep master so Luna can play with sound + ABR max quality
    // Single track → resolve highest resolution variant
    const multiAudio = voices.length > 1 || names.length > 1;
    const playUrl = await resolveBestHls(hls, multiAudio);

    if (!playUrl || !isHttp(playUrl)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const headers = {
      "User-Agent": UA,
      Referer: "https://embed.liftw.ws/",
      Origin: "https://embed.liftw.ws",
    };

    const streams = [];
    const seen = {};

    for (let v = 0; v < voices.length; v++) {
      const title = voices[v];
      if (seen[title]) continue;
      seen[title] = true;
      streams.push({
        title: title,
        name: title,
        streamUrl: playUrl,
        headers: headers,
      });
    }

    // Prefer HDRezka / Dub first so auto-pick has Russian + high quality
    streams.sort(function (a, b) {
      return voiceRank(a.title) - voiceRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
