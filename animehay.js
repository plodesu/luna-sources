/**
 * AnimeHay (animehay11.site) – Sora / Luna
 * Search:  POST /api { action: live_search, keyword }
 * Series:  /thong-tin-phim/{slug}-{id}.html
 * Watch:   /xem-phim/{slug}-tap-{n}-{epid}.html
 * Servers: $wp_servers  AHS (vipah06) · HY (abyss)
 * v1.0.0
 */
const baseUrl = "https://animehay11.site";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json,text/html,*/*",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      Referer: baseUrl + "/",
      Origin: baseUrl,
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

function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/xem-phim\/([^/?#]+)-tap-(\d+)-(\d+)\.html/i);
  if (m)
    return {
      type: "watch",
      slug: m[1],
      episode: parseInt(m[2], 10),
      episodeId: m[3],
      movieId: "",
    };
  m = s.match(/\/thong-tin-phim\/([^/?#]+)-(\d+)\.html/i);
  if (m)
    return {
      type: "series",
      slug: m[1],
      episode: 0,
      episodeId: "",
      movieId: m[2],
    };
  return { type: "unknown", slug: "", episode: 0, episodeId: "", movieId: "" };
}

function parseWpServers(html) {
  const out = [];
  const m = String(html || "").match(/\$wp_servers\s*=\s*\{([\s\S]*?)\};/);
  if (!m) return out;
  const re = /['"]([A-Za-z0-9_]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
  let mm;
  while ((mm = re.exec(m[1]))) {
    out.push({ name: mm[1], url: mm[2] });
  }
  return out;
}

/** Resolve vipah06 embed-jw/{id} → master.m3u8 */
async function resolveAhs(embedUrl) {
  const streams = [];
  const idMatch = String(embedUrl).match(/embed-jw\/(\d+)/i);
  const id = idMatch ? idMatch[1] : "";
  // 1) Fetch embed page for exact CDN host
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
      })
    );
    const found = html.match(/https?:\/\/s\d+\.vipah06\.xyz\/hls\/\d+\/master\.m3u8/gi) || [];
    for (let i = 0; i < found.length; i++) {
      streams.push(forceHttps(found[i]));
    }
  } catch (e) {}
  // 2) Fallback guess common hosts if page parse empty
  if (!streams.length && id) {
    const hosts = ["s5", "s4", "s3", "s2", "s1", "s6", "s7"];
    for (let i = 0; i < hosts.length; i++) {
      streams.push(
        "https://" + hosts[i] + ".vipah06.xyz/hls/" + id + "/master.m3u8"
      );
    }
  }
  return streams;
}

