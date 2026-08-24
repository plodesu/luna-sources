/**
 * GidOnline.NET – films & series for Sora / Luna
 * Site: https://gidonline.net
 * Players: ortified.ws (primary, same stack as embess) + cinemar.cc (studios)
 * v3.1.0 – fixed search + dual player pipeline
 */

const baseUrl = "https://gidonline.net";

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
  } catch (e) {}
  try {
    return await fetch(url, { headers: headers, method: method, body: body });
  } catch (e2) {
    return null;
  }
}

async function getText(res) {
  if (!res) return "";
  try {
    if (typeof res === "string") return res;
    if (typeof res.text === "function") return await res.text();
    if (res.data && typeof res.data === "string") return res.data;
    if (res.body && typeof res.body === "string") return res.body;
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
    n.indexOf("flags/us") !== -1 ||
    n.indexOf("укр") !== -1 ||
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
    n.indexOf("kubik") !== -1 ||
    n.indexOf("newstudio") !== -1
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
  add(base.replace(/&/g, " "));
  add(base.replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, " "));
  const words = base.split(/\s+/).filter(Boolean);
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
    reacher: "Ричер",
    naruto: "Наруто",
  };
  for (const k in aliases) {
    if (low.indexOf(k) !== -1) add(aliases[k]);
  }
  return queries.slice(0, 5);
}

