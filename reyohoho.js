/**
 * ReYohoho (reyohoho.com) – Sora / Luna
 * Search: /?q= · Films: /films/{kp_id}
 * Streams: Alloha multi-voice (HDrezka, LostFilm, …)
 * v1.0.0
 */
const baseUrl = "https://reyohoho.com";
const allohaApi = "https://api.alloha.tv/";
const allohaHosts = [
  "https://reuse-as.stravers.live/",
  "https://api.apbugall.org/",
  "https://api.alloha.tv/",
];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9",
      Accept: "text/html,application/json,*/*",
      Referer: baseUrl + "/",
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

async function getJson(url, headers) {
  try {
    const t = await getText(
      await soraFetch(url, { headers: headers || {} })
    );
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
  let id = "";
  const m = s.match(/\/films\/(\d+)/i) || s.match(/[?&#]id=(\d+)/i);
  if (m) id = m[1];
  const se = s.match(/[?&#]s=(\d+)/i);
  const ee = s.match(/[?&#]e=(\d+)/i);
  const tr = s.match(/[?&#]tr=(\d+)/i);
  return {
    id: id,
    season: se ? parseInt(se[1], 10) : 1,
    episode: ee ? parseInt(ee[1], 10) : 1,
    translation: tr ? tr[1] : "",
  };
}

function makeHref(id, season, episode, translation) {
  let h = baseUrl + "/films/" + id;
  const q = [];
  if (season) q.push("s=" + season);
  if (episode) q.push("e=" + episode);
  if (translation) q.push("tr=" + translation);
  if (q.length) h += "?" + q.join("&");
  return h;
}

function isEnglish(name) {
  return /eng\.?\s*original|eng\.?original|english|английск|\beng\b|оригинальный/i.test(
    String(name || "")
  ) && !/рус|дубл|hdrezka|lost|tvshows/i.test(String(name || ""));
}

function isRussianVoice(name) {
  const n = String(name || "");
  if (!n.trim()) return false;
  if (/субтитр|subtitle|^sub\b|укр\.?\s*суб/i.test(n) && !/рус/i.test(n))
    return false;
  if (/украин|україн|ukr/i.test(n) && !/рус|дубл|hdrezka|lost/i.test(n))
    return false;
  if (isEnglish(n)) return false;
  return true;
}

function voiceRank(name) {
  const n = String(name || "");
  if (/hdrezka|rezka/i.test(n) && /дубл|18\+/i.test(n)) return 0;
  if (/hdrezka|rezka/i.test(n)) return 1;
  if (/дубл/i.test(n)) return 2;
  if (/lostfilm|tvshows|coldfilm|baibako|rudub|dragon|newstudio|le-production|red head/i.test(n))
    return 3;
  return 4;
}

function extractAllohaTokens(html) {
  const out = { tokenMovie: "", token: "" };
  if (!html) return out;
  const tm = html.match(/token_movie=([a-f0-9]+)/i);
  if (tm) out.tokenMovie = tm[1];
  // prefer site-wide alloha token (usually starts with 7b in samples)
  const all = html.match(/token=([a-f0-9]{24,})/gi) || [];
  for (let i = 0; i < all.length; i++) {
    const t = all[i].replace(/^token=/i, "");
    if (t === out.tokenMovie) continue;
    out.token = t;
    if (/^7b/i.test(t)) break;
  }
  return out;
}

async function loadAllohaData(tokenMovie, token) {
  if (!tokenMovie || !token) return null;
  const url =
    allohaApi +
    "?token_movie=" +
    encodeURIComponent(tokenMovie) +
    "&token=" +
    encodeURIComponent(token);
  const json = await getJson(url);
  if (!json || json.status !== "success" || !json.data) return null;
  return json.data;
}

/** Parse stream URL from Alloha player HTML */
function parsePlayerStreams(html) {
  const streams = [];
  if (!html || /недоступен|unavailable|region/i.test(html)) return streams;

  function add(label, u) {
    u = forceHttps(String(u || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
    if (!isHttp(u)) return;
    if (!/\.(m3u8|mp4)(\?|$)/i.test(u) && u.indexOf("m3u8") < 0) return;
    streams.push({ label: label || "Stream", url: u });
  }

  let m;
  // file: "..."
  const fileRe = /["']?file["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = fileRe.exec(html))) add("file", m[1]);

  // hls: "..."
  const hlsRe = /["']?hls["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = hlsRe.exec(html))) add("hls", m[1]);

  // source src=
  const srcRe = /(?:src|source)\s*=\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi;
  while ((m = srcRe.exec(html))) add("src", m[1]);

  // raw m3u8/mp4 urls
  const rawRe = /(https?:\/\/[^"'\s<>]+?\.(?:m3u8|mp4)[^"'\s<>]*)/gi;
  while ((m = rawRe.exec(html))) add("raw", m[1]);

  // quality map {"720":"url"}
  const mapRe = /\{[^{}]{0,20}"(?:1080|720|480|360)"[^{}]{10,800}\}/g;
  while ((m = mapRe.exec(html))) {
    try {
      const obj = JSON.parse(m[0]);
      const keys = Object.keys(obj).sort(function (a, b) {
        return parseInt(b, 10) - parseInt(a, 10);
      });
      for (let i = 0; i < keys.length; i++) {
        if (isHttp(obj[keys[i]])) {
          add(keys[i] + "p", obj[keys[i]]);
          break; // highest only
        }
      }
    } catch (e) {}
  }

  // dedupe
  const seen = {};
  const uniq = [];
  for (let i = 0; i < streams.length; i++) {
    if (seen[streams[i].url]) continue;
    seen[streams[i].url] = true;
    uniq.push(streams[i]);
  }
  return uniq;
}

async function fetchAllohaPlayer(iframeUrl) {
  // try given host + mirrors with same query
  const q = iframeUrl.indexOf("?") >= 0 ? iframeUrl.slice(iframeUrl.indexOf("?")) : "";
  const urls = [iframeUrl];
  for (let i = 0; i < allohaHosts.length; i++) {
    const u = allohaHosts[i] + q.replace(/^\?/, "?");
    if (urls.indexOf(u) < 0) urls.push(u);
  }

  for (let i = 0; i < urls.length; i++) {
    try {
      const html = await getText(
        await soraFetch(urls[i], {
          headers: {
            Referer: baseUrl + "/",
            Accept: "text/html,*/*",
            "User-Agent": UA,
          },
        })
      );
      const found = parsePlayerStreams(html);
      if (found.length) return found;
    } catch (e) {}
  }
  return [];
}

function buildIframeUrl(tokenMovie, token, translation, season, episode) {
  let q =
    "token_movie=" +
    encodeURIComponent(tokenMovie) +
    "&token=" +
    encodeURIComponent(token);
  if (translation) q += "&translation=" + encodeURIComponent(translation);
  if (season) q += "&season=" + season;
  if (episode) q += "&episode=" + episode;
  return allohaHosts[0] + "?" + q;
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const html = await getText(
      await soraFetch(baseUrl + "/?q=" + encodeURIComponent(cleaned))
    );
    if (!html || html.length < 400) return JSON.stringify([]);

    const results = [];
    const seen = {};
    const re =
      /<a class="movie-card-link" href="(\/films\/\d+)">[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      if (seen[href]) continue;
      seen[href] = true;
      const title = decodeEntities(m[3]).replace(/\s+/g, " ").trim();
      const image = absUrl(m[2]);
      results.push({ title: title, image: image, href: href });
      if (results.length >= 20) break;
    }

    // fallback
    if (!results.length) {
      const re2 = /href="(\/films\/\d+)"[\s\S]{0,400}?alt="([^"]+)"/gi;
      while ((m = re2.exec(html))) {
        const href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;
        results.push({
          title: decodeEntities(m[2]).trim(),
          image: "",
          href: href,
        });
        if (results.length >= 20) break;
      }
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    const pageUrl = baseUrl + "/films/" + (p.id || "");
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);

    const tokens = extractAllohaTokens(html);
    if (tokens.tokenMovie && tokens.token) {
      const data = await loadAllohaData(tokens.tokenMovie, tokens.token);
      if (data && data.description) {
        description = String(data.description).slice(0, 900);
      }
    }

    return JSON.stringify([
      { description: description || "N/A", aliases: "N/A", airdate: "N/A" },
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
    const pageUrl = baseUrl + "/films/" + p.id;
    const html = await getText(await soraFetch(pageUrl));
    const tokens = extractAllohaTokens(html);
    const eps = [];

    if (tokens.tokenMovie && tokens.token) {
      const data = await loadAllohaData(tokens.tokenMovie, tokens.token);
      if (data && data.seasons && typeof data.seasons === "object") {
        const seasonKeys = Object.keys(data.seasons).sort(function (a, b) {
          return parseInt(a, 10) - parseInt(b, 10);
        });
        for (let s = 0; s < seasonKeys.length; s++) {
          const sid = parseInt(seasonKeys[s], 10) || s + 1;
          const seasonObj = data.seasons[seasonKeys[s]] || {};
          const episodes = seasonObj.episodes || {};
          const epKeys = Object.keys(episodes).sort(function (a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
          });
          for (let e = 0; e < epKeys.length; e++) {
            const eid = parseInt(epKeys[e], 10) || e + 1;
            eps.push({
              href: makeHref(p.id, sid, eid),
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

    const pageUrl = baseUrl + "/films/" + p.id;
    const html = await getText(await soraFetch(pageUrl));
    const tokens = extractAllohaTokens(html);
    if (!tokens.tokenMovie || !tokens.token) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const data = await loadAllohaData(tokens.tokenMovie, tokens.token);
    if (!data) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const season = p.season || 1;
    const episode = p.episode || 1;
    const isSeries = data.category === 2 || !!data.seasons;

    // collect voices (translation ids)
    const voices = [];
    const ti = data.translation_iframe || {};
    const ids = Object.keys(ti);
    for (let i = 0; i < ids.length; i++) {
      const v = ti[ids[i]];
      if (!v || !v.name) continue;
      if (!isRussianVoice(v.name)) continue;
      voices.push({ id: ids[i], name: v.name, quality: v.quality || "" });
    }
    voices.sort(function (a, b) {
      return voiceRank(a.name) - voiceRank(b.name);
    });

    // if none after filter, take all non-subtitle
    if (!voices.length) {
      for (let i = 0; i < ids.length; i++) {
        const v = ti[ids[i]];
        if (!v || !v.name) continue;
        if (/субтитр/i.test(v.name)) continue;
        voices.push({ id: ids[i], name: v.name, quality: v.quality || "" });
      }
    }

    const streams = [];
    const seen = {};
    const maxVoices = 8;

    for (let i = 0; i < voices.length && i < maxVoices; i++) {
      const voice = voices[i];
      let iframeUrl = buildIframeUrl(
        tokens.tokenMovie,
        tokens.token,
        voice.id,
        isSeries ? season : null,
        isSeries ? episode : null
      );

      // prefer iframe from seasons tree if present
      if (isSeries && data.seasons) {
        const sObj = data.seasons[String(season)] || data.seasons[season];
        if (sObj && sObj.episodes) {
          const eObj =
            sObj.episodes[String(episode)] || sObj.episodes[episode];
          if (eObj && eObj.iframe) {
            // inject translation into season episode iframe
            iframeUrl = eObj.iframe;
            if (iframeUrl.indexOf("translation=") < 0) {
              iframeUrl +=
                (iframeUrl.indexOf("?") >= 0 ? "&" : "?") +
                "translation=" +
                encodeURIComponent(voice.id);
            }
          }
        }
      }

      const found = await fetchAllohaPlayer(iframeUrl);
      for (let f = 0; f < found.length; f++) {
        const title = voice.name;
        if (seen[title] || seen[found[f].url]) continue;
        seen[title] = true;
        seen[found[f].url] = true;
        streams.push({
          title: title,
          name: title,
          streamUrl: found[f].url,
          headers: {
            "User-Agent": UA,
            Referer: "https://reyohoho.com/",
          },
        });
        break; // one stream per voice
      }
    }

    // fallback: default iframe without translation
    if (!streams.length) {
      const iframeUrl = buildIframeUrl(
        tokens.tokenMovie,
        tokens.token,
        null,
        isSeries ? season : null,
        isSeries ? episode : null
      );
      const found = await fetchAllohaPlayer(iframeUrl);
      for (let f = 0; f < found.length; f++) {
        streams.push({
          title: data.translation || "Alloha",
          name: data.translation || "Alloha",
          streamUrl: found[f].url,
          headers: {
            "User-Agent": UA,
            Referer: "https://reyohoho.com/",
          },
        });
      }
    }

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
