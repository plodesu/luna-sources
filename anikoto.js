/**
 * Anikoto (anikototv.to) – Sora / Luna
 * Search: /filter?keyword=
 * Episodes: /ajax/episode/list/{showId}
 * Servers: /ajax/server/list?servers={data-ids}
 * Source: /ajax/server?get={link-id} → megaplay → /stream/getSources?id=
 * Softsub: MegaPlay VTT → data URI (Sora) + OpenSubtitles v3 (Luna, header-free)
 * v1.0.3
 */
const baseUrl = "https://anikototv.to";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const OS_V3 = "https://opensubtitles-v3.strem.io";
const CINEMETA = "https://v3-cinemeta.strem.io";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/json,*/*",
      Referer: baseUrl + "/",
      "Accept-Encoding": "identity",
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
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\((?:Ss?|Season)\s*\d+\)/gi, " ")
    .replace(/\b(?:Ss?|Season)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWatch(url) {
  const s = String(url || "");
  const m = s.match(/\/watch\/([^/?#]+)(?:\/ep-([^/?#]+))?/i);
  return {
    slug: m ? m[1] : "",
    ep: m && m[2] ? m[2] : "",
    watchBase: m ? baseUrl + "/watch/" + m[1] : s.split("#")[0],
  };
}

async function getJson(url, referer) {
  const html = await getText(
    await soraFetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: referer || baseUrl + "/",
        "Accept-Encoding": "identity",
      },
    })
  );
  if (!html) return null;
  try {
    return JSON.parse(html);
  } catch (e) {
    return null;
  }
}

function subHeaders() {
  return {
    "User-Agent": UA,
    Referer: "https://megaplay.buzz/",
    Origin: "https://megaplay.buzz",
    Accept: "text/vtt,text/plain,*/*",
  };
}

function rankSubLabel(label) {
  const l = String(label || "").toLowerCase();
  if (l.indexOf("english") >= 0 || l === "en" || l === "eng") return 0;
  if (l.indexOf("spanish") >= 0 || l === "es" || l === "spa") return 1;
  if (l.indexOf("portuguese") >= 0 || l === "pt" || l === "por") return 2;
  if (l.indexOf("indonesian") >= 0 || l === "id" || l === "ind") return 3;
  if (l.indexOf("thai") >= 0 || l === "th") return 4;
  if (l.indexOf("french") >= 0 || l === "fr" || l === "fra") return 5;
  if (l.indexOf("german") >= 0 || l === "de" || l === "deu") return 6;
  return 10;
}

const LANG_NAMES = {
  en: "English",
  eng: "English",
  es: "Spanish",
  spa: "Spanish",
  pt: "Portuguese",
  por: "Portuguese",
  pob: "Portuguese (BR)",
  fr: "French",
  fra: "French",
  fre: "French",
  de: "German",
  deu: "German",
  ger: "German",
  id: "Indonesian",
  ind: "Indonesian",
  th: "Thai",
  tha: "Thai",
  it: "Italian",
  ita: "Italian",
  pl: "Polish",
  pol: "Polish",
  ru: "Russian",
  rus: "Russian",
  zh: "Chinese",
  zho: "Chinese",
  chi: "Chinese",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  ar: "Arabic",
  ara: "Arabic",
  vi: "Vietnamese",
  vie: "Vietnamese",
  tr: "Turkish",
  tur: "Turkish",
  uk: "Ukrainian",
  ukr: "Ukrainian",
};

function langLabel(code) {
  return LANG_NAMES[String(code || "").toLowerCase()] || String(code || "Sub");
}

function toDataUri(text, mime) {
  try {
    const s = String(text || "");
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else if (c < 2048) bytes.push(192 | (c >> 6), 128 | (c & 63));
      else
        bytes.push(
          224 | (c >> 12),
          128 | ((c >> 6) & 63),
          128 | (c & 63)
        );
    }
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += chars[a >> 2];
      out += chars[((a & 3) << 4) | (b >> 4)];
      out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
      out += i + 2 < bytes.length ? chars[c & 63] : "=";
    }
    return "data:" + mime + ";base64," + out;
  } catch (e) {
    return "";
  }
}

