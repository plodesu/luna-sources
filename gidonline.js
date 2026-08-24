/**
 * GidOnline RU – films & series for Sora / Luna
 * Site: https://gidonline.eu
 * v2.0.0 – Плеер 2 studio picker (HDRezka/WinMedia/…) + Russian-only audio
 */

const baseUrl = "https://gidonline.eu";
const TMDB_KEY = "ad301b7cc82ffe19273e55e4d4206885";
const TMDB_PROXY =
  "https://post-eosin.vercel.app/api/proxy?url=";

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
  if (!headers["User-Agent"]) {
    headers["User-Agent"] = defaultHeaders["User-Agent"];
  }
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

async function getJson(res) {
  if (!res) return null;
  try {
    if (typeof res.json === "function") return await res.json();
    const t = await getText(res);
    return JSON.parse(t);
  } catch (e) {
    return null;
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

function isEnglishAudio(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.indexOf("eng") !== -1 ||
    n.indexOf("original") !== -1 ||
    n.indexOf("оригинал") !== -1 ||
    n.indexOf("english") !== -1 ||
    n === "en" ||
    n.indexOf("eng.") !== -1
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
    n.indexOf("1win") !== -1 ||
    n.indexOf("kubik") !== -1 ||
    n.indexOf("newstudio") !== -1
  );
}

function getQualityWeight(title) {
  const t = String(title || "");
  if (t.indexOf("2160") !== -1 || t.indexOf("4K") !== -1) return 2160;
  if (t.indexOf("1080") !== -1) return 1080;
  if (t.indexOf("720") !== -1) return 720;
  if (t.indexOf("480") !== -1) return 480;
  if (t.indexOf("360") !== -1) return 360;
  return 0;
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
  const blockRe =
    /class="mainlink"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>[\s\S]*?<span>([^<]*)<\/span>/gi;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href] || href.indexOf(".html") === -1) continue;
    seen[href] = true;
    results.push({
      title: decodeHtml(m[4] || m[3] || ""),
      image: absUrl(m[2]),
      href: href,
    });
  }
  if (results.length === 0) {
    const simpleRe =
      /<a\s+href="((?:https?:\/\/gidonline\.eu)?\/\d+-[^"]+\.html)"[\s\S]{0,500}?alt="([^"]+)"/gi;
    while ((m = simpleRe.exec(html)) !== null) {
      const href = absUrl(m[1]);
      if (seen[href]) continue;
      seen[href] = true;
      results.push({
        title: decodeHtml(m[2]),
        image: "",
        href: href,
      });
    }
  }
}

async function tmdbTitleHints(keyword) {
  const hints = [];
  try {
    const api =
      "https://api.themoviedb.org/3/search/multi?api_key=" +
      TMDB_KEY +
      "&query=" +
      encodeURIComponent(keyword) +
      "&include_adult=false&language=ru-RU";
    const url = TMDB_PROXY + encodeURIComponent(api) + "&simple=true";
    const res = await soraFetch(url);
    const data = await getJson(res);
    if (!data || !data.results) return hints;
    for (let i = 0; i < data.results.length && i < 8; i++) {
      const r = data.results[i];
      if (r.media_type !== "movie" && r.media_type !== "tv") continue;
      const t = r.title || r.name || r.original_title || r.original_name;
      if (t) hints.push(t);
      const ot = r.original_title || r.original_name;
      if (ot && ot !== t) hints.push(ot);
    }
  } catch (e) {}
  return hints;
}

