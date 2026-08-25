/**
 * Anizm (anizm.net) – Sora / Luna
 * Search: /ara?s=  +  /anime-izle
 * Posters: .anizm_avatar / infoPosterImgItem / og:image
 * Streams: Çevirmenler → anizmplayer (Aincrad) / VOE / Sibnet / YourUpload / GDrive / others
 * v1.0.0
 */
const baseUrl = "https://anizm.net";
const playerBase = "https://anizmplayer.com";
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
function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/([^/?#]+)-(\d+)-bolum(?:-izle)?/i);
  if (m) {
    return {
      type: "episode",
      slug: m[1],
      epSlug: m[1] + "-" + m[2] + "-bolum",
      episode: parseInt(m[2], 10),
    };
  }
  m = s.match(/anizm\.net\/([^/?#]+)/i);
  if (m && !/^(ara|anime-izle|takvim|uyeol|hakkimizda)/i.test(m[1])) {
    return { type: "series", slug: m[1], epSlug: "", episode: 0 };
  }
  return { type: "unknown", slug: "", epSlug: "", episode: 0 };
}

function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/aincrad|anizmplayer|lokal|local/i.test(n)) return 0;
  if (/sibnet/.test(n)) return 1;
  if (/voe/.test(n)) return 2;
  if (/yourupload|yu/.test(n)) return 3;
  if (/gdrive|google|drive/.test(n)) return 4;
  if (/filemoon|moon/.test(n)) return 5;
  if (/dood/.test(n)) return 6;
  if (/streamwish|wish/.test(n)) return 7;
  return 8;
}
function labelFromUrl(u) {
  u = String(u || "").toLowerCase();
  if (/anizmplayer|aincrad/.test(u)) return "Aincrad";
  if (/sibnet/.test(u)) return "Sibnet";
  if (/voe\.sx|voe\.video/.test(u)) return "VOE";
  if (/yourupload/.test(u)) return "YourUpload";
  if (/drive\.google|googleapis|gdrive/.test(u)) return "GDrive";
  if (/filemoon|moon|bysesukior|kerapoxy|farordoms/.test(u)) return "Filemoon";
  if (/dood\./.test(u)) return "Doodstream";
  if (/streamwish|swish/.test(u)) return "StreamWish";
  return "Host";
}

/* ---------- unpack / media helpers (same family as TürkAnime) ---------- */
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
function baseN(n, base) {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (n === 0) return "0";
  let s = "";
  while (n > 0) {
    s = chars.charAt(n % base) + s;
    n = Math.floor(n / base);
  }
  return s;
}
function unpackDeanEdwards(packed) {
  const m = packed.match(
    /\}\('(.*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/s
  );
  if (!m) return packed;
  let p = m[1];
  const a = parseInt(m[2], 10);
  const c0 = parseInt(m[3], 10);
  const k = m[4].split("|");
  const dict = {};
  for (let i = 0; i < c0; i++) {
    const key = baseN(i, a);
    dict[key] = k[i] && k[i].length ? k[i] : key;
  }
  const keys = Object.keys(dict).sort(function (x, y) {
    return y.length - x.length;
  });
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (dict[key] === key) continue;
    const re = new RegExp(
      "\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "g"
    );
    p = p.replace(re, dict[key]);
  }
  return p;
}
function findMediaUrls(text) {
  const out = [];
  if (!text) return out;
  let m;
  const re =
    /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)[^"'\\\s<>]*/gi;
  while ((m = re.exec(text))) {
    let u = m[0]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\+$/g, "");
    if (isHttp(u)) out.push(forceHttps(u));
  }
  return out;
}
function dedupeUrls(arr) {
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const u = forceHttps(String(arr[i] || "").split("#")[0]);
    if (!isHttp(u) || seen[u]) continue;
    if (/jquery|bootstrap|google-analytics|facebook|cdnjs|cloudflare/i.test(u))
      continue;
    seen[u] = true;
    out.push(u);
  }
  return out;
}