/** Parse .net search cards: class="shortstory" title="..." href="..." */
function parseSearchHtml(html, results, seen) {
  if (!html) return;
  let m;

  // Primary: shortstory cards with title attr
  const re1 =
    /<a[^>]+href="((?:https?:\/\/gidonline\.net)?\/[^"]+\.html)"[^>]*class="[^"]*shortstory[^"]*"[^>]*title="([^"]*)"/gi;
  while ((m = re1.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href] || href.indexOf(".html") === -1) continue;
    if (/\/(index|page|contact)/i.test(href)) continue;
    seen[href] = true;
    results.push({
      title: decodeHtml(m[2]),
      image: "",
      href: href,
    });
  }

  // Alternate attribute order: class before href
  const re1b =
    /class="[^"]*shortstory[^"]*"[^>]*href="((?:https?:\/\/gidonline\.net)?\/[^"]+\.html)"[^>]*title="([^"]*)"/gi;
  while ((m = re1b.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href]) continue;
    seen[href] = true;
    results.push({
      title: decodeHtml(m[2]),
      image: "",
      href: href,
    });
  }

  // h2 > a.ellipsis
  const re2 =
    /<h2>\s*<a[^>]+href="((?:https?:\/\/gidonline\.net)?\/[^"]+\.html)"[^>]*(?:title="([^"]*)")?[^>]*>([^<]*)<\/a>/gi;
  while ((m = re2.exec(html)) !== null) {
    const href = absUrl(m[1]);
    if (!href || seen[href]) continue;
    seen[href] = true;
    results.push({
      title: decodeHtml(m[2] || m[3] || ""),
      image: "",
      href: href,
    });
  }

  // Fill images from nearby poster
  const reImg =
    /href="((?:https?:\/\/gidonline\.net)?\/[^"]+\.html)"[\s\S]{0,500}?data-src="([^"]+)"/gi;
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
  url = String(url).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  if (!/^https?:\/\//i.test(url)) return;
  out.push({
    title: title || "Смотреть",
    streamUrl: url,
    headers: headers || {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: baseUrl + "/",
    },
  });
}

function pushAudioStreams(out, playerName, hls, audioNames, headers) {
  if (!hls) return;
  const names = Array.isArray(audioNames) ? audioNames : [];
  const ru = names.filter(function (n) {
    return !isEnglishAudio(n);
  });
  if (ru.length === 0) {
    pushStream(out, playerName + " · Рус. дубляж", hls, headers);
    return;
  }
  for (let i = 0; i < ru.length; i++) {
    pushStream(out, playerName + " · " + ru[i], hls, headers);
  }
}

/** Ortified/embess seasons JSON extract */
function extractSeasonsArray(html) {
  if (!html || html.indexOf("seasons:") === -1) return null;
  const idx = html.indexOf("seasons:");
  const i = html.indexOf("[", idx);
  if (i === -1) return null;
  let depth = 0;
  let end = -1;
  for (let j = i; j < html.length && j < i + 600000; j++) {
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

function findEpisodeStream(html, season, episode) {
  if (!html) return null;
  const en = episode || 1;
  const re = new RegExp(
    '"episode"\\s*:\\s*"?' + en + '"?[\\s\\S]{0,2000}?"hls"\\s*:\\s*"([^"]+)"'
  );
  const m = String(html).match(re);
  if (!m) return null;
  let hls = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  let names = [];
  const block = String(html).substring(m.index, m.index + 2000);
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
    const chunk = parts[p];
    const re = /"episode"\s*:\s*"?(\d+)"?/g;
    let m;
    while ((m = re.exec(chunk)) !== null) {
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
  if (!html || html.indexOf("makePlayer") === -1) return "";
  if (html.indexOf("seasons:") !== -1) return "";
  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: baseUrl + "/",
  };
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
  if (hls) {
    pushAudioStreams(out, playerName || "Смотреть", hls, audioNames, headers);
  }
  return "";
}

function parseSeasonsPlayer(html, playerName, season, episode, out) {
  if (!html || html.indexOf("seasons:") === -1) return "";
  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: baseUrl + "/",
  };
  const targetSeason = season || 1;
  const targetEpisode = episode || 1;

  const found = findEpisodeStream(html, targetSeason, targetEpisode);
  if (found && found.hls) {
    pushAudioStreams(
      out,
      (playerName || "Смотреть") + " S" + targetSeason + "E" + targetEpisode,
      found.hls,
      found.names,
      headers
    );
    return "";
  }

  const seasons = extractSeasonsArray(html);
  if (!seasons || !seasons.length) return "";
  for (let si = 0; si < seasons.length; si++) {
    const sObj = seasons[si];
    const sn = sObj.season || si + 1;
    if (sn !== targetSeason) continue;
    const episodes = sObj.episodes || [];
    for (let ei = 0; ei < episodes.length; ei++) {
      const ep = episodes[ei];
      const en = parseInt(ep.episode || ei + 1, 10);
      if (en !== targetEpisode) continue;
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
      return "";
    }
  }
  return "";
}

/** Collect all embed iframes from page */
function parsePagePlayers(html) {
  const players = [];
  const seen = {};
  if (!html) return players;

  // tab names
  const tabs = [];
  const tabRe = /<h2>([^<]+)<\/h2>/gi;
  let m;
  while ((m = tabRe.exec(html)) !== null) {
    const name = decodeHtml(m[1]);
    if (/смотреть|плеер|player/i.test(name)) tabs.push(name);
  }

  // data-src and src embeds
  const embeds = [];
  const iframeRe =
    /(?:data-src|src)=["']((?:https?:)?\/\/(?:cinemar\.cc|api\.ortified\.ws|api\.embess\.ws)[^"']+)["']/gi;
  while ((m = iframeRe.exec(html)) !== null) {
    let src = absUrl(m[1].replace(/&amp;/g, "&"));
    if (!src || seen[src]) continue;
    if (/youtube|youtu\.be/i.test(src)) continue;
    seen[src] = true;
    embeds.push(src);
  }

  for (let i = 0; i < embeds.length; i++) {
    let name = tabs[i] || "Плеер " + (i + 1);
    const src = embeds[i];
    if (/ortified|embess/i.test(src)) name = "Смотреть";
    if (/cinemar/i.test(src)) name = "Плеер 2";
    players.push({ name: name, src: src });
  }
  return players;
}

/* ---------- cinemar decode (secondary player) ---------- */

function decodeCinemarFile(fileStr) {
  if (!fileStr || String(fileStr).indexOf("#2") !== 0) return null;
  try {
    let e = String(fileStr).substring(2);
    const dm = e.substring(0, 2);
    e = e.substring(2);
    const _ml = 32;
    const sep = String.fromCharCode(parseInt(dm, 10) || dm.charCodeAt(0));
    const parts = e.split(sep);
    let joined = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      const t = parseInt(p.slice(-1), 10);
      if (p.length > _ml && !isNaN(t)) {
        joined += p.substr(2 * t, p.length - 3 * t - 1) + p.substr(0, t);
      } else {
        joined += p;
      }
    }
    const pad = joined.length % 4;
    if (pad) joined += "====".substr(0, 4 - pad);
    if (typeof atob !== "function") return null;
    const binary = atob(joined);
    let decoded = binary;
    try {
      decoded = decodeURIComponent(
        Array.prototype.map
          .call(binary, function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
    } catch (err) {
      try {
        decoded = decodeURIComponent(escape(binary));
      } catch (e2) {}
    }
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
}

function extractCinemarOpts(html) {
  if (!html) return null;
  const idx = html.indexOf("Cinemar(");
  if (idx === -1) return null;
  let i = html.indexOf("{", idx);
  if (i === -1) return null;
  let depth = 0;
  let end = -1;
  for (let j = i; j < html.length && j < i + 200000; j++) {
    const c = html.charAt(j);
    if (c === "{") depth++;
    else if (c === "}") {
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

function collectLeaves(items, season, episode, out) {
  out = out || [];
  if (!items || !items.length) return out;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.folder && it.folder.length) {
      const title = String(it.title || "");
      const snMatch = title.match(/(\d+)/);
      const isSeason = /сезон|season/i.test(title);
      const isEpisode = /сери[яию]|episode|ep\b/i.test(title);
      let nextS = season;
      let nextE = episode;
      if (isSeason && snMatch) nextS = parseInt(snMatch[1], 10);
      if (isEpisode && snMatch) nextE = parseInt(snMatch[1], 10);
      const idm = String(it.id || "").match(/s(\d+)e(\d+)/i);
      if (idm) {
        nextS = parseInt(idm[1], 10);
        nextE = parseInt(idm[2], 10);
      }
      collectLeaves(it.folder, nextS, nextE, out);
    } else if (it.data) {
      out.push({
        id: it.id,
        title: it.title || "Студия",
        data: it.data,
        season: season || 1,
        episode: episode || 1,
      });
    }
  }
  return out;
}

async function loadCinemarStream(dataStr) {
  try {
    const res = await soraFetch("https://cinemar.cc/api/playlist/load", {
      method: "POST",
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: "https://cinemar.cc/",
        Origin: "https://cinemar.cc",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(dataStr),
    });
    const j = await getJson(res);
    if (!j) return null;
    const payload = j.data && j.data.file ? j.data : j;
    if (payload && payload.file) {
      return String(payload.file).replace(/\\u0026/g, "&");
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function extractCinemarStreams(embedHtml, season, episode, out) {
  const opts = extractCinemarOpts(embedHtml);
  if (!opts || !opts.file) return;
  const pl = decodeCinemarFile(opts.file);
  if (!pl || !pl.length) return;
  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: "https://cinemar.cc/",
    Origin: "https://cinemar.cc",
  };
  const leaves = collectLeaves(pl, null, null, []);
  const targetS = season || 1;
  const targetE = episode || 1;
  const hasSeries = leaves.some(function (x) {
    return x.season > 1 || x.episode > 1;
  });
  let candidates = leaves.filter(function (L) {
    if (!hasSeries && !season) return true;
    return L.season === targetS && L.episode === targetE;
  });
  if (!candidates.length) candidates = leaves.slice(0, 6);
  candidates = candidates.filter(function (c) {
    return !isEnglishAudio(c.title);
  });
  const limit = Math.min(candidates.length, 6);
  for (let i = 0; i < limit; i++) {
    const file = await loadCinemarStream(candidates[i].data);
    if (!file) continue;
    const label = String(candidates[i].title || "Студия")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    pushStream(out, "Плеер 2 · " + label, file, headers);
  }
}

/* ---------- Luna API ---------- */

async function searchResults(keyword) {
  try {
    const rawKeyword = String(keyword || "").trim();
    const queries = buildSearchQueries(rawKeyword);
    if (!queries.length) return JSON.stringify([]);

    const results = [];
    const seen = {};

    for (let i = 0; i < queries.length; i++) {
      // GET search
      const url =
        baseUrl +
        "/index.php?do=search&subaction=search&story=" +
        encodeURIComponent(queries[i]);
      const res = await soraFetch(url);
      const html = await getText(res);
      parseSearchHtml(html, results, seen);

      // POST search fallback (DLE)
      if (results.length < 3) {
        try {
          const body =
            "do=search&subaction=search&story=" +
            encodeURIComponent(queries[i]) +
            "&titleonly=3";
          const res2 = await soraFetch(baseUrl + "/index.php?do=search", {
            method: "POST",
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: baseUrl + "/",
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept-Language": "ru-RU,ru;q=0.9",
            },
            body: body,
          });
          const html2 = await getText(res2);
          parseSearchHtml(html2, results, seen);
        } catch (e) {}
      }
      if (results.length >= 20) break;
    }

    // Rank
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
    const res = await soraFetch(String(url).split("?")[0]);
    const html = await getText(res);
    let description = "N/A";
    const dm =
      html.match(/name="description"\s+content="([^"]+)"/i) ||
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i);
    if (dm) description = decodeHtml(dm[1]).slice(0, 900);
    let aliases = "N/A";
    const orig = html.match(/Оригинальное[^<]{0,40}<\/[^>]+>\s*([^<]+)/i);
    if (orig) aliases = decodeHtml(orig[1]);
    let airdate = "N/A";
    const year = html.match(/(?:Год|year)[^0-9]{0,30}(\d{4})/i);
    if (year) airdate = year[1];
    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
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
    const res = await soraFetch(pageUrl);
    const html = await getText(res);
    if (!html) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    // Prefer ortified for episode list
    const players = parsePagePlayers(html);
    for (let i = 0; i < players.length; i++) {
      if (!/ortified|embess/i.test(players[i].src)) continue;
      try {
        const er = await soraFetch(players[i].src, {
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: pageUrl,
          },
        });
        const eh = await getText(er);
        const eps = listEpisodesLight(eh, pageUrl);
        if (eps.length > 1) return JSON.stringify(eps);
      } catch (e) {}
    }

    // cinemar playlist folders
    for (let i = 0; i < players.length; i++) {
      if (!/cinemar/i.test(players[i].src)) continue;
      try {
        const er = await soraFetch(players[i].src, {
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: pageUrl,
          },
        });
        const eh = await getText(er);
        const opts = extractCinemarOpts(eh);
        if (!opts || !opts.file) continue;
        const pl = decodeCinemarFile(opts.file);
        if (!pl) continue;
        const leaves = collectLeaves(pl, null, null, []);
        const seen = {};
        const eps = [];
        for (let j = 0; j < leaves.length; j++) {
          const L = leaves[j];
          const key = L.season + "-" + L.episode;
          if (seen[key]) continue;
          seen[key] = true;
          eps.push({
            href: pageUrl + "?s=" + L.season + "&e=" + L.episode,
            number: L.episode,
            season: L.season,
            title: "S" + L.season + "E" + L.episode,
          });
        }
        if (eps.length > 1) {
          eps.sort(function (a, b) {
            if (a.season !== b.season) return a.season - b.season;
            return a.number - b.number;
          });
          return JSON.stringify(eps);
        }
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
    const res = await soraFetch(pageUrl);
    const html = await getText(res);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: baseUrl + "/",
    };

    const players = parsePagePlayers(html);

    // Always try ortified first (most reliable, same as .eu)
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!/ortified|embess/i.test(p.src)) continue;
      try {
        const er = await soraFetch(p.src, {
          headers: Object.assign({}, headers, { Referer: pageUrl }),
        });
        const eh = await getText(er);
        if (!eh || eh.length < 80) continue;
        const before = streams.length;
        parseSeasonsPlayer(
          eh,
          p.name || "Смотреть",
          se.season || 1,
          se.episode || 1,
          streams
        );
        if (streams.length === before) {
          parseMakePlayerMovie(eh, p.name || "Смотреть", streams);
        }
      } catch (e) {}
    }

    // Cinemar secondary (multiple studios)
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!/cinemar/i.test(p.src)) continue;
      try {
        const er = await soraFetch(p.src, {
          headers: Object.assign({}, headers, { Referer: pageUrl }),
        });
        const eh = await getText(er);
        if (!eh || eh.length < 80) continue;
        await extractCinemarStreams(
          eh,
          se.season || 1,
          se.episode || 1,
          streams
        );
      } catch (e) {}
    }

    // Dedupe + filter English
    const uniq = [];
    const seenKey = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s || !s.streamUrl) continue;
      if (isEnglishAudio(s.title || "")) continue;
      const key = s.streamUrl.slice(0, 100);
      if (seenKey[key]) continue;
      seenKey[key] = true;
      uniq.push({
        title: s.title,
        streamUrl: s.streamUrl,
        headers: s.headers || headers,
      });
    }

    uniq.sort(function (a, b) {
      const score = function (t) {
        const x = (t || "").toLowerCase();
        if (x.indexOf("смотреть") === 0) return 0;
        if (x.indexOf("hdrezka") !== -1) return 1;
        if (x.indexOf("lostfilm") !== -1) return 2;
        if (x.indexOf("дуб") !== -1) return 3;
        return 5;
      };
      return score(a.title) - score(b.title);
    });

    return JSON.stringify({
      streams: uniq.slice(0, 12),
      subtitles: "",
    });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
