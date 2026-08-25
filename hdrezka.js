/**
 * HDRezka (i.hdrezka.info) – Sora / Luna
 * Movies + series, Russian translators preferred
 * v1.0.0
 */
const baseUrl = "https://i.hdrezka.info";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const defaultHeaders = {
  "User-Agent": UA,
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  Referer: baseUrl + "/",
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

async function getJson(res) {
  const t = await getText(res);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  if (u.indexOf("http") !== 0) return baseUrl + "/" + u;
  return u;
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function randomFavs() {
  let s = "";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 8; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

/* ---- clearTrash (HDRezka stream decode) ---- */

function b64encodeUtf8(str) {
  try {
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(str)));
    }
  } catch (e) {}
  return "";
}

function clearTrash(data) {
  if (!data) return "";
  const trashList = ["@", "#", "!", "^", "$"];
  const trashCodes = [];
  // length 2 and 3 combos
  for (let len = 2; len <= 3; len++) {
    const idx = new Array(len).fill(0);
    while (true) {
      let s = "";
      for (let i = 0; i < len; i++) s += trashList[idx[i]];
      const enc = b64encodeUtf8(s);
      if (enc) trashCodes.push(enc);
      let k = len - 1;
      while (k >= 0) {
        idx[k]++;
        if (idx[k] < trashList.length) break;
        idx[k] = 0;
        k--;
      }
      if (k < 0) break;
    }
  }

  let trashString = String(data).replace("#h", "").split("//_//").join("");
  for (let i = 0; i < trashCodes.length; i++) {
    trashString = trashString.split(trashCodes[i]).join("");
  }

  try {
    let padded = trashString;
    while (padded.length % 4) padded += "=";
    const decoded = atob(padded);
    try {
      return decodeURIComponent(escape(decoded));
    } catch (e) {
      return decoded;
    }
  } catch (e2) {
    // already plain?
    if (trashString.indexOf("http") !== -1 || trashString.indexOf("[") === 0) {
      return trashString;
    }
    return "";
  }
}

function parseQualityList(urlField) {
  const streams = [];
  if (!urlField) return streams;
  let decoded = urlField;
  if (
    decoded.indexOf("#h") !== -1 ||
    decoded.indexOf("//_//") !== -1 ||
    (decoded.indexOf("http") !== 0 && decoded.indexOf("[") !== 0)
  ) {
    decoded = clearTrash(decoded) || decoded;
  }
  const parts = String(decoded).split(",");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p || p.indexOf("null") !== -1) continue;
    // [1080p]https://...mp4 or [1080p]https://...m3u8
    const m =
      p.match(/\[([^\]]+)\]\s*(https?:\/\/\S+)/i) ||
      p.match(/\[([^\]]+)\](https?:\/\/\S+)/i);
    if (m && isHttp(m[2])) {
      streams.push({ quality: m[1].replace(/<[^>]+>/g, "").trim(), url: m[2] });
    }
  }
  // sort higher quality first
  streams.sort(function (a, b) {
    const na = parseInt(a.quality, 10) || 0;
    const nb = parseInt(b.quality, 10) || 0;
    return nb - na;
  });
  return streams;
}