async function searchResults(keyword) {
  try {
    const rawKeyword = String(keyword || "").trim();
    const queries = buildSearchQueries(rawKeyword);
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
      if (results.length >= 25) break;
    }

    if (results.length < 5) {
      const hints = await tmdbTitleHints(cleanQuery(rawKeyword));
      for (let i = 0; i < hints.length && results.length < 25; i++) {
        if (queries.indexOf(hints[i]) !== -1) continue;
        const url =
          baseUrl +
          "/index.php?do=search&subaction=search&story=" +
          encodeURIComponent(hints[i]);
        const res = await soraFetch(url);
        const html = await getText(res);
        parseSearchHtml(html, results, seen);
      }
    }

    // Rank by title match quality (fixes wrong first result)
    const q = cleanQuery(rawKeyword).toLowerCase();
    const qWords = q.split(/\s+/).filter(function (w) {
      return w.length > 2;
    });
    function score(item) {
      const t = String(item.title || "").toLowerCase();
      let s = 0;
      if (t === q) s += 100;
      if (t.indexOf(q) !== -1) s += 50;
      for (let i = 0; i < qWords.length; i++) {
        if (t.indexOf(qWords[i]) !== -1) s += 10;
      }
      // prefer series label when user searches series-like terms
      if (/сериал|serial|season|s\d/i.test(rawKeyword) && /сериал|мультсериал/i.test(t))
        s += 20;
      if (/сериал|мультсериал/i.test(t) && qWords.length <= 2) s += 5;
      // penalize unrelated long titles with zero word hits
      if (s === 0) s -= 5;
      return s;
    }
    results.sort(function (a, b) {
      return score(b) - score(a);
    });
    // drop very bad matches if we have good ones
    const best = results.length ? score(results[0]) : 0;
    const filtered =
      best >= 10
        ? results.filter(function (r) {
            return score(r) >= 5;
          })
        : results;

    return JSON.stringify(filtered.slice(0, 15));
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
        /<div[^>]+class="[^"]*(?:description|full-text|fdesc)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ) ||
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
      html.match(/name="description"\s+content="([^"]+)"/i);
    if (descMatch) {
      description = decodeHtml(descMatch[1].replace(/<[^>]+>/g, " ")).slice(
        0,
        900
      );
    }
    let aliases = "N/A";
    const orig =
      html.match(/Оригинальное\s*название[:\s]*<\/[^>]+>\s*([^<]+)/i) ||
      html.match(/itemprop="alternativeHeadline"[^>]*>([^<]+)/i);
    if (orig) aliases = decodeHtml(orig[1]);
    let airdate = "N/A";
    const year =
      html.match(/(?:Год|year)[:\s]*<\/[^>]+>\s*(?:<[^>]+>)*\s*(\d{4})/i) ||
      html.match(/itemprop="dateCreated"[^>]*content="(\d{4})/i) ||
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

function findKinopoiskId(html) {
  const m =
    html.match(/[?&]kp=(\d+)/) ||
    html.match(/kinopoisk[^0-9]{0,20}(\d{3,8})/i) ||
    html.match(/data-kp=["']?(\d+)/i) ||
    html.match(/\/kp\/(\d+)/) ||
    html.match(/embed\/kp\/(\d+)/);
  return m ? m[1] : null;
}

function parseSeasonEpisode(url) {
  const s = (url.match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (url.match(/[?&#]e=(\d+)/i) || [])[1];
  return {
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null,
  };
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

function sortAudioNames(names) {
  const arr = (names || []).slice();
  arr.sort(function (a, b) {
    const ar = isRussianPreferred(a) ? 0 : isEnglishAudio(a) ? 2 : 1;
    const br = isRussianPreferred(b) ? 0 : isEnglishAudio(b) ? 2 : 1;
    return ar - br;
  });
  return arr;
}

function pushAudioStreams(out, playerName, hls, audioNames, headers) {
  if (!hls) return;
  let names = (audioNames || []).slice();
  names = names.filter(function (n) {
    return !isEnglishAudio(n);
  });
  const prefix = playerName || "Смотреть";
  out.push({
    title: prefix,
    streamUrl: hls,
    headers: headers,
    _names: names,
  });
}

function parseAudio0Tracks(master) {
  const tracks = [];
  const seen = {};
  const lines = String(master || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf("TYPE=AUDIO") === -1) continue;
    if (/failover/i.test(line)) continue;
    if (
      line.indexOf('GROUP-ID="audio0"') === -1 &&
      line.indexOf('GROUP-ID="audio"') === -1 &&
      line.indexOf("GROUP-ID=") !== -1
    ) {
      continue;
    }
    const uri = (line.match(/URI="([^"]+)"/) || [])[1];
    if (!uri || seen[uri]) continue;
    seen[uri] = true;
    tracks.push({
      name: (line.match(/NAME="([^"]+)"/) || [])[1] || "",
      lang: (line.match(/LANGUAGE="([^"]+)"/) || [])[1] || "",
      uri: uri,
    });
  }
  return tracks;
}

function rewriteMasterOneAudio(master, audioUri) {
  const lines = String(master || "").split(/\r?\n/);
  const out = ["#EXTM3U", "#EXT-X-VERSION:3"];
  out.push(
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="Default",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="' +
      audioUri +
      '"'
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
    if (/AUDIO="failover/i.test(line)) {
      i++;
      continue;
    }
    let inf = line.replace(/AUDIO="[^"]*"/, 'AUDIO="audio0"');
    if (inf.indexOf("AUDIO=") === -1) inf += ',AUDIO="audio0"';
    const url = (lines[i + 1] || "").trim();
    if (url && url.charAt(0) !== "#") {
      out.push(inf);
      out.push(url);
      i++;
    }
  }
  return out.join("\n") + "\n";
}

function toPlaylistDataUri(text) {
  try {
    if (typeof btoa === "function") {
      return "data:application/vnd.apple.mpegurl;base64," + btoa(text);
    }
  } catch (e) {}
  return (
    "data:application/vnd.apple.mpegurl;charset=utf-8," +
    encodeURIComponent(text)
  );
}

function studioTitle(playerName, studio) {
  const p = String(playerName || "");
  const s = String(studio || "Рус. дубляж");
  // Luna picker: Плеер 2 · HDRezka Studio
  if (/плеер/i.test(p)) return p + " · " + s;
  return "Плеер 2 · " + s;
}

async function expandAudioVariants(streams, headers) {
  const out = [];
  const cache = {};
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i];
    if (!s || !s.streamUrl) continue;
    const names = s._names;
    const isHls = /\.m3u8(\?|$)/i.test(s.streamUrl);
    if (!isHls) {
      if (!isEnglishAudio(s.title || "")) out.push(s);
      continue;
    }
    let master = cache[s.streamUrl];
    if (master === undefined) {
      try {
        const res = await soraFetch(s.streamUrl, {
          headers: Object.assign({}, headers, {
            Referer: "https://api.embess.ws/",
            Origin: "https://api.embess.ws",
          }),
        });
        const t = await getText(res);
        master = t && t.indexOf("#EXTM3U") !== -1 ? t : "";
      } catch (e) {
        master = "";
      }
      cache[s.streamUrl] = master;
    }
    if (!master) {
      if (!isEnglishAudio(s.title || "")) {
        out.push({
          title: studioTitle(s.title, "Рус. дубляж"),
          streamUrl: s.streamUrl,
          headers: s.headers || headers,
        });
      }
      continue;
    }
    const tracks = parseAudio0Tracks(master);
    const labelList =
      names && names.length
        ? names
        : tracks.map(function (tr, idx) {
            return tr.lang === "en" ? "Eng" : "Рус " + (idx + 1);
          });
    let added = 0;
    const n = Math.max(labelList.length, tracks.length);
    for (let k = 0; k < n; k++) {
      const label = labelList[k] || tracks[k] && tracks[k].name || "";
      const track = tracks[k] || tracks[0];
      if (!track) continue;
      if (isEnglishAudio(label) || (track.lang || "").toLowerCase() === "en")
        continue;
      const playlist = rewriteMasterOneAudio(master, track.uri);
      out.push({
        title: studioTitle(s.title, label || "Рус. дубляж"),
        streamUrl: toPlaylistDataUri(playlist),
        headers: s.headers || headers,
      });
      added++;
    }
    if (added === 0 && tracks[0]) {
      const playlist = rewriteMasterOneAudio(master, tracks[0].uri);
      out.push({
        title: studioTitle(s.title, "Рус. дубляж"),
        streamUrl: toPlaylistDataUri(playlist),
        headers: s.headers || headers,
      });
    }
  }
  return out;
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

  const dashMatch = html.match(/dash\s*:\s*"([^"]+\.mpd[^"]*)"/);
  if (dashMatch && (!audioNames || !audioNames.length)) {
    out.push({
      title: (playerName || "Смотреть") + " · DASH",
      streamUrl: dashMatch[1].replace(/\\u0026/g, "&"),
      headers: headers,
    });
  }

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

function parsePagePlayers(html) {
  const players = [];
  const tabs = [];
  const tabRe = /<li[^>]*>\s*<h2>([^<]+)<\/h2>/gi;
  let m;
  while ((m = tabRe.exec(html)) !== null) {
    const name = decodeHtml(m[1]);
    if (name) tabs.push(name);
  }
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  const iframes = [];
  while ((m = iframeRe.exec(html)) !== null) {
    let src = absUrl(m[1].replace(/&amp;/g, "&"));
    if (!src) continue;
    if (/youtube\.com|youtu\.be/i.test(src)) continue;
    iframes.push(src);
  }
  const n = Math.max(tabs.length, iframes.length);
  for (let i = 0; i < n; i++) {
    const name = tabs[i] || "Плеер " + (i + 1);
    const src = iframes[i] || null;
    if (!src) continue;
    players.push({ name: name, src: src });
  }
  return players;
}

async function fetchPlayerStreams(player, season, episode, out) {
  try {
    const res = await soraFetch(player.src, {
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
      },
    });
    const html = await getText(res);
    if (!html || html.length < 50) return "";
    const before = out.length;
    let sub = parseSeasonsPlayer(
      html,
      player.name,
      season,
      episode,
      out
    );
    if (out.length === before) {
      sub = parseMakePlayerMovie(html, player.name, out) || sub;
    }
    return sub || "";
  } catch (e) {
    return "";
  }
}

async function extractEpisodes(url) {
  try {
    const res = await soraFetch(url);
    const html = await getText(res);
    const eps = [];
    const seen = {};

    const epRe =
      /data-(?:season|s)=["']?(\d+)["']?[^>]*data-(?:episode|e)=["']?(\d+)["']?/gi;
    let m;
    while ((m = epRe.exec(html)) !== null) {
      const key = m[1] + "-" + m[2];
      if (seen[key]) continue;
      seen[key] = true;
      const s = parseInt(m[1], 10);
      const e = parseInt(m[2], 10);
      eps.push({
        href: url + (url.indexOf("?") >= 0 ? "&" : "?") + "s=" + s + "&e=" + e,
        number: e,
        season: s,
        title: "S" + s + "E" + e,
      });
    }

    if (eps.length === 0) {
      const kp = findKinopoiskId(html);
      if (kp) {
        try {
          const er = await soraFetch(
            "https://api.embess.ws/embed/kp/" + kp + "?host=gidonline.eu"
          );
          const eh = await getText(er);
          const seasons = extractSeasonsArray(eh);
          if (seasons) {
            for (let si = 0; si < seasons.length; si++) {
              const season = seasons[si];
              const sn = season.season || si + 1;
              const episodes = season.episodes || [];
              for (let ei = 0; ei < episodes.length; ei++) {
                const ep = episodes[ei];
                const en = parseInt(ep.episode || ei + 1, 10);
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

    const players = parsePagePlayers(html);
    const kp = findKinopoiskId(html);

    const jobs = [];
    const jobSeen = {};
    function addJob(name, src) {
      if (!src || jobSeen[src]) return;
      if (/youtube|youtu\.be|newplayjj/i.test(src)) return;
      jobSeen[src] = true;
      jobs.push({ name: name, src: src });
    }
    for (let i = 0; i < players.length; i++) {
      addJob(players[i].name, players[i].src);
    }
    if (kp) {
      const embessBase =
        "https://api.embess.ws/embed/kp/" + kp + "?host=gidonline.eu";
      addJob("Смотреть", embessBase);
      if (se.season && se.episode) {
        addJob(
          "Смотреть",
          embessBase + "&s=" + se.season + "&e=" + se.episode
        );
      } else {
        addJob("Смотреть", embessBase + "&s=1&e=1");
      }
    }

    for (let i = 0; i < jobs.length; i++) {
      try {
        const er = await soraFetch(jobs[i].src, {
          headers: Object.assign({}, headers, { Referer: pageUrl }),
        });
        const eh = await getText(er);
        if (!eh || eh.length < 80) continue;

        const before = streams.length;
        let sub = parseSeasonsPlayer(
          eh,
          jobs[i].name,
          se.season || 1,
          se.episode || 1,
          streams
        );
        if (streams.length === before) {
          sub = parseMakePlayerMovie(eh, jobs[i].name, streams) || sub;
        }
        if (sub && !subtitle) subtitle = sub;

        // if seasons exist but still empty, dump first available episode
        if (streams.length === before && eh.indexOf("seasons:") !== -1) {
          const seasons = extractSeasonsArray(eh);
          if (seasons && seasons.length) {
            const s0 = seasons[0];
            const sn = s0.season || 1;
            const eps = s0.episodes || [];
            if (eps.length) {
              const ep = eps[0];
              const en = parseInt(ep.episode || 1, 10);
              let hls = ep.hls || "";
              if (hls) {
                hls = String(hls).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
                let names = [];
                if (ep.audio && ep.audio.names) names = ep.audio.names;
                pushAudioStreams(
                  streams,
                  jobs[i].name + " S" + sn + "E" + en,
                  hls,
                  names,
                  headers
                );
              }
            }
          }
        }
      } catch (e) {}
    }

    const expanded = await expandAudioVariants(streams, headers);

    const uniq = [];
    const seenKey = {};
    for (let i = 0; i < expanded.length; i++) {
      const s = expanded[i];
      if (!s || !s.streamUrl) continue;
      if (isEnglishAudio(s.title || "")) continue;
      const key = s.title + "|" + s.streamUrl.slice(0, 80);
      if (seenKey[key]) continue;
      seenKey[key] = true;
      uniq.push({
        title: s.title,
        streamUrl: s.streamUrl,
        headers: s.headers || headers,
      });
    }

    uniq.sort(function (a, b) {
      const an = a.title || "";
      const bn = b.title || "";
      const ap = an.indexOf("Смотреть") === 0 ? 0 : 1;
      const bp = bn.indexOf("Смотреть") === 0 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const ar = isRussianPreferred(an) ? 0 : 1;
      const br = isRussianPreferred(bn) ? 0 : 1;
      if (ar !== br) return ar - br;
      return getQualityWeight(bn) - getQualityWeight(an);
    });

    return JSON.stringify({
      streams: uniq.slice(0, 15),
      subtitles: subtitle || "",
    });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
