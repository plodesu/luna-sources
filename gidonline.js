/**
 * GidOnline.NET – films & series for Sora / Luna
 * Site: https://gidonline.net
 * Player: cinemar.cc (studios: HDrezka, LostFilm, WinMedia, …)


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
  if (!headers["User-Agent"]) headers["User-Agent"] = defaultHeaders["User-Agent"];
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

function isEnglishAudio(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.indexOf("eng") !== -1 ||
    n.indexOf("original") !== -1 ||
    n.indexOf("оригинал") !== -1 ||
    n.indexOf("english") !== -1 ||
    n.indexOf("flags/us") !== -1 ||
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
    let binary;
    if (typeof atob === "function") {
      binary = atob(joined);
    } else {
      return null;
    }
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
      } catch (e2) {
        decoded = binary;
      }
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

function findCinemarEmbed(html) {
  if (!html) return null;
  let m =
    html.match(/data-src=["'](https?:\/\/cinemar\.cc\/embed\/[^"']+)["']/i) ||
    html.match(/src=["'](https?:\/\/cinemar\.cc\/embed\/[^"']+)["']/i) ||
    html.match(/(https?:\/\/cinemar\.cc\/embed\/[^\s"'<>]+)/i);
  return m ? m[1].replace(/&amp;/g, "&") : null;
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
        title2: it.title2 || "",
        data: it.data,
        season: season || 1,
        episode: episode || 1,
      });
    }
  }
  return out;
}

function listEpisodesFromPlaylist(items, pageUrl) {
  const eps = [];
  const seen = {};
  const leaves = collectLeaves(items, null, null, []);
  for (let i = 0; i < leaves.length; i++) {
    const L = leaves[i];
    const sn = L.season || 1;
    const en = L.episode || 1;
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
  eps.sort(function (a, b) {
    if (a.season !== b.season) return a.season - b.season;
    return a.number - b.number;
  });
  return eps;
}

async function loadStreamFromData(dataStr) {
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
      return {
        file: String(payload.file).replace(/\\u0026/g, "&"),
        subtitle: payload.subtitle || "",
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function fetchPlaylistFromPage(pageHtml) {
  const embed = findCinemarEmbed(pageHtml);
  if (!embed) return null;
  const res = await soraFetch(embed, {
    headers: {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: baseUrl + "/",
    },
  });
  const html = await getText(res);
  const opts = extractCinemarOpts(html);
  if (!opts || !opts.file) return null;
  return decodeCinemarFile(opts.file);
}

async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);
    const url =
      baseUrl +
      "/index.php?do=search&subaction=search&story=" +
      encodeURIComponent(q);
    const res = await soraFetch(url);
    const html = await getText(res);
    const results = [];
    const seen = {};
    const re =
      /<a[^>]+href="(https?:\/\/gidonline\.net\/[^"]+\.html)"[^>]*title="([^"]*)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      if (seen[href]) continue;
      seen[href] = true;
      results.push({
        title: decodeHtml(m[2] || ""),
        image: "",
        href: href,
      });
    }
    const re2 =
      /href="(https?:\/\/gidonline\.net\/[^"]+\.html)"[\s\S]{0,400}?data-src="([^"]+)"[\s\S]{0,200}?title="([^"]*)"/gi;
    while ((m = re2.exec(html)) !== null) {
      const href = m[1];
      if (!seen[href]) {
        seen[href] = true;
        results.push({
          title: decodeHtml(m[3] || ""),
          image: absUrl(m[2]),
          href: href,
        });
      } else {
        for (let i = 0; i < results.length; i++) {
          if (results[i].href === href && !results[i].image) {
            results[i].image = absUrl(m[2]);
          }
        }
      }
    }
    const re3 =
      /<h2>\s*<a[^>]+href="(https?:\/\/gidonline\.net\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
    while ((m = re3.exec(html)) !== null) {
      const href = m[1];
      if (seen[href]) continue;
      seen[href] = true;
      results.push({
        title: decodeHtml(m[2]),
        image: "",
        href: href,
      });
    }
    return JSON.stringify(results.slice(0, 20));
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
    const pl = await fetchPlaylistFromPage(html);
    if (pl && pl.length) {
      const eps = listEpisodesFromPlaylist(pl, pageUrl);
      if (eps.length >= 1) return JSON.stringify(eps);
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

    const pl = await fetchPlaylistFromPage(html);
    if (!pl || !pl.length) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://cinemar.cc/",
      Origin: "https://cinemar.cc",
    };

    const leaves = collectLeaves(pl, null, null, []);
    const targetS = se.season || 1;
    const targetE = se.episode || 1;

    const hasSeries = leaves.some(function (x) {
      return x.season > 1 || x.episode > 1;
    });

    let candidates = leaves.filter(function (L) {
      if (!hasSeries && !se.season) return true;
      return L.season === targetS && L.episode === targetE;
    });
    if (!candidates.length) {
      candidates = leaves.filter(function (L) {
        return (
          L.season === (leaves[0] && leaves[0].season) &&
          L.episode === (leaves[0] && leaves[0].episode)
        );
      });
    }
    if (!candidates.length) candidates = leaves.slice(0, 6);

    candidates = candidates.filter(function (c) {
      return !isEnglishAudio(c.title);
    });

    const streams = [];
    let subtitle = "";
    const limit = Math.min(candidates.length, 8);
    for (let i = 0; i < limit; i++) {
      const c = candidates[i];
      const loaded = await loadStreamFromData(c.data);
      if (!loaded || !loaded.file) continue;
      const label = String(c.title || "Студия")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      streams.push({
        title: "Плеер 2 · " + label,
        streamUrl: loaded.file,
        headers: headers,
      });
      if (loaded.subtitle && !subtitle) subtitle = loaded.subtitle;
    }

    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s.streamUrl || seen[s.streamUrl]) continue;
      seen[s.streamUrl] = true;
      uniq.push(s);
    }

    uniq.sort(function (a, b) {
      const score = function (t) {
        const x = t.toLowerCase();
        if (x.indexOf("hdrezka") !== -1) return 0;
        if (x.indexOf("lostfilm") !== -1) return 1;
        if (x.indexOf("дуб") !== -1) return 2;
        if (x.indexOf("winmedia") !== -1) return 3;
        return 5;
      };
      return score(a.title) - score(b.title);
    });

    return JSON.stringify({
      streams: uniq.slice(0, 12),
      subtitles: subtitle || "",
    });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
