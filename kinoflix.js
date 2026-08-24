/**
 * Kinoflix – films & series for Sora / Luna
 * Site: https://kinoflix.tv
 * v1.1.0 – Russian-only streams (strip EN/KA), RU HLS rewrite
 */

const baseUrl = "https://kinoflix.tv";

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

async function getJson(res) {
  if (!res) return null;
  try {
    if (typeof res.json === "function") return await res.json();
    return JSON.parse(await getText(res));
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
  add(base.replace(/&/g, " "));
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length >= 1) add(words[0]);
  const low = base.toLowerCase();
  const aliases = {
    simpsons: "Симпсоны",
    "the simpsons": "Симпсоны",
    "the rookie": "Новобранец",
    rookie: "Новобранец",
    minions: "Миньоны",
    reacher: "Ричер",
    friends: "Друзья",
    "breaking bad": "Во все тяжкие",
    witcher: "Ведьмак",
  };
  for (const k in aliases) {
    if (low.indexOf(k) !== -1) add(aliases[k]);
  }
  return queries.slice(0, 4);
}

function parseSearchHtml(html, results, seen) {
  if (!html) return;
  // title="RU / EN" href=movie|serial
  const re =
    /href="(https?:\/\/kinoflix\.tv\/(?:movie|serial)\/\d+\/[^"]+)"[^>]*title="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen[href]) continue;
    seen[href] = true;
    const title = decodeHtml(m[2].split(" / ")[0] || m[2]);
    results.push({ title: title, image: "", href: href });
  }
  // alternate card structure
  const re2 =
    /href="(https?:\/\/kinoflix\.tv\/(?:movie|serial)\/\d+\/[^"]+)"[\s\S]{0,200}?<p>([^<]+)<\/p>/gi;
  while ((m = re2.exec(html)) !== null) {
    const href = m[1];
    if (seen[href]) continue;
    seen[href] = true;
    results.push({ title: decodeHtml(m[2]), image: "", href: href });
  }
  // fill images
  for (let i = 0; i < results.length; i++) {
    const id = (results[i].href.match(/\/(movie|serial)\/(\d+)\//) || [])[2];
    if (!id) continue;
    const imgRe = new RegExp(
      hrefEscape(results[i].href) +
        '[\\s\\S]{0,400}?(?:src|data-src)="([^"]+\\.(?:jpg|webp|png)[^"]*)"',
      "i"
    );
    // simpler: poster near id
    const near = html.match(
      new RegExp(
        "movie/" +
          id +
          "[\\s\\S]{0,500}?images\\.kinoflix\\.tv[^\"']+",
        "i"
      )
    );
  }
}

function hrefEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rankResults(results, rawKeyword) {
  const q = cleanQuery(rawKeyword).toLowerCase();
  const qWords = q.split(/\s+/).filter(function (w) {
    return w.length > 2;
  });
  function score(item) {
    const t = String(item.title || "").toLowerCase();
    const h = String(item.href || "").toLowerCase();
    let s = 0;
    if (t === q) s += 100;
    if (t.indexOf(q) !== -1) s += 50;
    if (h.indexOf(q.replace(/\s+/g, "-")) !== -1) s += 30;
    for (let i = 0; i < qWords.length; i++) {
      if (t.indexOf(qWords[i]) !== -1) s += 10;
      if (h.indexOf(qWords[i]) !== -1) s += 5;
    }
    if (/serial|сериал|season/i.test(rawKeyword) && h.indexOf("/serial/") !== -1)
      s += 15;
    if (s === 0) s -= 5;
    return s;
  }
  results.sort(function (a, b) {
    return score(b) - score(a);
  });
  const best = results.length ? score(results[0]) : 0;
  if (best >= 10) {
    return results.filter(function (r) {
      return score(r) >= 5;
    });
  }
  return results;
}

async function searchResults(keyword) {
  try {
    const raw = String(keyword || "").trim();
    const queries = buildSearchQueries(raw);
    if (!queries.length) return JSON.stringify([]);

    const results = [];
    const seen = {};

    for (let i = 0; i < queries.length; i++) {
      const q = encodeURIComponent(queries[i]);
      const urls = [
        baseUrl + "/filter-movies?type=search&search=" + q,
        baseUrl + "/filter-movies?type=movie&search=" + q,
        baseUrl + "/filter-movies?type=serial&search=" + q,
      ];
      for (let j = 0; j < urls.length; j++) {
        const res = await soraFetch(urls[j]);
        const html = await getText(res);
        parseSearchHtml(html, results, seen);
      }
      if (results.length >= 20) break;
    }

    return JSON.stringify(rankResults(results, raw).slice(0, 15));
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
    const desc =
      html.match(/name="description"\s+content="([^"]+)"/i) ||
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
      html.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (desc) {
      description = decodeHtml(desc[1].replace(/<[^>]+>/g, " ")).slice(0, 900);
    }
    let aliases = "N/A";
    const title = html.match(/title="([^"]+\/[^"]+)"/);
    if (title && title[1].indexOf(" / ") !== -1) {
      aliases = decodeHtml(title[1].split(" / ")[1] || "");
    }
    let airdate = "N/A";
    const year = html.match(/\b(19|20)\d{2}\b/);
    if (year) airdate = year[0];
    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
    ]);
  } catch (err) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

