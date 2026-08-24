/**
 * GidOnline RU – films & series for Sora / Luna
 * Site: https://gidonline.eu
 * v1.5.0 – all players (Смотреть, Плеер 2, …) + audio tracks
 */

const baseUrl = "https://gidonline.eu";

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
  return queries.slice(0, 4);
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
      if (results.length >= 12) break;
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
      const linkRe =
        /href="([^"]+)"[^>]*>\s*(?:Сезон\s*)?(\d+)\s*(?:серия|эпизод|e|E)\s*(\d+)/gi;
      while ((m = linkRe.exec(html)) !== null) {
        const key = m[2] + "-" + m[3];
        if (seen[key]) continue;
        seen[key] = true;
        eps.push({
          href: absUrl(m[1]),
          number: parseInt(m[3], 10),
          season: parseInt(m[2], 10),
          title: "S" + m[2] + "E" + m[3],
        });
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

function parseMakePlayer(html, playerName, out) {
  if (!html || html.indexOf("makePlayer") === -1) return "";

  let audioNames = [];
  const audioMatch = html.match(/audio\s*:\s*\{\s*"names"\s*:\s*(\[[^\]]+\])/);
  if (audioMatch) {
    try {
      audioNames = JSON.parse(audioMatch[1]);
    } catch (e) {
      try {
        audioNames = JSON.parse(audioMatch[1].replace(/'/g, '"'));
      } catch (e2) {}
    }
  }

  let hls = null;
  const hlsMatch =
    html.match(/hls\s*:\s*"([^"]+\.m3u8[^"]*)"/) ||
    html.match(/hls\s*:\s*'([^']+\.m3u8[^']*)'/);
  if (hlsMatch) {
    hls = hlsMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }

  let dash = null;
  const dashMatch =
    html.match(/dash\s*:\s*"([^"]+\.mpd[^"]*)"/) ||
    html.match(/dash\s*:\s*'([^']+\.mpd[^']*)'/);
  if (dashMatch) {
    dash = dashMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }

  let subUrl = "";
  const ccUrl = html.match(/"url"\s*:\s*"(https?:\/\/[^"]+\.vtt[^"]*)"/);
  if (ccUrl) subUrl = ccUrl[1].replace(/\\u0026/g, "&");

  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: baseUrl + "/",
  };
  const prefix = playerName || "Плеер";

  if (hls) {
    if (audioNames && audioNames.length > 0) {
      for (let i = 0; i < audioNames.length; i++) {
        out.push({
          title: prefix + " · " + String(audioNames[i]),
          streamUrl: hls,
          headers: headers,
        });
      }
    } else {
      out.push({
        title: prefix + " · HLS",
        streamUrl: hls,
        headers: headers,
      });
    }
  }

  if (dash) {
    out.push({
      title: prefix + " · DASH",
      streamUrl: dash,
      headers: headers,
    });
  }

  return subUrl;
}

function collectRawStreams(text, out, titlePrefix) {
  if (!text) return;
  const seen = {};
  const re = /https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let u = m[0]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\/g, "")
      .replace(/[),;]+$/, "");
    if (seen[u]) continue;
    seen[u] = true;
    out.push({
      title: (titlePrefix || "HLS") + " · Stream",
      streamUrl: u,
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
      },
    });
  }
}

async function fetchPlayerStreams(player, out) {
  const name = player.name;
  const src = player.src;
  try {
    const res = await soraFetch(src, {
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
      },
    });
    const html = await getText(res);
    if (!html || html.length < 50) return "";
    const before = out.length;
    const sub = parseMakePlayer(html, name, out);
    if (out.length === before) {
      collectRawStreams(html, out, name);
    }
    return sub || "";
  } catch (e) {
    return "";
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

    const players = parsePagePlayers(html);
    for (let i = 0; i < players.length; i++) {
      const sub = await fetchPlayerStreams(players[i], streams);
      if (sub && !subtitle) subtitle = sub;
    }

    const kp = findKinopoiskId(html);
    if (kp && streams.length === 0) {
      const embessList = [
        {
          name: "Смотреть",
          src: "https://api.embess.ws/embed/kp/" + kp + "?host=gidonline.eu",
        },
        { name: "Плеер 2", src: "https://api.embess.ws/embed/kp/" + kp },
      ];
      if (se.season && se.episode) {
        embessList.push({
          name: "Смотреть",
          src:
            "https://api.embess.ws/embed/kp/" +
            kp +
            "?host=gidonline.eu&s=" +
            se.season +
            "&e=" +
            se.episode,
        });
      }
      for (let i = 0; i < embessList.length; i++) {
        const sub = await fetchPlayerStreams(embessList[i], streams);
        if (sub && !subtitle) subtitle = sub;
      }
    }

    if (kp) {
      try {
        const er = await soraFetch(
          "https://api.embess.ws/embed/kp/" + kp + "?host=gidonline.eu"
        );
        const eh = await getText(er);
        if (eh && eh.indexOf("makePlayer") !== -1) {
          let hasNamed = false;
          for (let i = 0; i < streams.length; i++) {
            if (streams[i].title && streams[i].title.indexOf(" · ") !== -1) {
              hasNamed = true;
              break;
            }
          }
          if (!hasNamed) {
            const sub = parseMakePlayer(eh, "Смотреть", streams);
            if (sub && !subtitle) subtitle = sub;
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
        s.streamUrl.indexOf(".mpd") === -1 &&
        s.streamUrl.indexOf("/hls") === -1
      ) {
        continue;
      }
      const key = s.title + "|" + s.streamUrl;
      if (seenKey[key]) continue;
      seenKey[key] = true;
      uniq.push(s);
    }

    return JSON.stringify({
      streams: uniq.slice(0, 20),
      subtitles: subtitle || "",
    });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
