/**
 * KinoGo.my – films & series for Sora / Luna
 * Site: https://kinogomy.net
 * v1.0.0 – ortified embeds (same CDN as GidOnline) + RU dubs
 */

const baseUrl = "https://kinogomy.net";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
  const method = options.method || "GET";
  const body = options.body || null;
  try {
    if (typeof fetchv2 === "function") {
      return await fetchv2(url, headers, method, body);
    }
    return await fetch(url, { headers: headers, method: method, body: body });
  } catch (e1) {
    try {
      return await fetch(url, { headers: headers, method: method, body: body });
    } catch (e2) {
      return null;
    }
  }
}

async function getText(res) {
  if (!res) return "";
  try {
    if (typeof res.text === "function") return await res.text();
    if (typeof res === "string") return res;
    return String(res);
  } catch (e) {
    return "";
  }
}

function decodeHtml(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function absUrl(u) {
  if (!u) return "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/[Ss]\d+[Ee]\d+/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/Episode\s*\d+/gi, "")
    .replace(/Сезон\s*\d+/gi, "")
    .replace(/Серия\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQueries(keyword) {
  const base = cleanQuery(keyword);
  if (!base) return [];
  const queries = [];
  const add = function (q) {
    q = String(q || "").replace(/\s+/g, " ").trim();
    if (!q) return;
    if (queries.indexOf(q) === -1) queries.push(q);
  };
  add(base);
  add(base.replace(/&/g, " ").replace(/\band\b/gi, " "));
  add(base.replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, " "));
  const words = base.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 1) add(words[0]);
  if (words.length >= 2) add(words[0] + " " + words[1]);
  const low = base.toLowerCase();
  const aliases = {
    simpsons: "Симпсоны",
    "the simpsons": "Симпсоны",
    "the rookie": "Новобранец",
    rookie: "Новобранец",
    minions: "Миньоны",
    "despicable me": "Гадкий я",
    friends: "Друзья",
    "breaking bad": "Во все тяжкие",
    "game of thrones": "Игра престолов",
    witcher: "Ведьмак",
    reacher: "Ричер",
  };
  for (const k in aliases) {
    if (low.indexOf(k) !== -1) add(aliases[k]);
  }
  return queries.slice(0, 5);
}

function parseSearchHtml(html, results, seen) {
  if (!html) return;
  // <h2 class="zagolovki"><a href="..."><span>Title</span></a></h2>
  const re =
    /class="zagolovki"\s*>\s*<a\s+href="([^"]+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href] || href.indexOf(".html") === -1) continue;
    seen[href] = true;
    results.push({
      title: decodeHtml(m[2]),
      image: "",
      href: href,
    });
  }
  // fill images from nearby shortimg if possible
  for (let i = 0; i < results.length; i++) {
    const idMatch = results[i].href.match(/\/(\d+)-/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const imgRe = new RegExp(
      'id="' + id + '"[\\s\\S]{0,400}?(?:data-src|src)="([^"]+)"',
      "i"
    );
    const im = html.match(imgRe);
    if (im) results[i].image = absUrl(im[1]);
  }
}

async function searchResults(keyword) {
  try {
    const queries = buildSearchQueries(keyword);
    if (queries.length === 0) return JSON.stringify([]);
    const results = [];
    const seen = {};
    for (let i = 0; i < queries.length; i++) {
      const url =
        baseUrl +
        "/index.php?do=search&subaction=search&story=" +
        encodeURIComponent(queries[i]);
      const res = await soraFetch(url);
      const html = await getText(res);
      parseSearchHtml(html, results, seen);
      if (results.length >= 15) break;
    }
    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const res = await soraFetch(url);
    const html = await getText(res);
    if (!html) {
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    }
    let description = "N/A";
    const descMatch =
      html.match(
        /<div[^>]+class="[^"]*(?:full-text|fdesc|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ) ||
      html.match(/name="description"\s+content="([^"]+)"/i);
    if (descMatch) {
      description = decodeHtml(descMatch[1].replace(/<[^>]+>/g, " ")).slice(
        0,
        900
      );
    }
    let aliases = "N/A";
    const orig = html.match(
      /Оригинальное\s*название[:\s]*<\/[^>]+>\s*([^<]+)/i
    );
    if (orig) aliases = decodeHtml(orig[1]);
    let airdate = "N/A";
    const year =
      html.match(/(?:Год|year)[:\s]*<\/[^>]+>\s*(?:<[^>]+>)*\s*(\d{4})/i) ||
      html.match(/\((\d{4})\)/);
    if (year) airdate = year[1];
    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
    ]);
  } catch (err) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

