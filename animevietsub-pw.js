/**
 * AnimeVietSub.pw – Sora / Luna
 * Search: /tim-kiem/?s=
 * Info: /info/{slug}
 * Watch: /watch/{slug}-tap-{n}
 * Streams: POST /server/ajax/player → streamc embed → data-obf → m3u8
 * Best quality: prefer src_4k > src_vip > src_hd > src_ngc > ...
 * v1.0.0
 */
const baseUrl = "https://animevietsub.pw";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const SERVER_RANK = {
  src_4k: 0,
  src_vip: 1,
  src_hd: 2,
  src_ngc: 3,
  src_ssp: 4,
  src_vd: 5,
  src_ok: 6,
  src_tik: 7,
};

const SERVER_LABEL = {
  src_4k: "4K",
  src_vip: "VIP",
  src_hd: "HD",
  src_ngc: "Ng.C",
  src_ssp: "SSP",
  src_vd: "VD",
  src_ok: "OK",
  src_tik: "Tik",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
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
function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\((?:Ss?|Season)\s*\d+\)/gi, " ")
    .replace(/\b(?:Ss?|Season)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/watch\/([^/?#]+?)(?:-tap-(\d+))?\/?(?:[?#]|$)/i);
  if (m) {
    return {
      kind: "watch",
      slug: m[1].replace(/-tap-\d+$/i, ""),
      episode: m[2] ? parseInt(m[2], 10) : 1,
    };
  }
  m = s.match(/\/info\/([^/?#]+)/i);
  if (m) return { kind: "info", slug: m[1], episode: 0 };
  return { kind: "", slug: "", episode: 0 };
}

function infoHref(slug) {
  return baseUrl + "/info/" + slug;
}
function watchHref(slug, ep) {
  return baseUrl + "/watch/" + slug + "-tap-" + ep;
}

function serverRank(key) {
  return SERVER_RANK[key] != null ? SERVER_RANK[key] : 50;
}
function serverLabel(key) {
  return SERVER_LABEL[key] || key.replace(/^src_/, "").toUpperCase();
}

function decodeObf(html) {
  const m = String(html || "").match(/data-obf=["']([^"']+)["']/i);
  if (!m) return null;
  try {
    let b64 = m[1];
    if (typeof atob === "function") {
      const raw = atob(b64);
      return JSON.parse(raw);
    }
  } catch (e) {}
  return null;
}

async function resolveEmbedToM3u8(embedUrl) {
  if (!isHttp(embedUrl)) return "";
  const html = await getText(
    await soraFetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: baseUrl + "/",
        Accept: "text/html,*/*",
      },
    })
  );
  const obf = decodeObf(html);
  if (!obf || !obf.sUb) return "";
  const hostM = String(embedUrl).match(/^(https?:\/\/[^/]+)/i);
  const host = hostM ? hostM[1] : "https://embed12.streamc.xyz";
  // Same host as embed (embed12/13/...) – required, cross-host 403s
  const media = forceHttps(host + "/" + obf.sUb);
  return media;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const url =
      baseUrl + "/tim-kiem/?s=" + encodeURIComponent(cleaned);
    const html = await getText(await soraFetch(url));
    if (!html) return JSON.stringify([]);

    const results = [];
    const seen = {};
    // cards: <a class="halim-thumb" href=".../info/slug" title="..."><figure><img ... src="...">
    const re =
      /href="(https?:\/\/[^"]*?\/info\/([^"\/?#]+))"[^>]*title="([^"]*)"[\s\S]{0,600}?<(?:img|IMG)[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = m[1];
      const slug = m[2];
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      results.push({
        title: (m[3] || slug).replace(/&amp;/g, "&").trim(),
        image: absUrl(m[4]),
        href: infoHref(slug),
      });
    }
    // fallback: any /info/ links
    if (!results.length) {
      const re2 =
        /href="(https?:\/\/[^"]*?\/info\/([^"\/?#]+))"[^>]*(?:title="([^"]*)")?/gi;
      while ((m = re2.exec(html))) {
        const slug = m[2];
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        results.push({
          title: (m[3] || slug).replace(/&amp;/g, "&").trim(),
          image: "",
          href: infoHref(slug),
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
    const p = parseHref(url);
    const href = p.kind === "info" ? url : p.slug ? infoHref(p.slug) : url;
    const html = await getText(await soraFetch(href));
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
      html.match(/name="description"\s+content="([^"]+)"/i);
    if (dM) desc = dM[1].replace(/&amp;/g, "&").trim();
    let year = "N/A";
    const yM = html.match(/\b(20\d{2}|19\d{2})\b/);
    if (yM) year = yM[1];
    return JSON.stringify([
      {
        description: desc || "N/A",
        aliases: title || "N/A",
        airdate: year,
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
    const href = infoHref(p.slug);
    const html = await getText(await soraFetch(href));
    if (!html) return JSON.stringify([]);

    const eps = [];
    const seen = {};
    const re =
      /href="(https?:\/\/[^"]*?\/watch\/([^"\/?#]+?)(?:-tap-(\d+))?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const full = m[2];
      let num = m[3] ? parseInt(m[3], 10) : 0;
      if (!num) {
        const tm = full.match(/-tap-(\d+)$/i);
        if (tm) num = parseInt(tm[1], 10);
      }
      if (!num || seen[num]) continue;
      seen[num] = true;
      eps.push({
        href: watchHref(p.slug, num),
        number: num,
        title: "Tập " + num,
      });
    }
    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    // Sora season split: if list resets (1 after high number), keep as continuous
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let watchUrl = url;
    if (p.kind === "info") {
      // default ep 1
      watchUrl = watchHref(p.slug, 1);
    } else if (p.kind === "watch") {
      watchUrl = watchHref(p.slug, p.episode || 1);
    }

    const html = await getText(
      await soraFetch(watchUrl, {
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const midM = html.match(/MovieID\s*:\s*(\d+)/);
    const eidM = html.match(/EpisodeID\s*:\s*(\d+)/);
    if (!midM || !eidM)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const body = "MovieID=" + midM[1] + "&EpisodeID=" + eidM[1];
    const apiRes = await soraFetch(baseUrl + "/server/ajax/player", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: baseUrl,
        Referer: watchUrl,
        Accept: "application/json,*/*",
      },
      body: body,
    });
    const apiText = await getText(apiRes);
    let api = null;
    try {
      api = JSON.parse(apiText);
    } catch (e) {
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });
    }
    if (!api || api.code != 200)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    // Collect all src_* embeds, best quality first
    const embeds = [];
    for (const k in api) {
      if (!Object.prototype.hasOwnProperty.call(api, k)) continue;
      if (k.indexOf("src_") !== 0) continue;
      const v = api[k];
      if (!v || !isHttp(v)) continue;
      embeds.push({ key: k, url: v });
    }
    embeds.sort(function (a, b) {
      return serverRank(a.key) - serverRank(b.key);
    });

    const streams = [];
    const seen = {};
    for (let i = 0; i < embeds.length; i++) {
      const emb = embeds[i];
      const media = await resolveEmbedToM3u8(emb.url);
      if (!media || !isHttp(media) || seen[media]) continue;
      seen[media] = true;
      const hostM = emb.url.match(/^(https?:\/\/[^/]+)/i);
      const origin = hostM ? hostM[1] : "https://embed12.streamc.xyz";
      const title = serverLabel(emb.key);
      streams.push({
        title: title,
        name: title,
        streamUrl: media,
        headers: {
          "User-Agent": UA,
          Referer: emb.url,
          Origin: origin,
          Accept: "*/*",
        },
      });
    }

    // Best quality first (already sorted by SERVER_RANK)
    const primary = streams.length ? streams[0].streamUrl : "";
    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 10),
      subtitles: "",
      subtitle: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
