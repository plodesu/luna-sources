/**
 * AnimeVietSub (animevietsub.cv) – Sora / Luna
 * Catalog: Google Sheet (public)
 * Player: anicdn.top → vicdn.cc
 * Streams: replace .html → .m3u8 (no decrypt needed)
 * Softsub: AES-GCM decrypt VI VTT → data URI
 * v1.0.0
 */
const baseUrl = "https://www.animevietsub.cv";
const sheetId = "16lOAdRoReQ3JbVIKf-_gXL6JQa7YJ_JkwRo28IT6XS4";
const sheetGviz =
  "https://docs.google.com/spreadsheets/d/" +
  sheetId +
  "/gviz/tq?tqx=out:json&tq=";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const AES_SECRET = "vicdn_cc_key";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "*/*",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
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
function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\((?:Ss?|Season)\s*\d+\)/gi, " ")
    .replace(/\b(?:Ss?|Season)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function removeTones(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}
function escapeSql(s) {
  return String(s || "").replace(/'/g, "\\'");
}

function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/phim\/([^/?#]+)(?:\/tap-(\d+|Full))?/i);
  if (m)
    return {
      slug: m[1],
      episode: m[2] === "Full" || m[2] === "full" ? 1 : m[2] ? parseInt(m[2], 10) : 0,
    };
  return { slug: "", episode: 0 };
}

function seriesHref(slug) {
  return baseUrl + "/phim/" + slug;
}
function watchHref(slug, ep) {
  return baseUrl + "/phim/" + slug + "/tap-" + ep;
}

function epCountFromStatus(trang_thai) {
  const s = String(trang_thai || "");
  const nums = s.match(/\d+/g);
  if (!nums || !nums.length) return s.toLowerCase().indexOf("full") >= 0 ? 1 : 1;
  let max = 0;
  for (let i = 0; i < nums.length; i++) {
    const n = parseInt(nums[i], 10);
    if (n > max) max = n;
  }
  return max || 1;
}

async function sheetQuery(sql) {
  const url = sheetGviz + encodeURIComponent(sql);
  const text = await getText(await soraFetch(url));
  if (!text) return [];
  const m = text.match(/google\.visualization\.Query\.setResponse\((\{[\s\S]*\})\)\s*;?\s*$/);
  let jsonStr = m ? m[1] : null;
  if (!jsonStr) {
    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i >= 0 && j > i) jsonStr = text.substring(i, j + 1);
  }
  if (!jsonStr) return [];
  try {
    const data = JSON.parse(jsonStr);
    return (data.table && data.table.rows) || [];
  } catch (e) {
    return [];
  }
}

function rowCells(row) {
  const c = (row && row.c) || [];
  return c.map(function (x) {
    return x && x.v != null ? x.v : "";
  });
}

/* ========== Dean Edwards packer unpack ========== */
function encodeDe(n, radix) {
  function e(c) {
    const r = c % radix;
    const digit =
      r > 35
        ? String.fromCharCode(r + 29)
        : "0123456789abcdefghijklmnopqrstuvwxyz".charAt(r);
    return (c < radix ? "" : e((c / radix) | 0)) + digit;
  }
  return e(n);
}

function unpackPacker(source) {
  const m = source.match(
    /\}\('(.*)',(\d+),(\d+),'(.*)'\.split\('\|'\)/s
  );
  if (!m) return "";
  let payload = m[1];
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const kw = m[4].split("|");
  const word = {};
  for (let i = 0; i < c; i++) {
    word[encodeDe(i, a)] = kw[i] ? kw[i] : encodeDe(i, a);
  }
  return payload.replace(/\b\w+\b/g, function (tok) {
    return word[tok] != null ? word[tok] : tok;
  });
}

function extractPlayerUrls(html) {
  const out = { audio: [], subs: [] };
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let unpacked = "";
  for (let i = 0; i < scripts.length; i++) {
    const body = scripts[i].replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    if (body.indexOf("eval(function(p,a,c,k,e,d)") >= 0 && body.length > 3000) {
      unpacked = unpackPacker(body);
      if (unpacked.indexOf("vicdn.cc") >= 0) break;
    }
  }
  if (!unpacked) return out;

  // AUDIO_SOURCES.* = 'https://vicdn.cc/hls/...'
  const audioRe =
    /AUDIO_SOURCES\.\w+\s*=\s*'(https?:\/\/vicdn\.cc\/hls\/[^']+)'/g;
  let m;
  const labels = {
    original: "Audio Gốc",
    female: "Thuyết Minh Nữ",
    male: "Thuyết Minh Nam",
  };
  const labelRe =
    /AUDIO_LABELS\.(\w+)\s*=\s*'([^']*)'/g;
  const labelMap = {};
  while ((m = labelRe.exec(unpacked))) {
    labelMap[m[1]] = m[2];
  }
  while ((m = audioRe.exec(unpacked))) {
    let u = m[0].match(/AUDIO_SOURCES\.(\w+)/);
    const key = u ? u[1] : "original";
    let url = m[1].replace(/\.html$/i, ".m3u8");
    out.audio.push({
      key: key,
      title: labelMap[key] || labels[key] || key,
      url: url,
    });
  }
  // fallback any vicdn hls
  if (!out.audio.length) {
    const any = unpacked.match(/https?:\/\/vicdn\.cc\/hls\/[^"'\s]+/g) || [];
    const seen = {};
    for (let i = 0; i < any.length; i++) {
      let url = any[i].replace(/\.html$/i, ".m3u8");
      if (seen[url]) continue;
      seen[url] = true;
      out.audio.push({ key: "s" + i, title: "Server " + (i + 1), url: url });
    }
  }

  const vi = unpacked.match(
    /VTT_VI_URL\s*=\s*'(https?:\/\/vicdn\.cc\/subtitle\/[^']+)'/
  );
  const en = unpacked.match(
    /VTT_EN_URL\s*=\s*'(https?:\/\/vicdn\.cc\/subtitle\/[^']+)'/
  );
  if (vi) out.subs.push({ lang: "vi", label: "Tiếng Việt", url: vi[1] });
  if (en) out.subs.push({ lang: "en", label: "English", url: en[1] });
  return out;
}