function isRussianVoice(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return true;
  if (
    n.indexOf("дубляж") !== -1 ||
    n.indexOf("русский") !== -1 ||
    n.indexOf("рус") !== -1 ||
    n.indexOf("lostfilm") !== -1 ||
    n.indexOf("tvshows") !== -1 ||
    n.indexOf("newstudio") !== -1 ||
    n.indexOf("kubik") !== -1 ||
    n.indexOf("ширжак") !== -1 ||
    n.indexOf("многоголосый") !== -1
  ) {
    return true;
  }
  if (
    n.indexOf("оригинал") !== -1 ||
    n.indexOf("english") !== -1 ||
    n.indexOf("eng") !== -1 ||
    n.indexOf("укр") !== -1 ||
    n.indexOf("sub") !== -1 && n.indexOf("рус") === -1
  ) {
    return false;
  }
  return true; // unknown → allow
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const results = [];
    const seen = {};

    // 1) classic search page
    try {
      const url =
        baseUrl +
        "/search/?do=search&subaction=search&q=" +
        encodeURIComponent(q);
      const html = await getText(await soraFetch(url));
      const re =
        /href="(https?:\/\/[^"]+\/\d+-[^"]+\.html)"[^>]*>[\s\S]*?(?:<img[^>]+(?:src|data-src)="([^"]+)")?[\s\S]*?<([^>]+class="[^"]*enty[^"]*"[^>]*)>([^<]+)/gi;
      // simpler patterns
      const linkRe =
        /<a[^>]+href="((?:https?:\/\/[^"]+)?\/(?:films|series|cartoons|animation)\/[^"]*\/\d+-[^"]+\.html)"[^>]*>/gi;
      let m;
      const links = [];
      while ((m = linkRe.exec(html))) {
        links.push(absUrl(m[1]));
      }
      // title near links
      for (let i = 0; i < links.length && results.length < 20; i++) {
        const href = links[i];
        if (seen[href]) continue;
        seen[href] = true;
        const idm = href.match(/\/(\d+)-/);
        if (!idm) continue;
        // find title in surrounding
        const idx = html.indexOf(links[i].replace(baseUrl, "") !== links[i] ? href.replace(baseUrl, "") : href);
        let title = "";
        const slice = html.slice(Math.max(0, idx - 50), idx + 400);
        const tm =
          slice.match(/class="[^"]*enty[^"]*"[^>]*>([^<]+)/i) ||
          slice.match(/alt="([^"]+)"/i) ||
          slice.match(/title="([^"]+)"/i);
        if (tm) title = tm[1].trim();
        if (!title) {
          title = href
            .split("/")
            .pop()
            .replace(/\.html$/, "")
            .replace(/^\d+-/, "")
            .replace(/-/g, " ");
        }
        const im = slice.match(/(?:src|data-src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
        results.push({
          title: title,
          image: im ? absUrl(im[1]) : "",
          href: href,
        });
      }
    } catch (e) {}

    // 2) ajax search fallback
    if (results.length < 3) {
      try {
        const ajaxUrl =
          baseUrl + "/engine/ajax/search.php?q=" + encodeURIComponent(q);
        const html = await getText(
          await soraFetch(ajaxUrl, {
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              Referer: baseUrl + "/",
            },
          })
        );
        const itemRe =
          /<a href="([^"]+)"><span class="enty">([^<]+)<\/span>\s*\(([^)]*)\)/gi;
        let m;
        while ((m = itemRe.exec(html))) {
          const href = absUrl(m[1]);
          if (seen[href]) continue;
          seen[href] = true;
          const year = m[3] || "";
          results.push({
            title: year ? m[2].trim() + " (" + year + ")" : m[2].trim(),
            image: "",
            href: href,
          });
          if (results.length >= 20) break;
        }
      } catch (e) {}
    }

    return JSON.stringify(results.slice(0, 20));
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
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
      html.match(/class="[^"]*b-post__description_text[^"]*"[^>]*>([\s\S]*?)<\//i) ||
      html.match(/name="description"\s+content="([^"]+)"/i);
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
    const isSeries = /\/series\//i.test(pageUrl);
    if (!isSeries) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    // episode list: data-season_id / data-episode_id
    const re =
      /data-(?:season_id|season)=["']?(\d+)["']?[^>]*data-(?:episode_id|episode)=["']?(\d+)["']?/gi;
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

    // alternate: initCDNSeriesEvents or similar
    if (!eps.length) {
      const re2 = /season[:\s]+(\d+)[^\d]+episode[:\s]+(\d+)/gi;
      while ((m = re2.exec(html))) {
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
    }

    if (!eps.length) {
      // default first episode
      eps.push({
        href: pageUrl + "?s=1&e=1",
        number: 1,
        season: 1,
        title: "S1E1",
      });
    }

    eps.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0] + "?s=1&e=1",
        number: 1,
        season: 1,
        title: "S1E1",
      },
    ]);
  }
}

/* ---- page parse: id + translators ---- */

function extractVideoId(html, pageUrl) {
  let m =
    html.match(/sof\.tv\.initCDN(?:Movies|Series)Events\((\d+)\s*,\s*(\d+)/i) ||
    html.match(/data-id=["'](\d+)["']/i) ||
    pageUrl.match(/\/(\d+)-[^/]+\.html/);
  if (m) return m[1];
  return null;
}

function extractTranslators(html) {
  const list = [];
  const re =
    /data-translator_id=["'](\d+)["'][^>]*>([\s\S]*?)<\/(?:li|div|a|span)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const name = String(m[2])
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!id) continue;
    list.push({ id: id, name: name || "Translator " + id });
  }
  // also from initCDN call default translator
  const init = html.match(
    /sof\.tv\.initCDN(?:Movies|Series)Events\(\d+\s*,\s*(\d+)/i
  );
  if (init && !list.length) {
    list.push({ id: init[1], name: "Default" });
  }
  return list;
}

async function fetchCdn(videoId, translatorId, season, episode, isSeries) {
  const params = new URLSearchParams();
  params.append("id", String(videoId));
  params.append("translator_id", String(translatorId));
  params.append("favs", randomFavs());
  if (isSeries) {
    params.append("season", String(season || 1));
    params.append("episode", String(episode || 1));
    params.append("action", "get_stream");
  } else {
    params.append("action", "get_movie");
  }

  const res = await soraFetch(baseUrl + "/ajax/get_cdn_series/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: baseUrl + "/",
      Origin: baseUrl,
    },
    body: params.toString(),
  });
  return await getJson(res);
}

async function extractStreamUrl(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const se = parseSE(url);
    const isSeries = /\/series\//i.test(pageUrl);
    const season = se.season || 1;
    const episode = se.episode || 1;

    const html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html || html.length < 200) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const videoId = extractVideoId(html, pageUrl);
    if (!videoId) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    let translators = extractTranslators(html);
    // prefer Russian
    const ru = translators.filter(function (t) {
      return isRussianVoice(t.name);
    });
    const ordered = (ru.length ? ru : translators).slice(0, 6);
    if (!ordered.length) {
      ordered.push({ id: "1", name: "Default" });
    }

    const streams = [];
    for (let i = 0; i < ordered.length; i++) {
      const tr = ordered[i];
      try {
        const data = await fetchCdn(
          videoId,
          tr.id,
          season,
          episode,
          isSeries
        );
        if (!data || !data.url) continue;
        const quals = parseQualityList(data.url);
        for (let j = 0; j < quals.length; j++) {
          streams.push({
            title: quals[j].quality + " · " + tr.name,
            streamUrl: quals[j].url,
            headers: {
              "User-Agent": UA,
              Referer: baseUrl + "/",
            },
          });
        }
      } catch (e) {}
    }

    // dedupe
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 140);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 15), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
