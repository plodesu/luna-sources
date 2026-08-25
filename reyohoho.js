/**
 * ReYohoho (reyohoho.com) – Sora / Luna
 * Player: VideoSeed ONLY (tv-2-kinoserial.net)
 * v1.1.0
 */
const baseUrl = "https://reyohoho.com";
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
  return {
    id: id,
    season: se ? parseInt(se[1], 10) : 1,
    episode: ee ? parseInt(ee[1], 10) : 1,
  };
}

function makeHref(id, season, episode) {
  let h = baseUrl + "/films/" + id;
  const q = [];
  if (season) q.push("s=" + season);
  if (episode) q.push("e=" + episode);
  if (q.length) h += "?" + q.join("&");
  return h;
}

/** Extract VideoSeed iframe only */
function extractVideoSeedUrl(html) {
  if (!html) return "";
  // preferred: pane = videoseed
  let m = html.match(
    /data-player-pane=["']videoseed["'][\s\S]{0,500}?src=["'](https?:\/\/[^"']+)["']/i
  );
  if (m) return decodeEntities(m[1]);

  m = html.match(
    /(https?:\/\/[^"'\s]*kinoserial\.net\/embed_auto\/[^"'\s]+)/i
  );
  if (m) return decodeEntities(m[1]);

  m = html.match(
    /(https?:\/\/[^"'\s]*videoseed[^"'\s]*\/embed[^"'\s]*)/i
  );
  if (m) return decodeEntities(m[1]);

  return "";
}

function withSeasonEpisode(embedUrl, season, episode) {
  if (!embedUrl) return "";
  let u = embedUrl;
  // strip old s/e
  u = u.replace(/([?&])(season|episode|s|e)=\d+/gi, "");
  u = u.replace(/\?&/, "?").replace(/&&/g, "&").replace(/\?$/, "");
  const sep = u.indexOf("?") >= 0 ? "&" : "?";
  if (season) u += sep + "season=" + season + "&s=" + season;
  if (episode)
    u += (u.indexOf("?") >= 0 ? "&" : "?") + "episode=" + episode + "&e=" + episode;
  return u;
}

function parseStreamsFromPlayer(html) {
  const out = [];
  if (!html || html.length < 50) return out;
  if (/недоступен|unavailable|403|access denied/i.test(html) && html.length < 2000)
    return out;

  function add(label, raw) {
    let u = forceHttps(
      String(raw || "")
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .trim()
    );
    if (!isHttp(u)) return;
    if (!/\.(m3u8|mp4)(\?|$)/i.test(u) && u.indexOf("m3u8") < 0 && u.indexOf("mp4") < 0)
      return;
    out.push({ label: label || "VideoSeed", url: u });
  }

  let m;
  const fileRe = /["']?file["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = fileRe.exec(html))) add("file", m[1]);

  const hlsRe = /["']?hls["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = hlsRe.exec(html))) add("hls", m[1]);

  const srcRe =
    /(?:src|source)\s*=\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi;
  while ((m = srcRe.exec(html))) add("src", m[1]);

  const rawRe = /(https?:\/\/[^"'\s<>]+?\.(?:m3u8|mp4)[^"'\s<>]*)/gi;
  while ((m = rawRe.exec(html))) add("raw", m[1]);

  // Playerjs / quality map
  const mapRe = /\{[^{}]{0,30}"(?:1080|720|480|360)"[^{}]{10,1200}\}/g;
  while ((m = mapRe.exec(html))) {
    try {
      const obj = JSON.parse(m[0]);
      const keys = Object.keys(obj).sort(function (a, b) {
        return parseInt(b, 10) - parseInt(a, 10);
      });
      for (let i = 0; i < keys.length; i++) {
        if (isHttp(obj[keys[i]])) {
          add(keys[i] + "p", obj[keys[i]]);
          break;
        }
      }
    } catch (e) {}
  }

  // playlist array [{title, file}]
  const plRe =
    /\{[^{}]*["']?title["']?\s*:\s*["']([^"']+)["'][^{}]*["']?file["']?\s*:\s*["'](https?:\/\/[^"']+)["'][^{}]*\}/gi;
  while ((m = plRe.exec(html))) add(m[1], m[2]);
  const plRe2 =
    /\{[^{}]*["']?file["']?\s*:\s*["'](https?:\/\/[^"']+)["'][^{}]*["']?title["']?\s*:\s*["']([^"']+)["'][^{}]*\}/gi;
  while ((m = plRe2.exec(html))) add(m[2], m[1]);

  const seen = {};
  const uniq = [];
  for (let i = 0; i < out.length; i++) {
    if (seen[out[i].url]) continue;
    seen[out[i].url] = true;
    uniq.push(out[i]);
  }
  return uniq;
}

function isRussianLabel(name) {
  const n = String(name || "");
  if (!n.trim()) return true;
  if (/eng\.?original|english|английск|\beng\b/i.test(n)) return false;
  if (/укр|ukr|україн/i.test(n) && !/рус|дубл|hdrezka|lost/i.test(n))
    return false;
  if (/субтитр|subtitle/i.test(n) && !/рус/i.test(n)) return false;
  return true;
}

function voiceRank(name) {
  const n = String(name || "");
  if (/hdrezka|rezka/i.test(n)) return 0;
  if (/дубл/i.test(n)) return 1;
  if (/lostfilm|tvshows|coldfilm|баибако|rudub|dragon/i.test(n)) return 2;
  if (/рус/i.test(n)) return 3;
  return 4;
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
      results.push({
        title: decodeEntities(m[3]).replace(/\s+/g, " ").trim(),
        image: absUrl(m[2]),
        href: href,
      });
      if (results.length >= 20) break;
    }

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
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);
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
    const embed = extractVideoSeedUrl(html);
    const eps = [];

    // Try to discover seasons/episodes from VideoSeed player HTML
    if (embed) {
      const playerHtml = await getText(
        await soraFetch(embed, {
          headers: {
            Referer: baseUrl + "/",
            Accept: "text/html,*/*",
          },
        })
      );

      // seasons:[{season:1,episodes:[{episode:1}...]}] style
      const seasonBlocks = playerHtml.split(/"season"\s*:\s*/);
      for (let i = 1; i < seasonBlocks.length; i++) {
        const sm = seasonBlocks[i].match(/^(\d+)/);
        if (!sm) continue;
        const sid = parseInt(sm[1], 10);
        const chunk = seasonBlocks[i].slice(0, 8000);
        const epNums = [];
        const er = /"episode"\s*:\s*"?(\d+)"?/g;
        let em;
        while ((em = er.exec(chunk))) {
          const n = parseInt(em[1], 10);
          if (epNums.indexOf(n) < 0) epNums.push(n);
        }
        epNums.sort(function (a, b) {
          return a - b;
        });
        for (let e = 0; e < epNums.length; e++) {
          eps.push({
            href: makeHref(p.id, sid, epNums[e]),
            number: epNums[e],
            season: sid,
            title: "S" + sid + "E" + epNums[e],
          });
        }
      }

      // folder / playlist titles S1E1
      if (!eps.length) {
        const titleRe = /["']title["']\s*:\s*["']([^"']*(?:сезон|season|S\d+|Эпизод|episode)[^"']*)["']/gi;
        let tm;
        while ((tm = titleRe.exec(playerHtml))) {
          const t = tm[1];
          const sM = t.match(/(?:сезон|season|S)\s*(\d+)/i);
          const eM = t.match(/(?:эпизод|серия|episode|E)\s*(\d+)/i);
          if (sM && eM) {
            const sid = parseInt(sM[1], 10);
            const eid = parseInt(eM[1], 10);
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

    // dedupe
    const seen = {};
    const uniq = [];
    for (let i = 0; i < eps.length; i++) {
      const k = eps[i].season + ":" + eps[i].number;
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(eps[i]);
    }
    uniq.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });

    return JSON.stringify(uniq.slice(0, 500));
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

    let embed = extractVideoSeedUrl(html);
    if (!embed) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    // series episode
    if (p.season && p.episode) {
      embed = withSeasonEpisode(embed, p.season, p.episode);
    }

    const playerHtml = await getText(
      await soraFetch(embed, {
        headers: {
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
          "User-Agent": UA,
          Origin: "https://reyohoho.com",
        },
      })
    );

    let found = parseStreamsFromPlayer(playerHtml);

    // try alternate season query forms if empty
    if (!found.length && p.season && p.episode) {
      const alts = [
        embed.replace(/[?&]season=\d+/i, "").replace(/[?&]s=\d+/i, "") +
          (embed.indexOf("?") >= 0 ? "&" : "?") +
          "s=" +
          p.season +
          "&e=" +
          p.episode,
        embed +
          (embed.indexOf("?") >= 0 ? "&" : "?") +
          "season_id=" +
          p.season +
          "&episode_id=" +
          p.episode,
      ];
      for (let i = 0; i < alts.length && !found.length; i++) {
        const h2 = await getText(
          await soraFetch(alts[i], {
            headers: {
              Referer: baseUrl + "/",
              Accept: "text/html,*/*",
              "User-Agent": UA,
            },
          })
        );
        found = parseStreamsFromPlayer(h2);
      }
    }

    const headers = {
      "User-Agent": UA,
      Referer: "https://tv-2-kinoserial.net/",
      Origin: "https://tv-2-kinoserial.net",
    };

    const streams = [];
    const seen = {};

    for (let i = 0; i < found.length; i++) {
      const f = found[i];
      if (!isRussianLabel(f.label) && found.length > 1) continue;
      let title = "VideoSeed";
      if (f.label && f.label !== "file" && f.label !== "hls" && f.label !== "raw" && f.label !== "src") {
        title = "VideoSeed · " + f.label;
      }
      if (seen[f.url] || seen[title]) continue;
      seen[f.url] = true;
      seen[title] = true;
      streams.push({
        title: title,
        name: title,
        streamUrl: f.url,
        headers: headers,
      });
    }

    // if filter removed everything, take first raw hits
    if (!streams.length) {
      for (let i = 0; i < found.length; i++) {
        const f = found[i];
        if (seen[f.url]) continue;
        seen[f.url] = true;
        streams.push({
          title: "VideoSeed",
          name: "VideoSeed",
          streamUrl: f.url,
          headers: headers,
        });
      }
    }

    streams.sort(function (a, b) {
      return voiceRank(a.title) - voiceRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 10),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
