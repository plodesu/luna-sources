/**
 * GidOnline.NET – Sora / Luna
 * https://gidonline.net | ortified only
 * v3.3.0
 */

const baseUrl = "https://gidonline.net";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

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
      if (typeof res.content === "string") return res.content;
    }
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
  u = String(u).replace(/&amp;/g, "&").trim();
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
    n.indexOf("укр") !== -1 ||
    n === "en"
  );
}

function parseSeasonEpisode(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return {
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null,
  };
}

function buildSearchQueries(keyword) {
  const base = cleanQuery(keyword);
  if (!base) return [];
  const queries = [];
  const add = function (q) {
    q = String(q || "").replace(/\s+/g, " ").trim();
    if (q && queries.indexOf(q) === -1) queries.push(q);
  };
  add(base);
  add(base.replace(/\s+/g, "-"));
  add(base.replace(/-/g, " "));
  const words = base.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    add(words[0] + " " + words[1]);
    add(words[0] + "-" + words[1]);
  }
  if (words.length >= 1) add(words[0]);
  const low = base.toLowerCase();
  const aliases = {
    simpsons: "Симпсоны",
    minions: "Миньоны",
    "minions & monsters": "Миньоны и монстры",
    "minions and monsters": "Миньоны и монстры",
    reacher: "Ричер",
    naruto: "Наруто",
    mutiny: "Мятеж",
    rookie: "Новобранец",
    "spider-man": "Человек-паук",
    "spider man": "Человек-паук",
    spiderman: "Человек-паук",
    "человек паук": "Человек-паук",
  };
  for (const k in aliases) {
    if (low.indexOf(k) !== -1) add(aliases[k]);
  }
  return queries.slice(0, 8);
}