function isEnglishAudio(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.indexOf("eng") !== -1 ||
    n.indexOf("original") !== -1 ||
    n.indexOf("english") !== -1 ||
    n === "en"
  );
}

function isRussianPreferred(name) {
  const n = String(name || "").toLowerCase();
  if (isEnglishAudio(name)) return false;
  return (
    n.indexOf("рус") !== -1 ||
    n.indexOf("дуб") !== -1 ||
    n.indexOf("lostfilm") !== -1 ||
    n.indexOf("hdrezka") !== -1 ||
    n.indexOf("winmedia") !== -1 ||
    n.indexOf("tvshows") !== -1 ||
    n.indexOf("redhead") !== -1 ||
    n.indexOf("le-production") !== -1 ||
    n.indexOf("1win") !== -1
  );
}

function sortAudioNames(names) {
  const arr = (names || []).slice();
  arr.sort(function (a, b) {
    const ar = isRussianPreferred(a) ? 0 : isEnglishAudio(a) ? 2 : 1;
    const br = isRussianPreferred(b) ? 0 : isEnglishAudio(b) ? 2 : 1;
    return ar - br;
  });
  return arr;
}

function extractSeasonsArray(html) {
  if (!html) return null;
  const idx = html.indexOf("seasons:");
  if (idx === -1) return null;
  let i = html.indexOf("[", idx);
  if (i === -1) return null;
  let depth = 0;
  let end = -1;
  for (let j = i; j < html.length && j < i + 500000; j++) {
    const c = html.charAt(j);
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = j + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(html.substring(i, end));
  } catch (e) {
    return null;
  }
}

function pushAudioStreams(out, playerName, hls, audioNames, headers) {
  if (!hls) return;
  let names = sortAudioNames(audioNames || []);
  names = names.filter(function (n) {
    return !isEnglishAudio(n);
  });
  const prefix = playerName || "Смотреть";
  if (names.length === 0) {
    out.push({
      title: prefix + " · Рус. дубляж",
      streamUrl: hls,
      headers: headers,
    });
    return;
  }
  for (let i = 0; i < names.length; i++) {
    out.push({
      title: prefix + " · " + String(names[i]),
      streamUrl: hls,
      headers: headers,
    });
  }
}

function parseMakePlayerMovie(html, playerName, out) {
  if (!html || html.indexOf("makePlayer") === -1) return "";
  if (html.indexOf("seasons:") !== -1) return "";

  let audioNames = [];
  const audioMatch = html.match(/audio\s*:\s*\{\s*"names"\s*:\s*(\[[^\]]+\])/);
  if (audioMatch) {
    try {
      audioNames = JSON.parse(audioMatch[1]);
    } catch (e) {}
  }

  let hls = null;
  const hlsMatch = html.match(/hls\s*:\s*"([^"]+\.m3u8[^"]*)"/);
  if (hlsMatch) {
    hls = hlsMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }

  let subUrl = "";
  const ccUrl = html.match(/"url"\s*:\s*"(https?:\/\/[^"]+\.vtt[^"]*)"/);
  if (ccUrl) subUrl = ccUrl[1].replace(/\\u0026/g, "&");

  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: baseUrl + "/",
  };

  pushAudioStreams(out, playerName || "Смотреть", hls, audioNames, headers);
  return subUrl;
}