/* ========== AES-GCM for softsub only ========== */
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}

async function decryptVicdnText(url) {
  try {
    const res = await soraFetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://vicdn.cc/",
        Origin: "https://vicdn.cc",
        Accept: "*/*",
      },
    });
    const txt = await getText(res);
    if (!txt) return "";
    if (txt.indexOf("#ENC-AESGCM") < 0) {
      // already plain
      if (txt.indexOf("WEBVTT") === 0 || txt.indexOf("#EXTM3U") === 0) return txt;
      return "";
    }
    const ivM = txt.match(/#ENC-AESGCM;iv=([0-9a-fA-F]+)/);
    if (!ivM || !crypto || !crypto.subtle) return "";
    const iv = hexToBytes(ivM[1]);
    const lines = txt.trim().split("\n");
    const b64 = lines[lines.length - 1];
    const bin = atob(b64);
    const enc = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) enc[i] = bin.charCodeAt(i);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(AES_SECRET)
    );
    const key = await crypto.subtle.importKey(
      "raw",
      hash,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, enc);
    return new TextDecoder().decode(dec);
  } catch (e) {
    return "";
  }
}

function toDataUri(text, mime) {
  try {
    // base64
    const b64 = btoa(unescape(encodeURIComponent(text)));
    return "data:" + mime + ";base64," + b64;
  } catch (e) {
    return "";
  }
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const q = escapeSql(cleaned.toLowerCase());
    const slugQ = escapeSql(
      removeTones(cleaned).toLowerCase().replace(/\s+/g, "-")
    );
    const sql =
      "select C,D,E,F,L where lower(D) contains '" +
      q +
      "' or lower(E) contains '" +
      q +
      "' or lower(C) contains '" +
      slugQ +
      "' limit 25";
    const rows = await sheetQuery(sql);
    const results = [];
    const seen = {};
    for (let i = 0; i < rows.length; i++) {
      const cells = rowCells(rows[i]);
      // C slug, D ten_phim, E ten_goc, F thumb, L trang_thai
      const slug = String(cells[0] || "");
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      const title = String(cells[1] || slug);
      const eng = String(cells[2] || "");
      results.push({
        title: eng ? title + " (" + eng + ")" : title,
        image: absUrl(String(cells[3] || "")),
        href: seriesHref(slug),
      });
    }
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const p = parseHref(url);
    if (!p.slug)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    const sql =
      "select D,E,N,H,L where C = '" + escapeSql(p.slug) + "' limit 1";
    const rows = await sheetQuery(sql);
    if (!rows.length)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    const c = rowCells(rows[0]);
    // D title, E eng, N noi_dung?, depends on select order: D,E,N,H,L
    return JSON.stringify([
      {
        description: String(c[2] || "N/A").slice(0, 900),
        aliases: String(c[1] || c[0] || "N/A"),
        airdate: String(c[3] || "N/A"),
      },
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
    if (!p.slug) return JSON.stringify([]);
    const sql = "select L where C = '" + escapeSql(p.slug) + "' limit 1";
    const rows = await sheetQuery(sql);
    let count = 1;
    if (rows.length) {
      const st = String(rowCells(rows[0])[0] || "");
      count = epCountFromStatus(st);
    }
    const eps = [];
    for (let i = 1; i <= count; i++) {
      eps.push({
        href: watchHref(p.slug, i),
        number: i,
        title: "Tập " + i,
      });
    }
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    if (!p.slug)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });
    const ep = p.episode || 1;
    const playerUrl = "https://anicdn.top/" + p.slug + "/" + ep;
    const html = await getText(
      await soraFetch(playerUrl, {
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const parsed = extractPlayerUrls(html);
    const headers = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: "https://vicdn.cc/",
      Origin: "https://vicdn.cc",
    };

    const streams = [];
    const seen = {};
    // Prefer original (usually hardsub VS), then TM
    const order = ["original", "female", "male"];
    parsed.audio.sort(function (a, b) {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      return (ai < 0 ? 9 : ai) - (bi < 0 ? 9 : bi);
    });
    for (let i = 0; i < parsed.audio.length; i++) {
      const a = parsed.audio[i];
      const media = forceHttps(a.url);
      if (!isHttp(media) || seen[media]) continue;
      seen[media] = true;
      streams.push({
        title: a.title || "Server " + (i + 1),
        streamUrl: media,
        headers: headers,
      });
    }

    // Softsub VI
    let viUrl = "";
    let enUrl = "";
    for (let i = 0; i < parsed.subs.length; i++) {
      const sub = parsed.subs[i];
      const plain = await decryptVicdnText(sub.url);
      if (!plain || plain.indexOf("WEBVTT") < 0) continue;
      const dataUri = toDataUri(plain, "text/vtt");
      if (sub.lang === "vi" && dataUri) viUrl = dataUri;
      if (sub.lang === "en" && dataUri) enUrl = dataUri;
    }
    const subPrimary = viUrl || enUrl || "";
    for (let i = 0; i < streams.length; i++) {
      if (subPrimary) streams[i].subtitle = subPrimary;
    }

    const primary = streams.length ? streams[0].streamUrl : "";
    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 8),
      subtitle: subPrimary,
      subtitles: subPrimary,
      subtitleHeaders: headers,
      subtitlesHeaders: headers,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