function parseSearchHtml(html, results, seen) {
  if (!html) return;
  let m;
  const reA =
    /<a[^>]+href="((?:https?:\/\/gidonline\.net)?\/[a-z0-9\-]+\/\d+-[^"]+\.html)"[^>]*title="([^"]+)"/gi;
  while ((m = reA.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href]) continue;
    seen[href] = true;
    results.push({ title: decodeHtml(m[2]), image: "", href: href });
  }
  const reB =
    /title="([^"]+)"[^>]*href="((?:https?:\/\/gidonline\.net)?\/[a-z0-9\-]+\/\d+-[^"]+\.html)"/gi;
  while ((m = reB.exec(html)) !== null) {
    const href = absUrl(m[2]);
    if (!href || seen[href]) continue;
    seen[href] = true;
    results.push({ title: decodeHtml(m[1]), image: "", href: href });
  }
  const reC =
    /<h2[^>]*>\s*<a[^>]+href="((?:https?:\/\/gidonline\.net)?\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
  while ((m = reC.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href]) continue;
    seen[href] = true;
    results.push({ title: decodeHtml(m[2]), image: "", href: href });
  }
  const reImg =
    /href="((?:https?:\/\/gidonline\.net)?\/[^"]+\.html)"[\s\S]{0,600}?(?:data-src|src)="(\/uploads\/[^"]+)"/gi;
  while ((m = reImg.exec(html)) !== null) {
    const href = absUrl(m[1]);
    for (let i = 0; i < results.length; i++) {
      if (results[i].href === href && !results[i].image) {
        results[i].image = absUrl(m[2]);
      }
    }
  }
}

function pushStream(out, title, url, headers) {
  if (!url) return;
  url = String(url).replace(/\\u0026/g, "&").replace(/\\\//g, "/").trim();
  if (!/^https?:\/\//i.test(url)) return;
  if (url.indexOf(".m3u8") === -1 && url.indexOf(".mp4") === -1) return;
  out.push({
    title: title || "Смотреть",
    streamUrl: url,
    headers: headers || {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://gidonline.net/",
    },
  });
}

function pushAudioStreams(out, playerName, hls, audioNames, headers) {
  if (!hls) return;
  const names = Array.isArray(audioNames) ? audioNames : [];
  const ru = names.filter(function (n) {
    return !isEnglishAudio(n);
  });
  const label =
    ru.length > 0 ? ru[0] : "Рус. дубляж";
  pushStream(out, (playerName || "Смотреть") + " · " + label, hls, headers);
}

function findEpisodeStream(html, season, episode) {
  if (!html) return null;
  const en = episode || 1;
  const re = new RegExp(
    '"episode"\\s*:\\s*"?' + en + '"?[\\s\\S]{0,2500}?"hls"\\s*:\\s*"([^"]+)"'
  );
  const m = String(html).match(re);
  if (!m) return null;
  let hls = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  let names = [];
  const block = String(html).substring(m.index, m.index + 2500);
  const am = block.match(/"names"\s*:\s*(\[[^\]]*\])/);
  if (am) {
    try {
      names = JSON.parse(am[1]);
    } catch (e) {}
  }
  return { hls: hls, names: names };
}

function listEpisodesLight(html, pageUrl) {
  const eps = [];
  const seen = {};
  if (!html || html.indexOf("seasons:") === -1) return eps;
  const parts = String(html).split(/"season"\s*:\s*/);
  for (let p = 1; p < parts.length; p++) {
    const sn = parseInt(parts[p], 10);
    if (!sn) continue;
    const re = /"episode"\s*:\s*"?(\d+)"?/g;
    let m;
    while ((m = re.exec(parts[p])) !== null) {
      const en = parseInt(m[1], 10);
      if (!en) continue;
      const key = sn + "-" + en;
      if (seen[key]) continue;
      seen[key] = true;
      const base = String(pageUrl).split("?")[0];
      eps.push({
        href: base + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }
  }
  eps.sort(function (a, b) {
    if (a.season !== b.season) return a.season - b.season;
    return a.number - b.number;
  });
  return eps;
}

function parseMakePlayerMovie(html, playerName, out) {
  if (!html || html.indexOf("seasons:") !== -1) return;
  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: "https://gidonline.net/",
  };
  let audioNames = [];
  const audioMatch = html.match(/audio\s*:\s*\{\s*"names"\s*:\s*(\[[^\]]+\])/);
  if (audioMatch) {
    try {
      audioNames = JSON.parse(audioMatch[1]);
    } catch (e) {}
  }
  let hls = null;
  const urls = html.match(/https?:\/\/[^"'\\\s]+master\.m3u8[^"'\\\s]*/g);
  if (urls && urls.length) {
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i].replace(/\\u0026/g, "&");
      if (u.indexOf("interkh") !== -1 || u.indexOf("showvid") !== -1) {
        hls = u;
        break;
      }
    }
    if (!hls) hls = urls[0].replace(/\\u0026/g, "&");
  }
  if (!hls) {
    const hlsMatch = html.match(/hls\s*:\s*"([^"]+\.m3u8[^"]*)"/);
    if (hlsMatch)
      hls = hlsMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }
  if (hls) pushAudioStreams(out, playerName || "Смотреть", hls, audioNames, headers);
}

function parseSeasonsPlayer(html, playerName, season, episode, out) {
  if (!html || html.indexOf("seasons:") === -1) return;
  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: "https://gidonline.net/",
  };
  const found = findEpisodeStream(html, season || 1, episode || 1);
  if (found && found.hls) {
    pushAudioStreams(
      out,
      (playerName || "Смотреть") +
        " S" +
        (season || 1) +
        "E" +
        (episode || 1),
      found.hls,
      found.names,
      headers
    );
  }
}

function findOrtifiedEmbeds(html) {
  const out = [];
  const seen = {};
  if (!html) return out;
  const re =
    /(?:data-src|src)=["']((?:https?:)?\/\/api\.ortified\.ws\/embed\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = absUrl(m[1].replace(/&amp;/g, "&"));
    if (!src || seen[src]) continue;
    seen[src] = true;
    out.push(src);
  }
  const re2 = /(https?:\/\/api\.ortified\.ws\/embed\/[a-z]+\/\d+)/gi;
  while ((m = re2.exec(html)) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = true;
    out.push(m[1]);
  }
  return out;
}

async function searchResults(keyword) {
  try {
    const queries = buildSearchQueries(String(keyword || "").trim());
    if (!queries.length) return JSON.stringify([]);
    const results = [];
    const seen = {};
    for (let qi = 0; qi < queries.length; qi++) {
      const q = queries[qi];
      try {
        const url =
          baseUrl +
          "/index.php?do=search&subaction=search&story=" +
          encodeURIComponent(q);
        parseSearchHtml(await getText(await soraFetch(url)), results, seen);
      } catch (e) {}
      if (results.length < 3) {
        try {
          const body =
            "do=search&subaction=search&story=" +
            encodeURIComponent(q) +
            "&titleonly=3";
          const res2 = await soraFetch(baseUrl + "/index.php?do=search", {
            method: "POST",
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: baseUrl + "/",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body,
          });
          parseSearchHtml(await getText(res2), results, seen);
        } catch (e) {}
      }
      if (results.length >= 15) break;
    }
    const q = cleanQuery(keyword).toLowerCase().replace(/-/g, " ");
    const qWords = q.split(/\s+/).filter(function (w) {
      return w.length > 2;
    });
    function score(item) {
      const t = String(item.title || "")
        .toLowerCase()
        .replace(/-/g, " ");
      let s = 0;
      if (t === q) s += 100;
      if (t.indexOf(q) !== -1) s += 50;
      for (let i = 0; i < qWords.length; i++) {
        if (t.indexOf(qWords[i]) !== -1) s += 10;
      }
      return s;
    }
    results.sort(function (a, b) {
      return score(b) - score(a);
    });
    return JSON.stringify(results.slice(0, 15));
  } catch (err) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(String(url).split("?")[0]));
    let description = "N/A";
    const dm =
      html.match(/name="description"\s+content="([^"]+)"/i) ||
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i);
    if (dm) description = decodeHtml(dm[1]).slice(0, 900);
    return JSON.stringify([
      { description: description, aliases: "N/A", airdate: "N/A" },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    if (!html) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }
    const embeds = findOrtifiedEmbeds(html);
    for (let i = 0; i < embeds.length; i++) {
      try {
        const eh = await getText(
          await soraFetch(embeds[i], {
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: pageUrl,
            },
          })
        );
        const eps = listEpisodesLight(eh, pageUrl);
        if (eps.length > 1) return JSON.stringify(eps);
      } catch (e) {}
    }
    return JSON.stringify([
      { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
    ]);
  } catch (err) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0],
        number: 1,
        season: 1,
        title: "Смотреть",
      },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const clean = String(url).split("#")[0];
    const se = parseSeasonEpisode(clean);
    const pageUrl = clean.split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://gidonline.net/",
    };
    let embeds = findOrtifiedEmbeds(html);
    if (!embeds.length) {
      const m = html.match(/ortified\.ws\/embed\/[a-z]+\/(\d+)/i);
      if (m) embeds = ["https://api.ortified.ws/embed/movie/" + m[1]];
    }

    for (let i = 0; i < embeds.length; i++) {
      try {
        const eh = await getText(
          await soraFetch(embeds[i], {
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: pageUrl,
              Accept: "text/html,*/*",
            },
          })
        );
        if (!eh || eh.length < 50) continue;
        const before = streams.length;
        parseSeasonsPlayer(eh, "Смотреть", se.season || 1, se.episode || 1, streams);
        if (streams.length === before) parseMakePlayerMovie(eh, "Смотреть", streams);
      } catch (e) {}
    }

    const uniq = [];
    const seenKey = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s || !s.streamUrl) continue;
      if (isEnglishAudio(s.title || "")) continue;
      const key = s.streamUrl.slice(0, 120);
      if (seenKey[key]) continue;
      seenKey[key] = true;
      uniq.push({
        title: s.title,
        streamUrl: s.streamUrl,
        headers: s.headers || headers,
      });
    }

    return JSON.stringify({ streams: uniq.slice(0, 8), subtitles: "" });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