function parseSeasonsPlayer(html, playerName, season, episode, out) {
  const seasons = extractSeasonsArray(html);
  if (!seasons || !seasons.length) return "";

  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: baseUrl + "/",
  };

  let targetSeason = season;
  let targetEpisode = episode;
  if (!targetSeason || !targetEpisode) {
    for (let si = 0; si < seasons.length; si++) {
      const eps = seasons[si].episodes || [];
      if (eps.length) {
        targetSeason = seasons[si].season || si + 1;
        targetEpisode = parseInt(eps[0].episode || 1, 10);
        break;
      }
    }
  }

  let subUrl = "";
  for (let si = 0; si < seasons.length; si++) {
    const sObj = seasons[si];
    const sn = sObj.season || si + 1;
    if (targetSeason && sn !== targetSeason) continue;
    const episodes = sObj.episodes || [];
    for (let ei = 0; ei < episodes.length; ei++) {
      const ep = episodes[ei];
      const en = parseInt(ep.episode || ei + 1, 10);
      if (targetEpisode && en !== targetEpisode) continue;
      let hls = ep.hls || ep.file || "";
      if (hls) hls = String(hls).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      let audioNames = [];
      if (ep.audio && ep.audio.names) audioNames = ep.audio.names;
      pushAudioStreams(
        out,
        (playerName || "Смотреть") + " S" + sn + "E" + en,
        hls,
        audioNames,
        headers
      );
      if (ep.cc && ep.cc.length && ep.cc[0].url) {
        subUrl = String(ep.cc[0].url).replace(/\\u0026/g, "&");
      }
      return subUrl;
    }
  }
  return subUrl;
}