function parseSeasonEpisode(url) {
  const s = (url.match(/[?&#]s=(\d+)/i) || url.match(/[?&#]season=(\d+)/i) || [])[1];
  const e = (url.match(/[?&#]e=(\d+)/i) || url.match(/[?&#]episode=(\d+)/i) || [])[1];
  return {
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null,
  };
}

function findVideodbId(html, isSerial) {
  if (isSerial) {
    const m =
      html.match(/type=serial&id=(\d+)/) ||
      html.match(/splayer\.php\?[^"']*id=(\d+)/);
    return m ? m[1] : null;
  }
  const m =
    html.match(/type=movie&id=(\d+)/) ||
    html.match(/player\.php\?[^"']*id=(\d+)/);
  return m ? m[1] : null;
}

function fixHlsUrl(u) {
  if (!u) return u;
  u = String(u).replace(/\\u0026/g, "&");
  // master.txt often blocked → prefer cdn*.online master.m3u8
  const hm = u.match(/\/cdn\/hls\/([a-f0-9]+)\//i);
  if (hm) {
    return (
      "https://cdn3-videodb.online/cdn/down/" +
      hm[1] +
      "/master.m3u8"
    );
  }
  if (u.indexOf("master.txt") !== -1) {
    return u.replace("master.txt", "master.m3u8").replace(
      "videodb.stream/cdn/hls/",
      "cdn3-videodb.online/cdn/down/"
    );
  }
  return u;
}

/**
 * Parse playerjs-style file string:
 * [HD]{რუსულად}https://...RUS.mp4;{ინგლისურად}https://...ENG.mp4;,[SD]...
 * Prefer Russian tracks.
 */
function isRussianLabel(label, url) {
  const l = String(label || "");
  const u = String(url || "");
  // Georgian "რუსულად" = Russian; also RUS in filename
  if (/_ENG\.|\/ENG|_GEO\.|\/GEO|english|ინგლ|ქართ/i.test(u) && !/_RUS\.|\/RUS|_RU\./i.test(u))
    return false;
  if (/_RUS\.|\/RUS|_RU\.|rus/i.test(u)) return true;
  if (/რუს|рус|russian|\bru\b/i.test(l)) return true;
  if (/ინგლ|eng|english|англ|ქართ|geo|ka\b/i.test(l)) return false;
  return false;
}

function parseLangFileString(fileStr, out, baseTitle, headers) {
  if (!fileStr) return;
  const parts = String(fileStr).split(/,(?=\[)/);
  const seen = {};
  for (let p = 0; p < parts.length; p++) {
    const chunk = parts[p];
    const quality = (chunk.match(/^\[([^\]]+)\]/) || [])[1] || "HD";
    const pairRe = /\{([^}]+)\}(https?:\/\/[^\s;]+)/g;
    let m;
    let any = false;
    while ((m = pairRe.exec(chunk)) !== null) {
      any = true;
      const label = m[1];
      let url = m[2].replace(/;+$/, "");
      // ONLY Russian – drop English / Georgian completely
      if (!isRussianLabel(label, url)) continue;
      if (seen[url]) continue;
      seen[url] = true;
      out.push({
        title: baseTitle + " · " + quality + " · RU",
        streamUrl: url,
        headers: headers,
      });
    }
    // no labels: only keep if filename looks Russian
    if (!any) {
      const plain = chunk.match(/https?:\/\/[^\s;,]+/);
      if (plain && isRussianLabel("", plain[0])) {
        const url = plain[0].replace(/;+$/, "");
        if (!seen[url]) {
          seen[url] = true;
          out.push({
            title: baseTitle + " · " + quality + " · RU",
            streamUrl: url,
            headers: headers,
          });
        }
      }
    }
  }
}

/** Fetch master.m3u8 and rebuild with ONLY Russian audio as default */
async function buildRussianOnlyHls(masterUrl, headers) {
  try {
    const res = await soraFetch(masterUrl, { headers: headers });
    const text = await getText(res);
    if (!text || text.indexOf("#EXTM3U") === -1) return null;

    // base path for relative URIs
    const base = masterUrl.replace(/\/[^\/]*$/, "/");
    const lines = text.split(/\r?\n/);
    let ruAudioLine = null;
    const streamLines = []; // pairs of INF + url

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.indexOf("TYPE=AUDIO") !== -1 && /LANGUAGE="ru"|NAME="Russian"/i.test(line)) {
        let uri = (line.match(/URI="([^"]+)"/) || [])[1];
        if (uri && uri.indexOf("http") !== 0) uri = base + uri;
        ruAudioLine =
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Russian",LANGUAGE="ru",DEFAULT=YES,AUTOSELECT=YES,URI="' +
          uri +
          '"';
      }
      if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
        const next = lines[i + 1] || "";
        let vurl = next.trim();
        if (vurl && vurl.indexOf("http") !== 0) vurl = base + vurl;
        // force AUDIO="audio"
        let inf = line.replace(/AUDIO="[^"]*"/, 'AUDIO="audio"');
        if (inf.indexOf("AUDIO=") === -1) inf += ',AUDIO="audio"';
        streamLines.push({ inf: inf, url: vurl });
      }
    }

    if (!ruAudioLine || !streamLines.length) return null;

    // Prefer 1080 / 720
    streamLines.sort(function (a, b) {
      const aw = /1080/.test(a.url) ? 3 : /720/.test(a.url) ? 2 : /480/.test(a.url) ? 1 : 0;
      const bw = /1080/.test(b.url) ? 3 : /720/.test(b.url) ? 2 : /480/.test(b.url) ? 1 : 0;
      return bw - aw;
    });

    let out = "#EXTM3U\n#EXT-X-VERSION:6\n" + ruAudioLine + "\n";
    for (let i = 0; i < Math.min(streamLines.length, 3); i++) {
      out += streamLines[i].inf + "\n" + streamLines[i].url + "\n";
    }

    // data URI so player gets RU-only master (blob links are local-only, unusable)
    try {
      if (typeof btoa === "function") {
        return "data:application/vnd.apple.mpegurl;base64," + btoa(out);
      }
    } catch (e) {}
    // fallback: return best absolute 1080 playlist + hope (still multi-audio)
    return streamLines[0] ? streamLines[0].url : null;
  } catch (e) {
    return null;
  }
}

async function fetchPlaylist(type, vidId) {
  const url =
    "https://videodb.stream/file/play?type=" +
    type +
    "&id=" +
    vidId +
    "&lang=ru&p=l.playlist";
  const res = await soraFetch(url, {
    headers: {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://videodb.stream/",
      Origin: "https://videodb.stream",
    },
  });
  return await getJson(res);
}

async function extractEpisodes(url) {
  try {
    const isSerial = String(url).indexOf("/serial/") !== -1;
    if (!isSerial) {
      return JSON.stringify([
        { href: url, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const res = await soraFetch(url);
    const html = await getText(res);
    const vidId = findVideodbId(html, true);
    if (!vidId) {
      return JSON.stringify([
        { href: url, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const data = await fetchPlaylist("serial", vidId);
    const eps = [];
    const seen = {};
    if (Array.isArray(data)) {
      for (let si = 0; si < data.length; si++) {
        const season = data[si];
        const sn =
          parseInt(String(season.title || "").replace(/\D/g, ""), 10) ||
          si + 1;
        const folder = season.folder || [];
        for (let ei = 0; ei < folder.length; ei++) {
          const ep = folder[ei];
          const en =
            parseInt(String(ep.id || "").split("-").pop(), 10) ||
            parseInt(String(ep.title || "").replace(/\D/g, ""), 10) ||
            ei + 1;
          const key = sn + "-" + en;
          if (seen[key]) continue;
          seen[key] = true;
          eps.push({
            href:
              url.split("?")[0] +
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

    if (eps.length) {
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
    const isSerial = pageUrl.indexOf("/serial/") !== -1;

    const res = await soraFetch(pageUrl);
    const html = await getText(res);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const vidId = findVideodbId(html, isSerial);
    if (!vidId) return JSON.stringify({ streams: [], subtitles: "" });

    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://videodb.stream/",
      Origin: "https://videodb.stream",
    };

    const streams = [];
    let subtitle = "";

    const data = await fetchPlaylist(isSerial ? "serial" : "movie", vidId);

    if (isSerial && Array.isArray(data)) {
      const targetS = se.season || 1;
      const targetE = se.episode || 1;
      let found = false;
      for (let si = 0; si < data.length; si++) {
        const season = data[si];
        const sn =
          parseInt(String(season.title || "").replace(/\D/g, ""), 10) ||
          si + 1;
        if (sn !== targetS) continue;
        const folder = season.folder || [];
        for (let ei = 0; ei < folder.length; ei++) {
          const ep = folder[ei];
          const en =
            parseInt(String(ep.id || "").split("-").pop(), 10) ||
            parseInt(String(ep.title || "").replace(/\D/g, ""), 10) ||
            ei + 1;
          if (en !== targetE) continue;
          found = true;
          parseLangFileString(
            ep.file,
            streams,
            "S" + sn + "E" + en,
            headers
          );
          break;
        }
        if (found) break;
      }
      // fallback first episode
      if (!found && data[0] && data[0].folder && data[0].folder[0]) {
        const ep = data[0].folder[0];
        parseLangFileString(ep.file, streams, "S1E1", headers);
      }
    } else if (Array.isArray(data) && data[0] && data[0].file) {
      // movie: rebuild HLS with ONLY Russian audio (no EN/KA)
      let file = fixHlsUrl(data[0].file);
      const ruOnly = await buildRussianOnlyHls(file, headers);
      streams.push({
        title: "Смотреть · RU",
        streamUrl: ruOnly || file,
        headers: headers,
      });
      // skip English subtitles if that's all they offer as "default"
      if (data[0].subtitles && data[0].subtitles.length) {
        for (let si = 0; si < data[0].subtitles.length; si++) {
          const lab = String(data[0].subtitles[si].label || "").toLowerCase();
          if (/ru|рус|russian/.test(lab) && data[0].subtitles[si].file) {
            subtitle = data[0].subtitles[si].file;
            break;
          }
        }
      }
    }

    // dedupe, prefer RU titles
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s.streamUrl || seen[s.streamUrl]) continue;
      seen[s.streamUrl] = true;
      uniq.push(s);
    }
    uniq.sort(function (a, b) {
      const ar = /RU|рус/i.test(a.title) ? 0 : 1;
      const br = /RU|рус/i.test(b.title) ? 0 : 1;
      return ar - br;
    });

    return JSON.stringify({
      streams: uniq.slice(0, 12),
      subtitles: subtitle || "",
    });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