async function resolveEmbedGeneric(embedUrl) {
  const streams = [];
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
      })
    );
    const m3u8s =
      html.match(/https?:\/\/[^"'\\\s<>]+m3u8[^"'\\\s<>]*/gi) || [];
    for (let i = 0; i < m3u8s.length; i++) {
      const u = forceHttps(m3u8s[i].replace(/\\/g, ""));
      if (isHttp(u)) streams.push(u);
    }
    const files =
      html.match(/["']file["']\s*:\s*["']([^"']+\.m3u8[^"']*)/gi) || [];
    for (let i = 0; i < files.length; i++) {
      const mm = files[i].match(/["'](https?:[^"']+)["']/);
      if (mm) streams.push(forceHttps(mm[1]));
    }
  } catch (e) {}
  return streams;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const body = JSON.stringify({
      action: "live_search",
      keyword: cleaned,
    });
    const data = await getJson(
      await soraFetch(baseUrl + "/api", {
        method: "POST",
        body: body,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      })
    );
    const items = (data && data.items) || [];
    const results = [];
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.url) continue;
      const href = absUrl(it.url);
      if (seen[href]) continue;
      seen[href] = true;
      results.push({
        title: decodeEntities(it.name || "").trim() || "Anime",
        image: absUrl(String(it.poster || "").replace(/\/\//g, "/").replace(":/", "://")),
        href: href,
      });
    }
    // HTML fallback if API empty
    if (!results.length) {
      const html = await getText(
        await soraFetch(
          baseUrl + "/tim-kiem/?keyword=" + encodeURIComponent(cleaned)
        )
      );
      const re =
        /href="(https?:\/\/[^"]*thong-tin-phim\/[^"]+\.html)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]+src="([^"]+)"/gi;
      let m;
      while ((m = re.exec(html))) {
        const href = m[1];
        if (seen[href]) continue;
        seen[href] = true;
        results.push({
          title: decodeEntities(m[2] || "").trim(),
          image: absUrl(m[3]),
          href: href,
        });
      }
    }
    return JSON.stringify(results.slice(0, 30));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(url));
    let description = "N/A";
    const og = html.match(
      /property="og:description"\s+content="([^"]+)"/i
    );
    if (og) description = decodeEntities(og[1]).slice(0, 900);
    else {
      const d = html.match(
        /class="[^"]*aim-desc[^"]*"[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i
      );
      if (d)
        description = decodeEntities(d[1].replace(/<[^>]+>/g, " "))
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 900);
    }
    let aliases = "N/A";
    const t = html.match(/property="og:title"\s+content="([^"]+)"/i);
    if (t) aliases = decodeEntities(t[1]).replace(/\s*\|\|.*$/, "").trim();
    let airdate = "N/A";
    const y = html.match(/(20\d{2}|19\d{2})/);
    if (y) airdate = y[1];
    return JSON.stringify([
      { description: description || "N/A", aliases: aliases, airdate: airdate },
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
    let seriesUrl = url;
    const p = parseHref(url);
    if (p.type === "watch") {
      // Try to find series link on page, else build from slug
      const html0 = await getText(await soraFetch(url));
      const ser = html0.match(
        /href="(https?:\/\/[^"]*thong-tin-phim\/[^"]+\.html)"/i
      );
      if (ser) seriesUrl = ser[1];
      else if (p.slug)
        seriesUrl = baseUrl + "/thong-tin-phim/" + p.slug + ".html";
    }
    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};
    const re =
      /href="(https?:\/\/[^"]*\/xem-phim\/[^"]*-tap-(\d+)-\d+\.html)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const num = parseInt(m[2], 10);
      if (seen[num]) continue;
      seen[num] = true;
      eps.push({
        href: m[1],
        number: num,
        title: "Tập " + num,
      });
    }
    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const html = await getText(await soraFetch(url));
    const servers = parseWpServers(html);
    const streams = [];
    const seen = {};
    const headersBase = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: baseUrl + "/",
    };

    // Prefer AHS first
    servers.sort(function (a, b) {
      const ar = a.name === "AHS" ? 0 : 1;
      const br = b.name === "AHS" ? 0 : 1;
      return ar - br;
    });

    for (let i = 0; i < servers.length; i++) {
      const srv = servers[i];
      const name = srv.name || "Server";
      const embed = srv.url;
      if (!isHttp(embed)) continue;

      let urls = [];
      if (/vipah06\.xyz|embed-jw/i.test(embed) || name === "AHS") {
        urls = await resolveAhs(embed);
        headersBase.Referer = "https://main.vipah06.xyz/";
        headersBase.Origin = "https://main.vipah06.xyz";
      } else {
        urls = await resolveEmbedGeneric(embed);
        headersBase.Referer = embed.replace(/^(https?:\/\/[^/]+).*/, "$1/") || baseUrl + "/";
      }

      for (let j = 0; j < urls.length; j++) {
        const media = forceHttps(urls[j]);
        if (!isHttp(media) || seen[media]) continue;
        if (media.indexOf("m3u8") < 0 && !/\.mp4(\?|$)/i.test(media)) continue;
        seen[media] = true;
        streams.push({
          title: name + (urls.length > 1 ? " · " + (j + 1) : ""),
          streamUrl: media,
          headers: {
            "User-Agent": UA,
            Accept: "*/*",
            Referer: headersBase.Referer,
            Origin: headersBase.Origin || baseUrl,
          },
        });
      }
    }

    return JSON.stringify({
      streams: streams.slice(0, 10),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
