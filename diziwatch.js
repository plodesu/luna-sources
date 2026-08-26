/**
 * diziwatch (diziwatch8.com) – Sora / Luna
 * Search: /api/search.php?q=
 * Series: /dizi/{slug}
 * Episodes: /bolum/{slug}-{s}-sezon-{e}-bolum
 * Player: videoplay.vip/dizi/{id}/{s}/{e}?sid=diziwatch8.com → /play.m3u8?id=&token=
 * v1.0.0
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

/** Extract videoplay.vip embed URL from episode HTML */
function extractPlayerEmbed(html) {
  if (!html) return "";
  // live iframe
  let m = html.match(
    /src=["'](https?:\/\/videoplay\.vip\/dizi\/[^"']+)["']/i
  );
  if (m) return m[1];

  // base64 encodedContent
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

  // progressKey = "30984_2_1"
  m = html.match(/progressKey\s*=\s*['"](\d+)_(\d+)_(\d+)['"]/);
  if (m) {
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
  }

  // poster filename ..._30984.webp + season/ep from URL
  return "";
}

/** From videoplay page HTML → absolute HLS master URL */
function extractHlsFromPlayerPage(html) {
  if (!html) return [];
  const out = [];
  // const src = '/play.m3u8?id=2710&t=m&token=...&expires=...';
  const re = /['"](\/play\.m3u8\?id=\d+[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(html))) {
    let p = m[1];
    // skip template strings with ${
    if (p.indexOf("${") >= 0) continue;
    if (p.indexOf("token=") < 0) continue;
    out.push(playerHost + p);
  }
  // also bare occurrences
  const re2 = /\/play\.m3u8\?id=\d+&t=m&token=[A-Za-z0-9_-]+&expires=\d+/g;
  while ((m = re2.exec(html))) {
    out.push(playerHost + m[0]);
  }
  // dedupe
  const seen = {};
  const uniq = [];
  for (let i = 0; i < out.length; i++) {
    const u = forceHttps(out[i]);
    if (seen[u]) continue;
    seen[u] = true;
    uniq.push(u);
  }
  return uniq;
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
      // prefer series/anime; skip pure movies if you want anime-only — keep both
      const type = String(item.type || "series").toLowerCase();
      const path =
        type === "movie" || type === "film"
          ? "/film/" + item.slug
          : "/dizi/" + item.slug;
      let href = absUrl(path);
      if (!/\/$/.test(href)) href += "";
      if (seen[href]) continue;
      seen[href] = true;

      let image = item.poster || "";
      if (image && image.charAt(0) === "/") image = baseUrl + image;
      image = absUrl(image);

      results.push({
        title: decodeEntities(item.title || item.slug)
          .replace(/\s+/g, " ")
          .trim(),
        image: image,
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
    if (p.type === "episode" && p.slug) {
      page = baseUrl + "/dizi/" + p.slug;
    }
    const html = await getText(await soraFetch(page));

    let description = "N/A";
    const dm =
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      ) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(
        /data-nosnippet[^>]*>\s*([^<]{20,400})/i
      );
    if (dm)
      description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);

    let aliases = "N/A";
    const am = html.match(/og:title[^>]+content=["']([^"']+)/i);
    if (am) aliases = decodeEntities(am[1]).replace(/\s*izle.*$/i, "").trim();

    let airdate = "N/A";
    const ym =
      html.match(/YEAR OF PUBLICATION[\s\S]{0,80}?>(\d{4})</i) ||
      html.match(/Yapım\s*Yılı[\s\S]{0,80}?>(\d{4})</i) ||
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
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    const seriesUrl =
      p.slug && p.type !== "movie"
        ? baseUrl + "/dizi/" + p.slug
        : String(url);

    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

    const re =
      /href="((?:https?:\/\/[^"]+)?\/bolum\/([^"/]+?)-(\d+)-sezon-(\d+)-bolum\/?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      let full = absUrl(m[1]);
      const season = parseInt(m[3], 10);
      const num = parseInt(m[4], 10);
      const key = season + "-" + num;
      if (seen[key]) continue;
      // soft slug check
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0)
        continue;
      seen[key] = true;
      eps.push({
        href: full,
        number: season * 1000 + num,
        title: season + ". Sezon " + num + ". Bölüm",
      });
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    if (!eps.length && /\/bolum\//i.test(String(url))) {
      eps.push({
        href: String(url),
        number: p.episode || 1,
        title: (p.episode || 1) + ". Bölüm",
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

    // series page → first episode
    if (/\/dizi\//i.test(epUrl) && !/\/bolum\//i.test(epUrl)) {
      const seriesHtml = await getText(await soraFetch(epUrl));
      const em = seriesHtml.match(
        /href="((?:https?:\/\/[^"]+)?\/bolum\/[^"]+?-(\d+)-sezon-(\d+)-bolum\/?)"/i
      );
      // pick lowest season/ep
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

    // fallback: poster id + parse season/ep from URL
    if (!embed) {
      const p = parseHref(epUrl);
      const posterId = (epHtml.match(
        /dizi_poster_[^"'/]*_(\d+)\.(?:webp|jpg|png)/i
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

    const hlsList = extractHlsFromPlayerPage(playerHtml);
    const streams = [];
    const seen = {};

    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: playerHost + "/",
      Origin: playerHost,
    };

    for (let i = 0; i < hlsList.length; i++) {
      const media = forceHttps(hlsList[i]);
      if (!isHttp(media) || seen[media]) continue;
      seen[media] = true;
      streams.push({
        title: i === 0 ? "Videoplay · HLS" : "Videoplay · HLS " + (i + 1),
        name: i === 0 ? "Videoplay · HLS" : "Videoplay · HLS " + (i + 1),
        streamUrl: media,
        url: media,
        headers: headers,
      });
    }

    // last resort: return embed as non-playable? skip — app needs m3u8/mp4
    return JSON.stringify({ streams: streams.slice(0, 6) });
  } catch (e) {
    return JSON.stringify({ streams: [] });
  }
}
