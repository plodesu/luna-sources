/**
 * Anikoto (anikototv.to) – Sora / Luna
 * Search: /filter?keyword=
 * Episodes: /ajax/episode/list/{showId}
 * Servers: /ajax/server/list?servers={data-ids}
 * Source: /ajax/server?get={link-id} → megaplay → /stream/getSources?id=
 * Softsub: multi-lang VTT + headers (EN first)
 * v1.0.1
 */
const baseUrl = "https://anikototv.to";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
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
  if (l.indexOf("spanish") >= 0) return 1;
  if (l.indexOf("portuguese") >= 0) return 2;
  if (l.indexOf("french") >= 0) return 3;
  if (l.indexOf("german") >= 0) return 4;
  return 10;
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
    html.match(/data-id="(\d+)"[^>]*data-url=/i) ||
    html.match(/#watch-main[\s\S]{0,200}?data-id="(\d+)"/i);
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
          label: t.label || t.lang || "Unknown",
          language: t.label || "Unknown",
          headers: subHeaders(),
        });
      }
    }
    tracks.sort(function (a, b) {
      return rankSubLabel(a.label) - rankSubLabel(b.label);
    });

    return { stream: forceHttps(file), tracks: tracks };
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
    let allTracks = [];
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
          const mediaHeaders = {
            "User-Agent": UA,
            Referer: "https://megaplay.buzz/",
            Origin: "https://megaplay.buzz",
            Accept: "*/*",
          };
          const defaultSub =
            resolved.tracks && resolved.tracks.length
              ? resolved.tracks[0].url
              : "";
          streams.push({
            title: (srv.name || "Vidstream") + " · HLS",
            name: srv.name || "Vidstream",
            streamUrl: resolved.stream,
            headers: mediaHeaders,
            subtitle: defaultSub,
            subtitleHeaders: defaultSub ? subHeaders() : undefined,
          });
          if (resolved.tracks && resolved.tracks.length && !allTracks.length) {
            allTracks = resolved.tracks;
          }
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

    let subtitleUrl = "";
    const allSubtitles = [];
    for (let i = 0; i < allTracks.length; i++) {
      const t = allTracks[i];
      if (!t.url) continue;
      if (!subtitleUrl) subtitleUrl = t.url;
      allSubtitles.push({
        url: t.url,
        label: t.label || "Sub",
        language: t.label || "Sub",
        headers: t.headers || subHeaders(),
      });
    }

    const primary = streams.length ? streams[0].streamUrl : "";
    return JSON.stringify({
      stream: primary,
      streams: streams.slice(0, 8),
      subtitles: subtitleUrl || "",
      subtitle: subtitleUrl || "",
      allSubtitles: allSubtitles,
      softsubs: allSubtitles,
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