/* ---------- host resolvers ---------- */
async function resolveAnizmPlayer(embedOrKey) {
  try {
    let key = String(embedOrKey || "");
    // extract key from /video/KEY or packed page
    const km = key.match(/\/video\/([a-zA-Z0-9]+)/i) || key.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/);
    if (km) key = km[1];
    if (!key || key.length < 6) return [];

    // if we were given a full page URL, fetch & unpack
    if (isHttp(embedOrKey) && /anizmplayer/i.test(embedOrKey)) {
      const html = await getText(
        await soraFetch(embedOrKey, {
          headers: { Referer: baseUrl + "/", "User-Agent": UA },
        })
      );
      if (html && /eval\(function\(p,a,c,k,e/.test(html)) {
        const pm = html.match(
          /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/
        );
        if (pm) {
          const unpacked = unpackDeanEdwards(pm[0]);
          const fk = unpacked.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/);
          if (fk) key = fk[1];
        }
      }
      const direct = findMediaUrls(html);
      if (direct.length) return dedupeUrls(direct);
    }

    const postUrl =
      playerBase + "/player/index.php?data=" + encodeURIComponent(key) + "&do=getVideo";
    const body =
      "hash=" +
      encodeURIComponent(key) +
      "&r=" +
      encodeURIComponent(baseUrl + "/");
    const res = await soraFetch(postUrl, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Referer: playerBase + "/video/" + key,
        Origin: playerBase,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "*/*",
      },
      body: body,
    });
    const text = await getText(res);
    if (!text) return [];

    // common response shapes
    let found = findMediaUrls(text);
    try {
      const j = JSON.parse(text);
      if (j.videoSource) found.push(j.videoSource);
      if (j.securedLink) found.push(j.securedLink);
      if (j.file) found.push(j.file);
      if (j.source) found.push(j.source);
      if (j.hls) found.push(j.hls);
      if (Array.isArray(j.sources)) {
        j.sources.forEach(function (s) {
          if (s.file) found.push(s.file);
          if (s.src) found.push(s.src);
        });
      }
    } catch (e) {}
    const m =
      text.match(/["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
      text.match(/["']hls["']\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
      text.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
    if (m) found.push(m[1] || m[0]);

    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveVoe(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html || html.length < 200) return [];
    const found = findMediaUrls(html);
    let m = html.match(/["']hls["']\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    if (m) found.push(m[1]);
    m = html.match(/["']file["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (m) found.push(m[1]);
    const b64s = html.match(/["']([A-Za-z0-9+/]{60,}={0,2})["']/g) || [];
    for (let i = 0; i < b64s.length && i < 8; i++) {
      try {
        const raw = b64decode(b64s[i].replace(/['"]/g, ""));
        findMediaUrls(raw).forEach(function (u) {
          found.push(u);
        });
      } catch (e) {}
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveSibnet(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html) return [];
    const found = findMediaUrls(html);
    const m =
      html.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/(https?:\/\/[^"' ]*sibnet[^"' ]+\.(?:mp4|m3u8)[^"' ]*)/i);
    if (m) {
      let u = m[1].replace(/['"]/g, "");
      if (u.indexOf("//") === 0) u = "https:" + u;
      if (isHttp(u)) found.push(u);
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveFilemoon(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html) return [];
    let text = html;
    if (/eval\(function\(p,a,c,k,e/.test(html)) {
      const pm = html.match(
        /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/
      );
      if (pm) text += "\n" + unpackDeanEdwards(pm[0]);
    }
    const found = findMediaUrls(text);
    const fm = text.match(/["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    if (fm) found.push(fm[1]);
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveGeneric(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    return dedupeUrls(findMediaUrls(html));
  } catch (e) {
    return [];
  }
}

async function resolveEmbed(embedUrl) {
  const u = forceHttps(embedUrl);
  if (/anizmplayer|aincrad/i.test(u)) return resolveAnizmPlayer(u);
  if (/voe\.sx|voe\.video/i.test(u)) return resolveVoe(u);
  if (/sibnet/i.test(u)) return resolveSibnet(u);
  if (
    /filemoon|bysesukior|kerapoxy|farordoms|moon\.|streamwish|swish/i.test(u)
  )
    return resolveFilemoon(u);
  return resolveGeneric(u);
}

function extractEmbedsFromHtml(html) {
  const out = [];
  if (!html) return out;
  let m;
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) {
    let u = absUrl(decodeEntities(m[1]));
    if (!u) continue;
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (isHttp(u)) out.push(forceHttps(u));
  }
  // data-src / player links
  const dataRe =
    /(?:data-src|data-url|href)=["']((?:https?:)?\/\/[^"']+(?:voe|sibnet|yourupload|anizmplayer|dood|filemoon|drive\.google)[^"']*)["']/gi;
  while ((m = dataRe.exec(html))) {
    let u = m[1];
    if (u.indexOf("//") === 0) u = "https:" + u;
    out.push(forceHttps(u));
  }
  const hostRe =
    /(https?:)?\/\/(?:[a-z0-9.-]+\.)?(?:anizmplayer\.com|voe\.sx|voe\.video|sibnet\.ru|yourupload\.com|dood\.(?:watch|to|so|ws|pm)|filemoon\.|drive\.google\.com)[^\s"'<>\\]+/gi;
  while ((m = hostRe.exec(html))) {
    let u = m[0];
    if (u.indexOf("//") === 0) u = "https:" + u;
    out.push(forceHttps(u));
  }
  return dedupeUrls(out);
}

/* ===================== search ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]).replace(/\/$/, "");
      if (!href || seen[href]) return;
      // series pages are /slug (no -bolum)
      if (/-bolum/i.test(href)) return;
      if (!/anizm\.net\/[^/]+$/i.test(href) && !href.startsWith(baseUrl + "/"))
        return;
      seen[href] = true;
      let img = absUrl(image || "");
      if (img.indexOf("data:") === 0) img = "";
      results.push({
        title: decodeEntities(title || "Anime")
          .replace(/\s+izle\s*$/i, "")
          .replace(/\s+/g, " ")
          .trim(),
        image: img,
        href: href,
      });
    }

    // primary search
    const searchUrl =
      baseUrl + "/ara?s=" + encodeURIComponent(cleaned);
    let html = await getText(
      await soraFetch(searchUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          Referer: baseUrl + "/",
        },
      })
    );

    if (html && html.length > 800) {
      // classic card: a.pfull + .anizm_avatar + .anizm_textUpper
      let re =
        /<a[^>]+class="[^"]*pfull[^"]*"[^>]+href="([^"]+)"[\s\S]*?(?:src|data-src)="([^"]+)"[\s\S]*?class="[^"]*anizm_textUpper[^"]*"[^>]*>([^<]+)/gi;
      let m;
      while ((m = re.exec(html))) push(m[1], m[3], m[2]);

      // alternative order
      re =
        /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[^"/?]+)"[^>]*>[\s\S]{0,400}?(?:src|data-src)="([^"]*(?:poster|avatar|cover|img)[^"]*)"[\s\S]{0,200}?>([^<]{3,80})</gi;
      while ((m = re.exec(html))) {
        if (!/-bolum/i.test(m[1])) push(m[1], m[3], m[2]);
      }

      // title + href only
      re =
        /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[a-z0-9-]+)"[^>]*title="([^"]+)"/gi;
      while ((m = re.exec(html))) {
        if (!/-bolum/i.test(m[1])) push(m[1], m[2], "");
      }
    }

    // fallback: anime-izle listing if search empty
    if (!results.length) {
      html = await getText(
        await soraFetch(baseUrl + "/anime-izle?sayfa=1", {
          headers: { "User-Agent": UA, Referer: baseUrl + "/" },
        })
      );
      if (html) {
        const re =
          /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[^"/?]+)"[\s\S]{0,300}?(?:src|data-src)="([^"]+)"[\s\S]{0,200}?class="[^"]*title[^"]*"[^>]*>([^<]+)/gi;
        let m;
        while ((m = re.exec(html))) {
          if (
            cleaned
              .toLowerCase()
              .split(/\s+/)
              .some(function (w) {
                return m[3].toLowerCase().indexOf(w) >= 0;
              })
          )
            push(m[1], m[3], m[2]);
        }
      }
    }

    return JSON.stringify(results.slice(0, 25));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    const page = p.slug ? baseUrl + "/" + p.slug : String(url);
    const html = await getText(await soraFetch(page));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/class="[^"]*infoDesc[^"]*"[^>]*>([\s\S]*?)<\//i);
    if (dm) description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);

    let aliases = "N/A";
    const am =
      html.match(/İngilizce\s*:?\s*([^<\n]{2,120})/i) ||
      html.match(/English\s*:?\s*([^<\n]{2,120})/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym =
      html.match(/Başlama Tarihi\s*:?\s*([^<\n]{2,80})/i) ||
      html.match(/Yayın Tarihi\s*:?\s*([^<\n]{2,80})/i);
    if (ym) airdate = decodeEntities(ym[1]).trim();

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
    const p = parseHref(url);
    const seriesUrl = p.slug ? baseUrl + "/" + p.slug : String(url);
    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

    // episode links: /slug-N-bolum or /slug-N-bolum-izle
    const re =
      /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/([^"/]+)-(\d+)-bolum(?:-izle)?)"[^>]*(?:title="([^"]*)")?/gi;
    let m;
    while ((m = re.exec(html))) {
      const full = absUrl(m[1]);
      const slugPart = m[2];
      const num = parseInt(m[3], 10);
      if (seen[full] || seen[num]) continue;
      // only keep episodes that belong to this series
      if (p.slug && slugPart.indexOf(p.slug) < 0 && p.slug.indexOf(slugPart) < 0)
        continue;
      seen[full] = true;
      seen[num] = true;
      const title = decodeEntities(m[4] || "") || num + ". Bölüm";
      eps.push({
        href: full,
        number: num,
        title: /\d/.test(title) ? title : num + ". Bölüm",
      });
    }

    // vertical list / episode buttons
    const re2 =
      /class="[^"]*(?:episode|bolum|verticalList)[^"]*"[^>]*>[\s\S]{0,80}?href="([^"]+-(\d+)-bolum[^"]*)"/gi;
    while ((m = re2.exec(html))) {
      const full = absUrl(m[1]);
      const num = parseInt(m[2], 10);
      if (seen[full] || seen[num]) continue;
      seen[full] = true;
      seen[num] = true;
      eps.push({ href: full, number: num, title: num + ". Bölüm" });
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    if (!eps.length) {
      eps.push({ href: String(url), number: 1, title: "1. Bölüm" });
    }
    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "1. Bölüm" },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let epUrl = url;
    if (p.type === "episode" && p.epSlug) {
      epUrl = baseUrl + "/" + p.epSlug;
      // some pages use -izle suffix
      if (!/izle$/i.test(epUrl)) epUrl += "-izle";
    } else if (p.type === "series" && p.slug) {
      // jump to first episode
      const seriesHtml = await getText(
        await soraFetch(baseUrl + "/" + p.slug)
      );
      const em = seriesHtml.match(
        /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[^"]+-1-bolum[^"]*)"/i
      );
      if (!em) return JSON.stringify({ streams: [], subtitles: "" });
      epUrl = absUrl(em[1]);
    }

    const epHtml = await getText(
      await soraFetch(epUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!epHtml || epHtml.length < 400) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const embedJobs = [];

    // 1) direct embeds on the page
    extractEmbedsFromHtml(epHtml).forEach(function (u) {
      embedJobs.push({ url: u, fansub: "" });
    });

    // 2) Çevirmenler / fansub tabs (most important)
    // CloudStream style: div.episodeTranslators / #fansec → AJAX translator links
    const transRe =
      /(?:translator|data-translator|href)=["']([^"']+)["'][^>]*>[\s\S]{0,120}?class="[^"]*title[^"]*"[^>]*>([^<]{1,40})</gi;
    let tm;
    const translatorUrls = [];
    while ((tm = transRe.exec(epHtml))) {
      let tUrl = absUrl(tm[1]);
      const name = decodeEntities(tm[2]).trim();
      if (tUrl && translatorUrls.indexOf(tUrl) < 0) {
        translatorUrls.push(tUrl);
        try {
          const th = await getText(
            await soraFetch(tUrl, {
              headers: {
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/json, text/javascript, */*; q=0.01",
                Referer: epUrl,
                "User-Agent": UA,
              },
            })
          );
          // response often JSON with player HTML or iframe
          let playerHtml = th;
          try {
            const j = JSON.parse(th);
            if (j.player) playerHtml = j.player;
            else if (j.html) playerHtml = j.html;
            else if (j.data) playerHtml = j.data;
          } catch (e) {}
          extractEmbedsFromHtml(playerHtml).forEach(function (u) {
            embedJobs.push({ url: u, fansub: name });
          });
          // also look for anizmplayer key directly
          const keyM =
            playerHtml.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/) ||
            playerHtml.match(/\/video\/([a-zA-Z0-9]+)/);
          if (keyM) {
            embedJobs.push({
              url: playerBase + "/video/" + keyM[1],
              fansub: name,
            });
          }
        } catch (e2) {}
      }
    }

    // alternative: buttons with data attributes
    const btnRe =
      /data-(?:src|url|embed|player)=["']([^"']+)["'][^>]*>[\s\S]{0,80}?>([^<]{0,30})</gi;
    while ((tm = btnRe.exec(epHtml))) {
      const u = absUrl(tm[1]);
      if (u) embedJobs.push({ url: u, fansub: decodeEntities(tm[2] || "").trim() });
    }

    // packed script on episode page itself (Aincrad)
    if (/eval\(function\(p,a,c,k,e/.test(epHtml)) {
      const pm = epHtml.match(
        /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/
      );
      if (pm) {
        const unpacked = unpackDeanEdwards(pm[0]);
        const fk = unpacked.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/);
        if (fk) {
          embedJobs.push({
            url: playerBase + "/video/" + fk[1],
            fansub: "Aincrad",
          });
        }
      }
    }

    const streams = [];
    const seen = {};
    for (let i = 0; i < embedJobs.length && streams.length < 12; i++) {
      const job = embedJobs[i];
      const host = labelFromUrl(job.url);
      const resolved = await resolveEmbed(job.url);
      for (let r = 0; r < resolved.length; r++) {
        const media = forceHttps(resolved[r]);
        if (!isHttp(media) || seen[media]) continue;
        if (!/\.(m3u8|mp4)(\?|$)/i.test(media) && media.indexOf("m3u8") < 0)
          continue;
        seen[media] = true;
        let title = host;
        if (job.fansub) title = job.fansub + " · " + host;
        const headers = {
          "User-Agent": UA,
          Referer: job.url.indexOf("anizmplayer") >= 0 ? playerBase + "/" : job.url,
          Origin: (job.url.match(/^(https?:\/\/[^/]+)/) || [null, baseUrl])[1],
          Accept: "*/*",
        };
        streams.push({
          title: title,
          name: title,
          streamUrl: media,
          headers: headers,
        });
      }
    }

    streams.sort(function (a, b) {
      return hostRank(a.title) - hostRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 10),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
