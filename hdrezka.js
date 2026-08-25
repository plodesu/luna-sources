/**
 * HDRezka – Sora / Luna
 * Primary: https://hdrezka.me
 * v2.1.0
 */
const MIRRORS = [
  "https://hdrezka.me",
  "https://hdrezka.ag",
  "https://rezka.ag",
  "https://hdrezka.tv",
];

let baseUrl = MIRRORS[0];

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      Accept: "text/html,application/json,*/*;q=0.8",
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
    return await fetch(url, { method, headers, body });
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

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  const b = base || baseUrl;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return b + u;
  if (u.indexOf("http") !== 0) return b + "/" + u;
  return u;
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function isBlocked(html) {
  return /Ошибка доступа|Just a moment|cf-browser|не бот|Access denied/i.test(
    String(html || "").slice(0, 800)
  );
}

/* ---- clearTrash (HDRezka encoded streams) ---- */

function clearTrash(data) {
  if (!data) return "";
  let s = String(data);
  try {
    const trashList = [
      "//_//",
      "$$#!",
      "^^#!!",
      "=#=!#",
      "!##!#",
      "@@#!@",
      "#!!##",
      "#!@#!",
      "$$!#!",
    ];
    for (let i = 0; i < trashList.length; i++) {
      s = s.split(trashList[i]).join("");
    }
    s = s.replace(/#h/g, "");
    // base64-ish segments
    if (/^[A-Za-z0-9+/=]+$/.test(s.replace(/,/g, "").replace(/\[/g, ""))) {
      // leave multi-quality string as-is; decode parts later
    }
    // classic: atob after strip
    const cleaned = s.replace(/\/\/[a-z0-9]{2,}/gi, "");
    try {
      if (typeof atob === "function" && /^[A-Za-z0-9+/=]+$/.test(cleaned)) {
        return atob(cleaned);
      }
    } catch (e) {}
    return s;
  } catch (e) {
    return String(data);
  }
}

function parseQualityList(urlField) {
  // "360p or https://... 480p or https://... 720p or ..."
  const streams = [];
  if (!urlField) return streams;
  let decoded = clearTrash(urlField);
  // sometimes still base64 chunks separated by ,
  if (decoded.indexOf("http") === -1 && decoded.indexOf(",") !== -1) {
    const parts = decoded.split(",");
    const rebuilt = [];
    for (let i = 0; i < parts.length; i++) {
      try {
        if (typeof atob === "function") rebuilt.push(atob(parts[i]));
        else rebuilt.push(parts[i]);
      } catch (e) {
        rebuilt.push(parts[i]);
      }
    }
    decoded = rebuilt.join(",");
  }
  const re = /(\d{3,4}p)\s*\[?([^\],\s]+(?:m3u8|mp4)[^\],\s]*)\]?/gi;
  let m;
  while ((m = re.exec(decoded))) {
    let u = m[2].replace(/^\[|\]$/g, "");
    if (isHttp(u)) streams.push({ quality: m[1], url: u });
  }
  if (!streams.length) {
    const re2 = /(https?:\/\/[^\s,"'\[\]]+\.(?:m3u8|mp4)[^\s,"'\[\]]*)/gi;
    while ((m = re2.exec(decoded))) {
      streams.push({ quality: "HD", url: m[1] });
    }
  }
  return streams;
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    let html = "";
    let usedBase = baseUrl;

    for (let mi = 0; mi < MIRRORS.length; mi++) {
      usedBase = MIRRORS[mi];
      baseUrl = usedBase;
      // GET search
      html = await getText(
        await soraFetch(
          usedBase +
            "/search/?do=search&subaction=search&q=" +
            encodeURIComponent(q)
        )
      );
      if (html && !isBlocked(html) && /b-content__inline_item|search-result|href=.*\.html/i.test(html)) {
        break;
      }
      // POST fallback
      html = await getText(
        await soraFetch(usedBase + "/search/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          body:
            "do=search&subaction=search&q=" + encodeURIComponent(q),
        })
      );
      if (html && !isBlocked(html)) break;
    }

    if (!html || isBlocked(html)) return JSON.stringify([]);

    const results = [];
    const seen = {};

    // classic HDRezka cards
    const re =
      /href=["']([^"']*\/(?:films|series|cartoons|animation)\/[^"']+\/(\d+)-[^"']+\.html)["'][\s\S]{0,400}?src=["']([^"']+)["'][\s\S]{0,200}?<div[^>]*class=["'][^"']*b-content__inline_item-link[^"']*["'][^>]*>\s*<a[^>]*>\s*([^<]+)/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1], usedBase);
      if (seen[href]) continue;
      seen[href] = true;
      results.push({
        title: m[4].replace(/\s+/g, " ").trim(),
        image: absUrl(m[3], usedBase),
        href: href,
      });
      if (results.length >= 20) break;
    }

    if (!results.length) {
      const re2 =
        /href=["']((?:https?:\/\/[^"']+)?\/(?:films|series|cartoons)\/[^"']+\/\d+-[^"']+\.html)["'][^>]*>[\s\S]{0,120}?([^<]{3,80})/gi;
      while ((m = re2.exec(html))) {
        const href = absUrl(m[1], usedBase);
        if (seen[href]) continue;
        seen[href] = true;
        const title = m[2].replace(/\s+/g, " ").trim();
        if (title.length < 2) continue;
        results.push({ title: title, image: "", href: href });
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
    const pageUrl = String(url).split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/class=["']b-post__description_text["'][^>]*>([\s\S]*?)<\//i);
    if (dm) {
      description = String(dm[1])
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
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
    const pageUrl = String(url).split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    if (!html || isBlocked(html)) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    // series: data-season_id / data-episode_id
    const eps = [];
    const seen = {};
    const re =
      /data-season_id=["']?(\d+)["']?[^>]*data-episode_id=["']?(\d+)["']?/gi;
    let m;
    while ((m = re.exec(html))) {
      const sn = +m[1];
      const en = +m[2];
      const k = sn + "-" + en;
      if (seen[k]) continue;
      seen[k] = true;
      eps.push({
        href: pageUrl + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }
    // alternate order
    if (!eps.length) {
      const re2 =
        /data-episode_id=["']?(\d+)["']?[^>]*data-season_id=["']?(\d+)["']?/gi;
      while ((m = re2.exec(html))) {
        const en = +m[1];
        const sn = +m[2];
        const k = sn + "-" + en;
        if (seen[k]) continue;
        seen[k] = true;
        eps.push({
          href: pageUrl + "?s=" + sn + "&e=" + en,
          number: en,
          season: sn,
          title: "S" + sn + "E" + en,
        });
      }
    }

    eps.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });

    if (!eps.length) {
      eps.push({
        href: pageUrl,
        number: 1,
        season: 1,
        title: "Смотреть",
      });
    }
    return JSON.stringify(eps);
  } catch (e) {
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

/* ---- streams ---- */

function parseSE(url) {
  const u = String(url);
  const s = (u.match(/[?&]s=(\d+)/) || [])[1];
  const e = (u.match(/[?&]e=(\d+)/) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function extractId(html, pageUrl) {
  let m = html.match(/data-id=["'](\d+)["']/);
  if (m) return m[1];
  m = pageUrl.match(/\/(\d+)-[^/]+\.html/);
  return m ? m[1] : null;
}

function extractTranslators(html) {
  const list = [];
  const re =
    /data-translator_id=["']?(\d+)["']?[^>]*>([\s\S]*?)<\//gi;
  let m;
  while ((m = re.exec(html))) {
    const name = String(m[2])
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    list.push({ id: m[1], name: name });
  }
  // soft: prefer Russian voice names first
  list.sort(function (a, b) {
    const ar = /дубл|рус|lostfilm|tvshows|студи|кинопоиск/i.test(a.name) ? 0 : 1;
    const br = /дубл|рус|lostfilm|tvshows|студи|кинопоиск/i.test(b.name) ? 0 : 1;
    return ar - br;
  });
  return list;
}

async function fetchCdn(filmId, translatorId, season, episode) {
  const body =
    "id=" +
    encodeURIComponent(filmId) +
    "&translator_id=" +
    encodeURIComponent(translatorId) +
    (season != null && episode != null
      ? "&season=" +
        encodeURIComponent(season) +
        "&episode=" +
        encodeURIComponent(episode) +
        "&action=get_stream"
      : "&action=get_movie");

  const dataTxt = await getText(
    await soraFetch(
      baseUrl + "/ajax/get_cdn_series/?t=" + Date.now(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Referer: baseUrl + "/",
          Origin: baseUrl,
        },
        body: body,
      }
    )
  );
  if (!dataTxt) return [];
  let json;
  try {
    json = JSON.parse(dataTxt);
  } catch (e) {
    return [];
  }
  if (!json || (!json.url && !json.success)) return [];
  return parseQualityList(json.url || "");
}

async function extractStreamUrl(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const se = parseSE(url);

    // align mirror with page host
    const host = (pageUrl.match(/^(https?:\/\/[^/]+)/) || [])[1];
    if (host) baseUrl = host;

    const html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html || isBlocked(html)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const filmId = extractId(html, pageUrl);
    if (!filmId) return JSON.stringify({ streams: [], subtitles: "" });

    let translators = extractTranslators(html);
    if (!translators.length) {
      translators = [{ id: "1", name: "Default" }];
    }

    const streams = [];
    const maxTr = Math.min(translators.length, 6);
    for (let i = 0; i < maxTr; i++) {
      const tr = translators[i];
      const quals = await fetchCdn(
        filmId,
        tr.id,
        se.season,
        se.episode
      );
      for (let j = 0; j < quals.length; j++) {
        streams.push({
          title: tr.name + " · " + quals[j].quality,
          streamUrl: quals[j].url,
          headers: {
            "User-Agent": UA,
            Referer: baseUrl + "/",
          },
        });
      }
      if (streams.length) break; // first working translator is enough
    }

    return JSON.stringify({ streams: streams.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
