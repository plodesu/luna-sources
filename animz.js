/**
 * Anizm (anizm.net) – Sora / Luna
 * v1.0.1 – fixed hang on search + stronger Cloudflare/selector resilience
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
      "Cache-Control": "no-cache",
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
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
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
  if (m && !/^(ara|anime-izle|takvim|uyeol|hakkimizda|profil)/i.test(m[1])) {
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
  return 7;
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
  return "Host";
}

/* ---------- unpack helpers ---------- */
function b64decode(str) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (n === 0) return "0";
  let s = "";
  while (n > 0) {
    s = chars.charAt(n % base) + s;
    n = Math.floor(n / base);
  }
  return s;
}
function unpackDeanEdwards(packed) {
  const m = packed.match(/\}\('(.*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/s);
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
  const keys = Object.keys(dict).sort((x, y) => y.length - x.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (dict[key] === key) continue;
    const re = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    p = p.replace(re, dict[key]);
  }
  return p;
}
function findMediaUrls(text) {
  const out = [];
  if (!text) return out;
  let m;
  const re = /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)[^"'\\\s<>]*/gi;
  while ((m = re.exec(text))) {
    let u = m[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\+$/g, "");
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
    if (/jquery|bootstrap|google-analytics|facebook|cdnjs|cloudflare/i.test(u)) continue;
    seen[u] = true;
    out.push(u);
  }
  return out;
}

/* ---------- resolvers ---------- */
async function resolveAnizmPlayer(embedOrKey) {
  try {
    let key = String(embedOrKey || "");
    const km = key.match(/\/video\/([a-zA-Z0-9]+)/i) || key.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/);
    if (km) key = km[1];
    if (!key || key.length < 5) return [];

    if (isHttp(embedOrKey) && /anizmplayer/i.test(embedOrKey)) {
      const html = await getText(await soraFetch(embedOrKey, { headers: { Referer: baseUrl + "/" } }));
      if (html && /eval\(function\(p,a,c,k,e/.test(html)) {
        const pm = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/);
        if (pm) {
          const unpacked = unpackDeanEdwards(pm[0]);
          const fk = unpacked.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/);
          if (fk) key = fk[1];
        }
      }
      const direct = findMediaUrls(html);
      if (direct.length) return dedupeUrls(direct);
    }

    const postUrl = playerBase + "/player/index.php?data=" + encodeURIComponent(key) + "&do=getVideo";
    const body = "hash=" + encodeURIComponent(key) + "&r=" + encodeURIComponent(baseUrl + "/");
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
      body,
    });
    const text = await getText(res);
    if (!text) return [];

    let found = findMediaUrls(text);
    try {
      const j = JSON.parse(text);
      if (j.videoSource) found.push(j.videoSource);
      if (j.securedLink) found.push(j.securedLink);
      if (j.file) found.push(j.file);
      if (j.source) found.push(j.source);
      if (j.hls) found.push(j.hls);
      if (Array.isArray(j.sources)) {
        j.sources.forEach((s) => {
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
    const html = await getText(await soraFetch(embedUrl, { headers: { Referer: baseUrl + "/" } }));
    if (!html || html.length < 200) return [];
    const found = findMediaUrls(html);
    let m = html.match(/["']hls["']\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    if (m) found.push(m[1]);
    m = html.match(/["']file["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (m) found.push(m[1]);
    const b64s = html.match(/["']([A-Za-z0-9+/]{60,}={0,2})["']/g) || [];
    for (let i = 0; i < Math.min(b64s.length, 8); i++) {
      try {
        findMediaUrls(b64decode(b64s[i].replace(/['"]/g, ""))).forEach((u) => found.push(u));
      } catch (e) {}
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveSibnet(embedUrl) {
  try {
    const html = await getText(await soraFetch(embedUrl, { headers: { Referer: baseUrl + "/" } }));
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
    const html = await getText(await soraFetch(embedUrl, { headers: { Referer: baseUrl + "/" } }));
    if (!html) return [];
    let text = html;
    if (/eval\(function\(p,a,c,k,e/.test(html)) {
      const pm = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/);
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
    const html = await getText(await soraFetch(embedUrl, { headers: { Referer: baseUrl + "/" } }));
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
  if (/filemoon|bysesukior|kerapoxy|farordoms|moon\.|streamwish|swish/i.test(u))
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

/* ===================== SEARCH (fixed hang) ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]).replace(/\/$/, "");
      if (!href || seen[href]) return;
      if (/-bolum/i.test(href)) return;                 // skip episodes
      if (!/anizm\.net\/[a-z0-9-]+$/i.test(href)) return;
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

    // 1) primary search endpoint
    const searchUrl = baseUrl + "/ara?s=" + encodeURIComponent(cleaned);
    let html = await getText(
      await soraFetch(searchUrl, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*", Referer: baseUrl + "/" },
      })
    );

    // Cloudflare challenge page → empty result instead of hang
    if (!html || html.length < 500 || /Just a moment|cf-browser-verification|challenge-platform/i.test(html)) {
      return JSON.stringify([]);
    }

    // multiple selector patterns (site changes often)
    const patterns = [
      // classic pfull cards
      /<a[^>]+class="[^"]*pfull[^"]*"[^>]+href="([^"]+)"[\s\S]{0,600}?(?:src|data-src)="([^"]+)"[\s\S]{0,300}?class="[^"]*anizm_textUpper[^"]*"[^>]*>([^<]+)/gi,
      // title + href
      /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[a-z0-9-]+)"[^>]*(?:title|data-title)="([^"]+)"/gi,
      // any series link + nearby image
      /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[a-z0-9-]+)"[\s\S]{0,400}?(?:src|data-src)="([^"]*(?:poster|avatar|cover|img|anizm)[^"]*)"[\s\S]{0,200}?>([^<]{3,90})</gi,
      // simple text links
      /<a[^>]+href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[a-z0-9-]+)"[^>]*>([^<]{3,80})<\/a>/gi,
    ];

    for (const re of patterns) {
      let m;
      while ((m = re.exec(html))) {
        if (m.length >= 4) push(m[1], m[3] || m[2], m[2]);
        else if (m.length === 3) push(m[1], m[2], "");
      }
      if (results.length >= 8) break;
    }

    // 2) fallback – scrape “anime-izle” list and filter by keyword
    if (results.length < 3) {
      const listHtml = await getText(
        await soraFetch(baseUrl + "/anime-izle?sayfa=1", {
          headers: { "User-Agent": UA, Referer: baseUrl + "/" },
        })
      );
      if (listHtml && listHtml.length > 800 && !/Just a moment/i.test(listHtml)) {
        const re =
          /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[a-z0-9-]+)"[\s\S]{0,350}?(?:src|data-src)="([^"]+)"[\s\S]{0,250}?>([^<]{3,90})</gi;
        let m;
        const kw = cleaned.toLowerCase().split(/\s+/);
        while ((m = re.exec(listHtml))) {
          const title = (m[3] || "").toLowerCase();
          if (kw.some((w) => title.indexOf(w) >= 0)) {
            push(m[1], m[3], m[2]);
          }
        }
      }
    }

    return JSON.stringify(results.slice(0, 25));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const p = parseHref(url);
    const page = p.slug ? baseUrl + "/" + p.slug : String(url);
    const html = await getText(await soraFetch(page));
    if (!html || /Just a moment/i.test(html)) {
      return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
    }

    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/class="[^"]*infoDesc[^"]*"[^>]*>([\s\S]*?)<\//i);
    if (dm) description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);

    let aliases = "N/A";
    const am = html.match(/İngilizce\s*:?\s*([^<\n]{2,120})/i) || html.match(/English\s*:?\s*([^<\n]{2,120})/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym = html.match(/Başlama Tarihi\s*:?\s*([^<\n]{2,80})/i) || html.match(/Yayın Tarihi\s*:?\s*([^<\n]{2,80})/i);
    if (ym) airdate = decodeEntities(ym[1]).trim();

    return JSON.stringify([{ description, aliases, airdate }]);
  } catch (e) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

/* ===================== EPISODES ===================== */
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    const seriesUrl = p.slug ? baseUrl + "/" + p.slug : String(url);
    const html = await getText(await soraFetch(seriesUrl));
    if (!html || /Just a moment/i.test(html)) {
      return JSON.stringify([{ href: String(url), number: 1, title: "1. Bölüm" }]);
    }

    const eps = [];
    const seen = {};

    const re =
      /href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/([^"/]+)-(\d+)-bolum(?:-izle)?)"[^>]*(?:title="([^"]*)")?/gi;
    let m;
    while ((m = re.exec(html))) {
      const full = absUrl(m[1]);
      const num = parseInt(m[3], 10);
      if (seen[full] || seen[num]) continue;
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0) continue;
      seen[full] = true;
      seen[num] = true;
      const title = decodeEntities(m[4] || "") || num + ". Bölüm";
      eps.push({
        href: full,
        number: num,
        title: /\d/.test(title) ? title : num + ". Bölüm",
      });
    }

    eps.sort((a, b) => a.number - b.number);
    if (!eps.length) {
      eps.push({ href: String(url), number: 1, title: "1. Bölüm" });
    }
    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([{ href: String(url), number: 1, title: "1. Bölüm" }]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let epUrl = url;
    if (p.type === "episode" && p.epSlug) {
      epUrl = baseUrl + "/" + p.epSlug;
      if (!/izle$/i.test(epUrl)) epUrl += "-izle";
    } else if (p.type === "series" && p.slug) {
      const seriesHtml = await getText(await soraFetch(baseUrl + "/" + p.slug));
      const em = seriesHtml.match(/href="((?:https?:\/\/(?:www\.)?anizm\.net)?\/[^"]+-1-bolum[^"]*)"/i);
      if (!em) return JSON.stringify({ streams: [], subtitles: "" });
      epUrl = absUrl(em[1]);
    }

    const epHtml = await getText(
      await soraFetch(epUrl, { headers: { Referer: baseUrl + "/", "User-Agent": UA } })
    );
    if (!epHtml || epHtml.length < 400 || /Just a moment/i.test(epHtml)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const embedJobs = [];

    // direct embeds
    extractEmbedsFromHtml(epHtml).forEach((u) => embedJobs.push({ url: u, fansub: "" }));

    // Çevirmenler / fansub tabs
    const transRe =
      /(?:translator|data-translator|href)=["']([^"']+)["'][^>]*>[\s\S]{0,120}?class="[^"]*title[^"]*"[^>]*>([^<]{1,40})</gi;
    let tm;
    const done = {};
    while ((tm = transRe.exec(epHtml))) {
      const tUrl = absUrl(tm[1]);
      const name = decodeEntities(tm[2]).trim();
      if (!tUrl || done[tUrl]) continue;
      done[tUrl] = true;
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
        let playerHtml = th;
        try {
          const j = JSON.parse(th);
          if (j.player) playerHtml = j.player;
          else if (j.html) playerHtml = j.html;
          else if (j.data) playerHtml = j.data;
        } catch (e) {}
        extractEmbedsFromHtml(playerHtml).forEach((u) => embedJobs.push({ url: u, fansub: name }));
        const keyM =
          playerHtml.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/) ||
          playerHtml.match(/\/video\/([a-zA-Z0-9]+)/);
        if (keyM) {
          embedJobs.push({ url: playerBase + "/video/" + keyM[1], fansub: name || "Aincrad" });
        }
      } catch (e2) {}
    }

    // data attributes
    const btnRe = /data-(?:src|url|embed|player)=["']([^"']+)["'][^>]*>[\s\S]{0,80}?>([^<]{0,30})</gi;
    while ((tm = btnRe.exec(epHtml))) {
      const u = absUrl(tm[1]);
      if (u) embedJobs.push({ url: u, fansub: decodeEntities(tm[2] || "").trim() });
    }

    // packed script on page
    if (/eval\(function\(p,a,c,k,e/.test(epHtml)) {
      const pm = epHtml.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/);
      if (pm) {
        const unpacked = unpackDeanEdwards(pm[0]);
        const fk = unpacked.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/);
        if (fk) {
          embedJobs.push({ url: playerBase + "/video/" + fk[1], fansub: "Aincrad" });
        }
      }
    }

    const streams = [];
    const seen = {};
    for (let i = 0; i < embedJobs.length && streams.length < 10; i++) {
      const job = embedJobs[i];
      const host = labelFromUrl(job.url);
      const resolved = await resolveEmbed(job.url);
      for (let r = 0; r < resolved.length; r++) {
        const media = forceHttps(resolved[r]);
        if (!isHttp(media) || seen[media]) continue;
        if (!/\.(m3u8|mp4)(\?|$)/i.test(media) && media.indexOf("m3u8") < 0) continue;
        seen[media] = true;
        let title = host;
        if (job.fansub) title = job.fansub + " · " + host;
        streams.push({
          title,
          name: title,
          streamUrl: media,
          headers: {
            "User-Agent": UA,
            Referer: /anizmplayer/i.test(job.url) ? playerBase + "/" : job.url,
            Origin: (job.url.match(/^(https?:\/\/[^/]+)/) || [null, baseUrl])[1],
            Accept: "*/*",
          },
        });
      }
    }

    streams.sort((a, b) => hostRank(a.title) - hostRank(b.title));
    return JSON.stringify({ streams: streams.slice(0, 10), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