async function fetchVttText(vttUrl) {
  try {
    const text = await getText(
      await soraFetch(vttUrl, { headers: subHeaders() })
    );
    if (!text || text.indexOf("WEBVTT") < 0) return "";
    return text;
  } catch (e) {
    return "";
  }
}

async function enrichTracks(tracks) {
  const out = [];
  const limit = Math.min(tracks.length, 6);
  for (let i = 0; i < limit; i++) {
    const t = tracks[i];
    const raw = await fetchVttText(t.url);
    let url = t.url;
    if (raw) {
      const data = toDataUri(raw, "text/vtt");
      if (data) url = data;
    }
    out.push({
      url: url,
      label: t.label || "Sub",
      language: t.label || "Sub",
      headers: raw ? {} : subHeaders(),
      source: "site",
    });
  }
  return out;
}

/* ---------- OpenSubtitles (header-free → Luna) ---------- */
function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveImdb(title) {
  try {
    const q = cleanQuery(title)
      .replace(/\s+season\s+\d+/gi, "")
      .replace(/\s+sub\/dub.*$/i, "")
      .trim();
    if (!q) return "";
    const url =
      CINEMETA +
      "/catalog/series/top/search=" +
      encodeURIComponent(q) +
      ".json";
    const data = await getJson(url, "https://app.strem.io/");
    if (!data || !Array.isArray(data.metas) || !data.metas.length) return "";
    const nq = normTitle(q);
    let best = data.metas[0];
    for (let i = 0; i < data.metas.length; i++) {
      const m = data.metas[i];
      const nm = normTitle(m.name || "");
      if (nm === nq || nm.indexOf(nq) >= 0 || nq.indexOf(nm) >= 0) {
        best = m;
        break;
      }
    }
    const id = String(best.id || "");
    return /^tt\d+/.test(id) ? id : "";
  } catch (e) {
    return "";
  }
}

async function fetchOpenSubs(imdbId, season, episode) {
  const out = [];
  if (!imdbId) return out;
  try {
    const s = parseInt(season, 10) || 1;
    const e = parseInt(episode, 10) || 1;
    const path =
      OS_V3 +
      "/subtitles/series/" +
      encodeURIComponent(imdbId + ":" + s + ":" + e) +
      ".json";
    const data = await getJson(path, "https://app.strem.io/");
    const list = (data && data.subtitles) || [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const sub = list[i];
      if (!sub || !sub.url) continue;
      const lang = String(sub.lang || sub.language || "en").toLowerCase();
      if (seen[lang]) continue;
      seen[lang] = true;
      const base = langLabel(lang);
      out.push({
        url: forceHttps(sub.url),
        label: base + " (OS)",
        language: base + " (OS)",
        headers: {},
        source: "os",
      });
      if (out.length >= 10) break;
    }
    out.sort(function (a, b) {
      return rankSubLabel(a.label) - rankSubLabel(b.label);
    });
  } catch (e) {}
  return out;
}

async function extractShowTitle(pageHtml) {
  const tM =
    pageHtml.match(/property="og:title"\s+content="([^"]+)"/i) ||
    pageHtml.match(/<h1[^>]*>\s*([\s\S]*?)<\/h1>/i);
  if (!tM) return "";
  return tM[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s*Episode\s*\d+.*$/i, "")
    .replace(/\s*-\s*Anikoto.*$/i, "")
    .replace(/^Watch\s+/i, "")
    .replace(/\s+Anime\s+English.*$/i, "")
    .replace(/\s+English\s+SUB\/DUB.*$/i, "")
    .trim();
}

