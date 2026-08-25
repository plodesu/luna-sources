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
  for (