function parseSeasonEpisode(url) {
  const s = (url.match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (url.match(/[?&#]e=(\d+)/i) || [])[1];
  return {
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null,
  };
}

function findOrtifiedEmbeds(html) {
  const embeds = [];
  const seen = {};
  const re =
    /https?:\/\/api\.ortified\.ws\/embed\/(?:movie|serial|show|kp)\/[0-9]+[^\s"']*/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let u = m[0].replace(/&amp;/g, "&").replace(/[),;]+$/, "");
    if (seen[u]) continue;
    seen[u] = true;
    embeds.push(u);
  }
  // relative //api.ortified.ws
  const re2 =
    /\/\/api\.ortified\.ws\/embed\/(?:movie|serial|show|kp)\/[0-9]+[^\s"']*/gi;
  while ((m = re2.exec(html)) !== null) {
    let u = "https:" + m[0].replace(/&amp;/g, "&").replace(/[),;]+$/, "");
    if (seen[u]) continue;
    seen[u] = true;
    embeds.push(u);
  }
  return embeds;
}

async function extractEpisodes(url) {
  try {
    const res = await soraFetch(url);
    const html = await getText(res);
    const eps = [];
    const seen = {};

    // from page data attributes
    const epRe =
      /data-(?:season|s)=["']?(\d+)["']?[^>]*data-(?:episode|e)=["']?(\d+)["']?/gi;
    let m;
    while ((m = epRe.exec(html)) !== null) {
      const key = m[1] + "-" + m[2];
      if (seen[key]) continue;
      seen[key] = true;
      eps.push({
        href: url + (url.indexOf("?") >= 0 ? "&" : "?") + "s=" + m[1] + "&e=" + m[2],
        number: parseInt(m[2], 10),
        season: parseInt(m[1], 10),
        title: "S" + m[1] + "E" + m[2],
      });
    }

    // from ortified seasons
    if (eps.length === 0) {
      const embeds = findOrtifiedEmbeds(html);
      for (let i = 0; i < embeds.length && eps.length === 0; i++) {
        try {
          const er = await soraFetch(embeds[i]);
          const eh = await getText(er);
          const seasons = extractSeasonsArray(eh);
          if (!seasons) continue;
          for (let si = 0; si < seasons.length; si++) {
            const sn = seasons[si].season || si + 1;
            const episodes = seasons[si].episodes || [];
            for (let ei = 0; ei < episodes.length; ei++) {
              const en = parseInt(episodes[ei].episode || ei + 1, 10);
              const key = sn + "-" + en;
              if (seen[key]) continue;
              seen[key] = true;
              eps.push({
                href:
                  url +
                  (url.indexOf("?") >= 0 ? "&" : "?") +
                  "s=" +
                  sn +
                  "&e=" +
                  en,
                number: en,
                season: sn,
                title: "S" + sn + "E" + en,
              });
            }
          }
        } catch (e) {}
      }
    }

    if (eps.length > 0) {
      eps.sort(function (a, b) {
        if (a.season !== b.season) return a.season - b.season;
        return a.number - b.number;
      });
      return JSON.stringify(eps);
    }
    return JSON.stringify([
      { href: url, number: 1, season: 1, title: "Смотреть" },
    ]);
  } catch (err) {
    return JSON.stringify([
      { href: url, number: 1, season: 1, title: "Смотреть" },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const clean = String(url).split("#")[0];
    const se = parseSeasonEpisode(clean);
    const pageUrl = clean.split("?")[0];

    const res = await soraFetch(pageUrl);
    const html = await getText(res);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    let subtitle = "";
    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: baseUrl + "/",
    };

    const embeds = findOrtifiedEmbeds(html);

    // also try data-src iframes that look like players
    const extraRe =
      /(?:iframe[^>]+src|data-src)=["']([^"']+)["']/gi;
    let em;
    while ((em = extraRe.exec(html)) !== null) {
      let src = absUrl(em[1].replace(/&amp;/g, "&"));
      if (!src || /youtube|poster|uploads|\.jpg|\.webp|\.png/i.test(src))
        continue;
      if (/ortified|embed|player|stravers|stloadi/i.test(src)) {
        if (embeds.indexOf(src) === -1) embeds.push(src);
      }
    }

    for (let i = 0; i < embeds.length; i++) {
      try {
        const er = await soraFetch(embeds[i], {
          headers: Object.assign({}, headers, { Referer: pageUrl }),
        });
        const eh = await getText(er);
        if (!eh || eh.length < 50) continue;

        const label = i === 0 ? "Смотреть" : "Плеер " + (i + 1);
        const before = streams.length;
        let sub = parseSeasonsPlayer(
          eh,
          label,
          se.season,
          se.episode,
          streams
        );
        if (streams.length === before) {
          sub = parseMakePlayerMovie(eh, label, streams) || sub;
        }
        if (sub && !subtitle) subtitle = sub;

        // raw m3u8 fallback
        if (streams.length === before) {
          const m3 = eh.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
          if (m3) {
            streams.push({
              title: label + " · Рус. дубляж",
              streamUrl: m3[0].replace(/\\u0026/g, "&"),
              headers: headers,
            });
          }
        }
      } catch (e) {}
    }

    const uniq = [];
    const seenKey = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s || !s.streamUrl) continue;
      if (
        s.streamUrl.indexOf(".m3u8") === -1 &&
        s.streamUrl.indexOf(".mp4") === -1 &&
        s.streamUrl.indexOf(".mpd") === -1
      ) {
        continue;
      }
      if (isEnglishAudio(s.title || "")) continue;
      const key = s.title + "|" + s.streamUrl;
      if (seenKey[key]) continue;
      seenKey[key] = true;
      uniq.push(s);
    }

    uniq.sort(function (a, b) {
      const an = a.title || "";
      const bn = b.title || "";
      const ap = an.indexOf("Смотреть") === 0 ? 0 : 1;
      const bp = bn.indexOf("Смотреть") === 0 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return isRussianPreferred(an) ? -1 : 1;
    });

    return JSON.stringify({
      streams: uniq.slice(0, 12),
      subtitles: subtitle || "",
    });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
