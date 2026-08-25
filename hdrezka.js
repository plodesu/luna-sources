/**
 * HDRezka – Sora / Luna
 * Multi-mirror + POST ajax search
 * v1.1.0
 */
const MIRRORS = [
  "https://i.hdrezka.info",
  "https://hdrezka.ag",
  "https://rezka.ag",
  "https://hdrezka-home.tv",
  "https://hdrezka.co",
];

let baseUrl = MIRRORS[0];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const defaultHeaders = {
  "User-Agent": UA,
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
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

function absUrl(u, base) {
  base = base || baseUrl;
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return base + u;
  if (u.indexOf("http") !== 0) return base + "/" + u;
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
  for (let i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/* ---- clearTrash ---- */
function b64encodeUtf8(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    return "";
  }
}

function clearTrash(data) {
  if (!data) return "";
  const trashList = ["@", "#", "!", "^", "$"];
  const trashCodes = [];
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
    if (trashString.indexOf("http") !== -1 || trashString.charAt(0) === "[") return trashString;
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
    (decoded.indexOf("http") !== 0 && decoded.charAt(0) !== "[")
  ) {
    decoded = clearTrash(decoded) || decoded;
  }
  const parts = String(decoded).split(",");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p || p.indexOf("null") !== -1) continue;
    const m = p.match(/\[([^\]]+)\]\s*(https?:\/\/\S+)/i);
    if (m && isHttp(m[2])) {
      streams.push({
        quality: m[1].replace(/<[^>]+>/g, "").trim(),
        url: m[2],
      });
    }
  }
  streams.sort(function (a, b) {
    return (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0);
  });
  return streams;
}

function isRussianVoice(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return true;
  if (
    /дубляж|русский|рус\b|lostfilm|tvshows|newstudio|kubik|многоголосый|ширжай/.test(n)
  )
    return true;
  if (/оригинал|english|\beng\b|укр|ukr/.test(n) && !/рус/.test(n)) return false;
  return true;
}

/* ---- SEARCH (fixed) ---- */

function parseAjaxSearchHtml(html, mirror) {
  const out = [];
  const seen = {};
  // .b-search__section_list li > a > span.enty
  const re =
    /<li[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>\s*<span[^>]*class=["'][^"']*enty[^"']*["'][^>]*>([^<]+)<\/span>\s*(?:\(([^)]*)\))?/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = absUrl(m[1], mirror);
    if (seen[href]) continue;
    seen[href] = true;
    const title = m[2].trim();
    const year = (m[3] || "").trim();
    out.push({
      title: year ? title + " (" + year + ")" : title,
      image: "",
      href: href,
    });
  }
  // fallback simpler
  if (!out.length) {
    const re2 =
      /href=["']([^"']+\/\d+-[^"']+\.html)["'][^>]*>[\s\S]*?class=["']enty["'][^>]*>([^<]+)/gi;
    while ((m = re2.exec(html))) {
      const href = absUrl(m[1], mirror);
      if (seen[href]) continue;
      seen[href] = true;
      out.push({ title: m[2].trim(), image: "", href: href });
    }
  }
  return out;
}

function parseFullSearchHtml(html, mirror) {
  const out = [];
  const seen = {};
  // b-content__inline_item blocks
  const blocks = html.split(/b-content__inline_item/i);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const hm =
      b.match(/href=["']([^"']+\/\d+-[^"']+\.html)["']/i) ||
      b.match(/href=["']([^"']+\.html)["']/i);
    if (!hm) continue;
    const href = absUrl(hm[1], mirror);
    if (seen[href]) continue;
    if (!/\/(films|series|cartoons|animation)\//i.test(href)) continue;
    seen[href] = true;
    let title = "";
    const tm =
      b.match(/b-content__inline_item-link[^>]*>[\s\S]*?<a[^>]*>([^<]+)/i) ||
      b.match(/<a[^>]+href=["'][^"']+["'][^>]*>([^<]{2,120})</i);
    if (tm) title = tm[1].trim();
    if (!title) continue;
    let image = "";
    const im = b.match(/(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    if (im) image = absUrl(im[1], mirror);
    out.push({ title: title, image: image, href: href });
    if (out.length >= 20) break;
  }
  return out;
}

async function searchOnMirror(mirror, q) {
  // 1) POST ajax search (correct method)
  try {
    const body = "q=" + encodeURIComponent(q);
    const html = await getText(
      await soraFetch(mirror + "/engine/ajax/search.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: mirror + "/",
          Origin: mirror,
          Accept: "text/html, */*",
        },
        body: body,
      })
    );
    if (html && html.length > 50 && html.indexOf("403") === -1) {
      const items = parseAjaxSearchHtml(html, mirror);
      if (items.length) return items;
    }
  } catch (e) {}

  // 2) full search page GET
  try {
    const url =
      mirror +
      "/search/?do=search&subaction=search&q=" +
      encodeURIComponent(q);
    const html = await getText(
      await soraFetch(url, {
        headers: { Referer: mirror + "/", Accept: "text/html" },
      })
    );
    if (html && html.length > 500) {
      const items = parseFullSearchHtml(html, mirror);
      if (items.length) return items;
    }
  } catch (e) {}

  return [];
}

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    for (let i = 0; i < MIRRORS.length; i++) {
      const mirror = MIRRORS[i];
      const items = await searchOnMirror(mirror, q);
      if (items.length) {
        baseUrl = mirror; // lock working mirror for streams
        return JSON.stringify(items.slice(0, 20));
      }
    }
    return JSON.stringify([]);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    // detect mirror from url
    for (let i = 0; i < MIRRORS.length; i++) {
      if (pageUrl.indexOf(MIRRORS[i].replace("https://", "")) !== -1) {
        baseUrl = MIRRORS[i];
        break;
      }
    }
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      html.match(/class="[^"]*b-post__description_text[^"]*"[^>]*>([\s\S]*?)<\//i) ||
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
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
    if (!eps.length) {
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

function extractVideoId(html, pageUrl) {
  const m =
    html.match(/sof\.tv\.initCDN(?:Movies|Series)Events\((\d+)\s*,\s*(\d+)/i) ||
    html.match(/data-id=["'](\d+)["']/i) ||
    pageUrl.match(/\/(\d+)-[^/]+\.html/);
  return m ? m[1] : null;
}

function extractTranslators(html) {
  const list = [];
  const re =
    /data-translator_id=["'](\d+)["'][^>]*>([\s\S]*?)<\/(?:li|div|a|span)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const name = String(m[2])
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    list.push({ id: m[1], name: name || "Tr " + m[1] });
  }
  const init = html.match(
    /sof\.tv\.initCDN(?:Movies|Series)Events\(\d+\s*,\s*(\d+)/i
  );
  if (init && !list.length) list.push({ id: init[1], name: "Default" });
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
    for (let i = 0; i < MIRRORS.length; i++) {
      if (pageUrl.indexOf(MIRRORS[i].replace(/^https?:\/\//, "")) !== -1) {
        baseUrl = MIRRORS[i];
        break;
      }
    }
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
    if (!videoId) return JSON.stringify({ streams: [], subtitles: "" });

    let translators = extractTranslators(html);
    const ru = translators.filter(function (t) {
      return isRussianVoice(t.name);
    });
    const ordered = (ru.length ? ru : translators).slice(0, 6);
    if (!ordered.length) ordered.push({ id: "1", name: "Default" });

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
            headers: { "User-Agent": UA, Referer: baseUrl + "/" },
          });
        }
      } catch (e) {}
    }

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