function guessSeasonEpisode(url, title) {
  const epM = String(url).match(/\/ep-([^/?#]+)/i);
  const ep = epM ? parseFloat(epM[1]) : 1;
  let season = 1;
  const sm =
    String(title).match(/Season\s*(\d+)/i) ||
    String(url).match(/season[-_]?(\d+)/i);
  if (sm) season = parseInt(sm[1], 10) || 1;
  return { season: season, episode: ep };
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);
    const html = await getText(
      await soraFetch(baseUrl + "/filter?keyword=" + encodeURIComponent(q))
    );
    if (!html) return JSON.stringify([]);
    const results = [];
    const seen = {};
    const re =
      /<a class="name d-title"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      let href = absUrl(m[1]).replace(/\/ep-[^/]*$/i, "");
      if (seen[href]) continue;
      seen[href] = true;
      const title = m[2].replace(/&amp;/g, "&").trim();
      let image = "";
      const before = html.substring(Math.max(0, m.index - 1200), m.index);
      const im = before.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
      if (im) image = im[1];
      results.push({ title: title, image: image, href: href });
    }
    if (!results.length) {
      const re2 =
        /href="(https?:\/\/anikototv\.to\/watch\/[^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/gi;
      while ((m = re2.exec(html))) {
        let href = m[1].replace(/\/ep-[^/]*$/i, "");
        if (seen[href]) continue;
        seen[href] = true;
        results.push({
          title: (m[3] || href).replace(/&amp;/g, "&"),
          image: m[2],
          href: href,
        });
      }
    }
    return JSON.stringify(results.slice(0, 40));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const w = parseWatch(url);
    const pageUrl = w.ep
      ? w.watchBase + "/ep-" + w.ep
      : w.watchBase + (w.watchBase.indexOf("/ep-") >= 0 ? "" : "/ep-1");
    const html = await getText(await soraFetch(pageUrl));
    if (!html)
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    let title = "";
    const tM =
      html.match(/property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<h1[^>]*>\s*([\s\S]*?)<\/h1>/i);
    if (tM) title = tM[1].replace(/<[^>]+>/g, "").trim();
    let desc = "";
    const dM =
      html.match(/property="og:description"\s+content="([^"]+)"/i) ||
      html.match(/class="description"[^>]*>\s*([\s\S]*?)<\/div>/i);
    if (dM)
      desc = dM[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
    return JSON.stringify([
      {
        description: (desc || "N/A").slice(0, 900),
        aliases: title || "N/A",
        airdate: "N/A",
      },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

async function resolveShowId(url) {
  const w = parseWatch(url);
  let pageUrl = w.watchBase;
  if (!/\/ep-/i.test(pageUrl))
    pageUrl = pageUrl.replace(/\/?$/, "") + "/ep-1";
  const html = await getText(await soraFetch(pageUrl));
  if (!html) return { showId: "", pageUrl: pageUrl, html: "" };
  const m =
    html.match(/id="watch-main"[^>]*data-id="(\d+)"/i) ||
    html.match(/data-id="(\d+)"[^>]*data-url=/i);
  return { showId: m ? m[1] : "", pageUrl: pageUrl, html: html };
}

/* ===================== EPISODES ===================== */
async function extractEpisodes(url) {
  try {
    const info = await resolveShowId(url);
    if (!info.showId) return JSON.stringify([]);
    const data = await getJson(
      baseUrl + "/ajax/episode/list/" + info.showId,
      info.pageUrl
    );
    if (!data || !data.result) return JSON.stringify([]);
    const html = String(data.result);
    const eps = [];
    const seen = {};
    const re =
      /<a[^>]*data-id="(\d+)"[^>]*data-num="([^"]+)"[^>]*data-ids="([^"]+)"[^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const num = parseFloat(m[2]);
      if (!num || seen[num]) continue;
      seen[num] = true;
      const w = parseWatch(info.pageUrl);
      eps.push({
        href:
          baseUrl +
          "/watch/" +
          w.slug +
          "/ep-" +
          m[2] +
          "#eid=" +
          m[1] +
          "&ids=" +
          encodeURIComponent(m[3]),
        number: num,
        title: "Episode " + m[2],
      });
    }
    if (!eps.length) {
      const re2 =
        /data-num="([^"]+)"[^>]*data-id="(\d+)"[^>]*data-ids="([^"]+)"/gi;
      while ((m = re2.exec(html))) {
        const num = parseFloat(m[1]);
        if (!num || seen[num]) continue;
        seen[num] = true;
        const w = parseWatch(info.pageUrl);
        eps.push({
          href:
            baseUrl +
            "/watch/" +
            w.slug +
            "/ep-" +
            m[1] +
            "#eid=" +
            m[2] +
            "&ids=" +
            encodeURIComponent(m[3]),
          number: num,
          title: "Episode " + m[1],
        });
      }
    }
    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

function parseHashParams(url) {
  const out = { eid: "", ids: "", ep: "" };
  const s = String(url || "");
  const h = s.split("#")[1] || "";
  h.split("&").forEach(function (p) {
    const kv = p.split("=");
    if (kv[0] === "eid") out.eid = decodeURIComponent(kv[1] || "");
    if (kv[0] === "ids") out.ids = decodeURIComponent(kv[1] || "");
  });
  const epM = s.match(/\/ep-([^/?#]+)/i);
  if (epM) out.ep = epM[1];
  return out;
}

async function ensureEpisodeTokens(url) {
  const hash = parseHashParams(url);
  if (hash.ids) return hash;
  const info = await resolveShowId(url);
  if (!info.showId) return hash;
  const data = await getJson(
    baseUrl + "/ajax/episode/list/" + info.showId,
    info.pageUrl
  );
  if (!data || !data.result) return hash;
  const html = String(data.result);
  const want = hash.ep || "1";
  const re = new RegExp(
    'data-num="' +
      want.replace(".", "\\.") +
      '"[^>]*data-id="(\\d+)"[^>]*data-ids="([^"]+)"|data-id="(\\d+)"[^>]*data-num="' +
      want.replace(".", "\\.") +
      '"[^>]*data-ids="([^"]+)"',
    "i"
  );
  const m = html.match(re);
  if (m) {
    hash.eid = m[1] || m[3] || "";
    hash.ids = m[2] || m[4] || "";
  }
  return hash;
}

async function resolveMegaplay(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html) return { stream: "", tracks: [] };

    const idM =
      html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/i) ||
      html.match(/data-id="(\d+)"[^>]*data-realid/i) ||
      html.match(/data-id="(\d+)"/i);
    if (!idM) return { stream: "", tracks: [] };

    const src = await getJson(
      "https://megaplay.buzz/stream/getSources?id=" + idM[1],
      embedUrl
    );
    if (!src) return { stream: "", tracks: [] };

    let file = "";
    if (src.sources) {
      if (typeof src.sources.file === "string") file = src.sources.file;
      else if (Array.isArray(src.sources) && src.sources[0])
        file = src.sources[0].file || src.sources[0].src || "";
    }

    const tracks = [];
    if (Array.isArray(src.tracks)) {
      for (let i = 0; i < src.tracks.length; i++) {
        const t = src.tracks[i];
        if (!t || !t.file) continue;
        if (!/\.vtt|\.srt/i.test(t.file)) continue;
        tracks.push({
          url: forceHttps(t.file),
          label: t.label || "Unknown",
        });
      }
    }
    tracks.sort(function (a, b) {
      return rankSubLabel(a.label) - rankSubLabel(b.label);
    });

    const enriched = await enrichTracks(tracks);
    return { stream: forceHttps(file), tracks: enriched };
  } catch (e) {
    return { stream: "", tracks: [] };
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const tokens = await ensureEpisodeTokens(url);
    if (!tokens.ids)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    let pageHtml = "";
    try {
      const w = parseWatch(url);
      const pageUrl = w.ep
        ? w.watchBase + "/ep-" + w.ep
        : w.watchBase + "/ep-1";
      pageHtml = await getText(await soraFetch(pageUrl));
    } catch (e) {}
    const showTitle = extractShowTitle(pageHtml || "");
    const se = guessSeasonEpisode(url, showTitle);

    const list = await getJson(
      baseUrl + "/ajax/server/list?servers=" + encodeURIComponent(tokens.ids),
      url
    );
    if (!list || !list.result)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const serverHtml = String(list.result);
    const servers = [];
    const re = /<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(serverHtml))) {
      const name = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      servers.push({ linkId: m[1], name: name || "Server" });
    }
    if (!servers.length) {
      const re2 = /data-link-id="([^"]+)"[^>]*>\s*([^<]+)/gi;
      while ((m = re2.exec(serverHtml))) {
        servers.push({
          linkId: m[1],
          name: m[2].replace(/\s+/g, " ").trim() || "Server",
        });
      }
    }
    if (!servers.length)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const streams = [];
    let siteTracks = [];
    const limit = Math.min(servers.length, 5);

    for (let i = 0; i < limit; i++) {
      const srv = servers[i];
      const got = await getJson(
        baseUrl + "/ajax/server?get=" + encodeURIComponent(srv.linkId),
        url
      );
      if (!got || !got.result || !got.result.url) continue;
      const embed = forceHttps(got.result.url);
      if (!isHttp(embed)) continue;

      if (/megaplay/i.test(embed)) {
        const resolved = await resolveMegaplay(embed);
        if (resolved.stream && isHttp(resolved.stream)) {
          streams.push({
            title: (srv.name || "Vidstream") + " · HLS",
            name: srv.name || "Vidstream",
            streamUrl: resolved.stream,
            headers: {
              "User-Agent": UA,
              Referer: "https://megaplay.buzz/",
              Origin: "https://megaplay.buzz",
              Accept: "*/*",
            },
          });
          if (resolved.tracks && resolved.tracks.length && !siteTracks.length) {
            siteTracks = resolved.tracks;
          }
          if (streams.length >= 1 && siteTracks.length) break;
        }
      } else if (/\.m3u8/i.test(embed)) {
        streams.push({
          title: srv.name || "Direct",
          name: srv.name || "Direct",
          streamUrl: embed,
          headers: {
            "User-Agent": UA,
            Referer: baseUrl + "/",
            Accept: "*/*",
          },
        });
      }
    }

    let osTracks = [];
    try {
      if (showTitle) {
        const imdb = await resolveImdb(showTitle);
        if (imdb) {
          osTracks = await fetchOpenSubs(imdb, se.season, se.episode);
        }
      }
    } catch (e) {}

    // Luna default = header-free OS English; Sora also gets site data-URIs
    let defaultSub = "";
    for (let i = 0; i < osTracks.length; i++) {
      if (/english/i.test(osTracks[i].label)) {
        defaultSub = osTracks[i].url;
        break;
      }
    }
    if (!defaultSub && osTracks.length) defaultSub = osTracks[0].url;
    if (!defaultSub && siteTracks.length) defaultSub = siteTracks[0].url;

    const allTracks = osTracks.concat(siteTracks);
    const allSubtitles = [];
    const pairList = [];
    for (let i = 0; i < allTracks.length; i++) {
      const t = allTracks[i];
      if (!t.url) continue;
      allSubtitles.push({
        url: t.url,
        label: t.label || "Sub",
        language: t.label || "Sub",
        headers: t.headers || {},
      });
      pairList.push(t.label || "Sub");
      pairList.push(t.url);
    }

    for (let i = 0; i < streams.length; i++) {
      if (defaultSub) {
        streams[i].subtitle = defaultSub;
        streams[i].subtitleHeaders = {};
      }
    }

    const primary = streams.length ? streams[0].streamUrl : "";
    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 8),
      subtitles: defaultSub || "",
      subtitle: defaultSub || "",
      subtitlesList: pairList,
      allSubtitles: allSubtitles,
      softsubs: allSubtitles,
      subtitleHeaders: {},
      subtitlesHeaders: {},
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
