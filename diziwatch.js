/**
 * diziwatch (diziwatch8.com) – Sora / Luna
 * Search: /api/search.php?q=
 * Series: /dizi/{slug}
 * Episodes: /bolum/{slug}-{s}-sezon-{e}-bolum
 * Player: videoplay.vip → HLS + softsubs (.vtt, Referer required)
 * v1.0.2
 */
const baseUrl = "https://diziwatch8.com";
const playerHost = "https://videoplay.vip";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      Accept: "text/html,application/json,*/*",
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

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}
function forceHttps(u) {
  return String(u || "").replace(/^http:\/\//i, "https://");
}
function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    })
    .replace(/\\u([0-9a-f]{4})/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function b64decode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  str = String(str || "").replace(/[^A-Za-z0-9+/=]/g, "");
  let out = "";
  for (let i = 0; i < str.length; i += 4) {
    const a = chars.indexOf(str.charAt(i));
    const b = chars.indexOf(str.charAt(i + 1));
    const c = chars.indexOf(str.charAt(i + 2));
    const d = chars.indexOf(str.charAt(i + 3));
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== -1 && str.charAt(i + 2) !== "=")
      out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== -1 && str.charAt(i + 3) !== "=")
      out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}
function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/bolum\/([^/?#]+?)-(\d+)-sezon-(\d+)-bolum\/?/i);
  if (m)
    return {
      type: "episode",
      slug: m[1],
      season: parseInt(m[2], 10),
      episode: parseInt(m[3], 10),
    };
  m = s.match(/\/dizi\/([^/?#]+)\/?/i);
  if (m) return { type: "series", slug: m[1], season: 0, episode: 0 };
  m = s.match(/\/film\/([^/?#]+)\/?/i);
  if (m) return { type: "movie", slug: m[1], season: 0, episode: 0 };
  return { type: "unknown", slug: "", season: 0, episode: 0 };
}

function extractPlayerEmbed(html) {
  if (!html) return "";
  let m = html.match(
    /src=["'](https?:\/\/videoplay\.vip\/dizi\/[^"']+)["']/i
  );
  if (m) return m[1];
  m =
    html.match(/encodedContent\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/) ||
    html.match(/const encodedContent\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
  if (m) {
    try {
      const dec = b64decode(m[1]);
      const u = dec.match(
        /src=["'](https?:\/\/videoplay\.vip\/dizi\/[^"']+)["']/i
      );
      if (u) return u[1];
    } catch (e) {}
  }
  m = html.match(/progressKey\s*=\s*['"](\d+)_(\d+)_(\d+)['"]/);
  if (m)
    return (
      playerHost +
      "/dizi/" +
      m[1] +
      "/" +
      m[2] +
      "/" +
      m[3] +
      "?sid=diziwatch8.com"
    );
  return "";
}

/**
 * HLS masters + softsubs.
 * Subs must be real .vtt under /uploads/hls/{id}/… (NOT play.m3u8 proxy).
 * Referer: videoplay.vip is required or CDN returns 403.
 */
function parsePlayerPage(html) {
  const result = { hls: [], subs: [] };
  if (!html) return result;

  const masters = html.match(
    /\/play\.m3u8\?id=\d+&t=m&token=[A-Za-z0-9_-]+&expires=\d+/g
  );
  if (masters) {
    const seen = {};
    masters.forEach(function (p) {
      if (p.indexOf("${") >= 0) return;
      const u = playerHost + p;
      if (seen[u]) return;
      seen[u] = true;
      result.hls.push(u);
    });
  }

  let vid = "";
  if (result.hls.length) {
    const mm = result.hls[0].match(/id=(\d+)/);
    if (mm) vid = mm[1];
  }
  let hlsBase = "";
  const bp = html.match(/hlsBasePath\s*=\s*['"]([^'"]+)['"]/);
  if (bp) hlsBase = bp[1].replace(/\\+/g, "/").replace(/^\/+/, "");
  if (!hlsBase && vid) hlsBase = "uploads/hls/" + vid + "/";

  const td = html.match(/tracksData\s*=\s*(\{[\s\S]*?\});/);
  if (td) {
    try {
      const j = JSON.parse(td[1].replace(/\\\//g, "/"));
      const list = (j && j.subtitles) || [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s || !s.url) continue;
        let rel = String(s.url).replace(/\\\//g, "/").replace(/^\//, "");
        let subUrl = "";
        if (/^https?:\/\//i.test(rel)) {
          subUrl = rel;
        } else if (hlsBase) {
          subUrl = playerHost + "/" + hlsBase + rel;
        } else if (vid) {
          subUrl = playerHost + "/uploads/hls/" + vid + "/" + rel;
        }
        if (!subUrl) continue;

        let name = decodeEntities(String(s.name || s.lang || "Sub"));
        result.subs.push({
          url: forceHttps(subUrl),
          label: name,
          lang: String(s.lang || "").toLowerCase(),
          default: !!s.default,
        });
      }
    } catch (e) {}
  }

  result.subs.sort(function (a, b) {
    function rank(x) {
      if (x.lang === "tr" || /t[uü]rk/i.test(x.label)) return 0;
      if (x.default) return 1;
      if (x.lang === "en" || /ingiliz|english/i.test(x.label)) return 2;
      return 3;
    }
    return rank(a) - rank(b);
  });
  return result;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const data = await getJson(
      await soraFetch(
        baseUrl + "/api/search.php?q=" + encodeURIComponent(cleaned),
        {
          headers: {
            "User-Agent": UA,
            Accept: "application/json",
            Referer: baseUrl + "/",
          },
        }
      )
    );
    const list = (data && data.results) || [];
    const results = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || !item.slug) continue;
      const type = String(item.type || "series").toLowerCase();
      const path =
        type === "movie" || type === "film"
          ? "/film/" + item.slug
          : "/dizi/" + item.slug;
      const href = absUrl(path);
      if (seen[href]) continue;
      seen[href] = true;
      let image = item.poster || "";
      if (image && image.charAt(0) === "/") image = baseUrl + image;
      results.push({
        title: decodeEntities(item.title || item.slug)
          .replace(/\s+/g, " ")
          .trim(),
        image: absUrl(image),
        href: href,
      });
    }
    return JSON.stringify(results.slice(0, 30));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const p = parseHref(url);
    let page = String(url);
    if (p.type === "episode" && p.slug) page = baseUrl + "/dizi/" + p.slug;
    const html = await getText(await soraFetch(page));
    let description = "N/A";
    const dm =
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      ) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i);
    if (dm)
      description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);
    let aliases = "N/A";
    const am = html.match(/og:title[^>]+content=["']([^"']+)/i);
    if (am) aliases = decodeEntities(am[1]).replace(/\s*izle.*$/i, "").trim();
    let airdate = "N/A";
    const ym =
      html.match(/YEAR OF PUBLICATION[\s\S]{0,80}?>(\d{4})</i) ||
      html.match(/>\s*(20\d{2})\s*</);
    if (ym) airdate = ym[1];
    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

/* ===================== EPISODES ===================== */
/**
 * Sequential numbers 1..N (avoids Episode 1.001 UI).
 * Titles keep "X. Sezon Y. Bölüm". Sorted by season then episode.
 */
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    const seriesUrl =
      p.slug && p.type !== "movie"
        ? baseUrl + "/dizi/" + p.slug
        : String(url);

    const html = await getText(await soraFetch(seriesUrl));
    const raw = [];
    const seen = {};

    const re =
      /href="((?:https?:\/\/[^"]+)?\/bolum\/([^"/]+?)-(\d+)-sezon-(\d+)-bolum\/?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const season = parseInt(m[3], 10);
      const ep = parseInt(m[4], 10);
      const key = season + "-" + ep;
      if (seen[key]) continue;
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0)
        continue;
      seen[key] = true;
      raw.push({
        href: absUrl(m[1]),
        season: season,
        episode: ep,
        title: season + ". Sezon " + ep + ". Bölüm",
      });
    }

    raw.sort(function (a, b) {
      return a.season - b.season || a.episode - b.episode;
    });

    const eps = raw.map(function (e, idx) {
      return {
        href: e.href,
        number: idx + 1,
        title: e.title,
      };
    });

    if (!eps.length && /\/bolum\//i.test(String(url))) {
      eps.push({
        href: String(url),
        number: 1,
        title: "1. Bölüm",
      });
    }

    return JSON.stringify(eps.slice(0, 800));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "1. Bölüm" },
    ]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    let epUrl = String(url).split("?")[0];
    if (!/^https?:\/\//i.test(epUrl))
      epUrl = baseUrl + (epUrl.charAt(0) === "/" ? epUrl : "/" + epUrl);

    if (/\/dizi\//i.test(epUrl) && !/\/bolum\//i.test(epUrl)) {
      const seriesHtml = await getText(await soraFetch(epUrl));
      const all = [];
      const re =
        /href="((?:https?:\/\/[^"]+)?\/bolum\/[^"]+?-(\d+)-sezon-(\d+)-bolum\/?)"/gi;
      let x;
      while ((x = re.exec(seriesHtml))) {
        all.push({
          href: absUrl(x[1]),
          s: parseInt(x[2], 10),
          e: parseInt(x[3], 10),
        });
      }
      all.sort(function (a, b) {
        return a.s - b.s || a.e - b.e;
      });
      if (!all.length) return JSON.stringify({ streams: [] });
      epUrl = all[0].href;
    }

    const epHtml = await getText(
      await soraFetch(epUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!epHtml || epHtml.length < 300)
      return JSON.stringify({ streams: [] });

    let embed = extractPlayerEmbed(epHtml);
    if (!embed) {
      const p = parseHref(epUrl);
      const posterId = (epHtml.match(
        /(?:dizi_poster|bolum_)[^"'/]*_(\d+)\.(?:webp|jpg|png)/i
      ) || [])[1];
      if (posterId && p.season && p.episode) {
        embed =
          playerHost +
          "/dizi/" +
          posterId +
          "/" +
          p.season +
          "/" +
          p.episode +
          "?sid=diziwatch8.com";
      }
    }
    if (!embed || !isHttp(embed))
      return JSON.stringify({ streams: [] });

    const playerHtml = await getText(
      await soraFetch(embed, {
        headers: {
          "User-Agent": UA,
          Referer: epUrl,
          Accept: "text/html,*/*",
        },
      })
    );

    const parsed = parsePlayerPage(playerHtml);
    const streams = [];
    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: playerHost + "/",
      Origin: playerHost,
    };
    const subHeaders = {
      "User-Agent": UA,
      Accept: "text/vtt,*/*",
      Referer: playerHost + "/",
      Origin: playerHost,
    };

    const subPairs = [];
    const allSubs = [];
    for (let i = 0; i < parsed.subs.length; i++) {
      const s = parsed.subs[i];
      if (!s.url) continue;
      subPairs.push(s.label || s.lang || "Sub");
      subPairs.push(s.url);
      allSubs.push({
        url: s.url,
        label: s.label || s.lang || "Sub",
        headers: subHeaders,
      });
    }
    const defaultSub = allSubs.length ? allSubs[0].url : "";

    for (let i = 0; i < parsed.hls.length; i++) {
      const media = forceHttps(parsed.hls[i]);
      if (!isHttp(media)) continue;
      const stream = {
        title: i === 0 ? "Videoplay · HLS" : "Videoplay · HLS " + (i + 1),
        name: i === 0 ? "Videoplay · HLS" : "Videoplay · HLS " + (i + 1),
        streamUrl: media,
        url: media,
        headers: headers,
      };
      if (defaultSub) {
        stream.subtitle = defaultSub;
        stream.subtitleHeaders = subHeaders;
      }
      if (subPairs.length) stream.subtitles = subPairs;
      if (allSubs.length) stream.allSubtitles = allSubs;
      streams.push(stream);
    }

    return JSON.stringify({ streams: streams.slice(0, 6) });
  } catch (e) {
    return JSON.stringify({ streams: [] });
  }
}
