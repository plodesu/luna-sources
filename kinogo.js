/**
 * Kinogo.online – Sora / Luna (movies + series)
 * v1.0.0
 */
const baseUrl = "https://kinogo.online";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
  const method = options.method || "GET";
  const body = options.body || null;
  try {
    if (typeof fetchv2 === "function") {
      const r = await fetchv2(url, headers, method, body);
      if (r) return r;
    }
  } catch (e) {}
  try {
    return await fetch(url, { method, headers, body });
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

function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  if (u.indexOf("http") !== 0) return baseUrl + "/" + u;
  return u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/[Ss]\d+[Ee]\d+/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/Episode\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function isEnglishish(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.indexOf("eng") !== -1 ||
    n.indexOf("original") !== -1 ||
    n.indexOf("оригинал") !== -1 ||
    n.indexOf("укр") !== -1
  );
}

/* ---- search ---- */

function parseSearchHtml(html) {
  const results = [];
  const seen = {};
  if (!html) return results;

  // DLE shortstory / article blocks
  const blocks = html.split(
    /(?=<div[^>]+class="[^"]*(?:shortstory|short-item|item|th-item)[^"]*")/i
  );

  function push(title, href, image) {
    if (!title || !href) return;
    href = absUrl(href);
    if (!/\/(filmy|serialy|novinki|multfilmy|multserialy)\//i.test(href))
      return;
    if (seen[href]) return;
    seen[href] = true;
    results.push({
      title: title.replace(/\s+/g, " ").trim(),
      image: image ? absUrl(image) : "",
      href: href,
    });
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.length < 80) continue;
    const hm =
      b.match(
        /<a[^>]+href=["']([^"']+?(?:filmy|serialy|novinki|multfilmy|multserialy)\/[^"']+\.html)["'][^>]*>\s*<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/i
      ) ||
      b.match(
        /<a[^>]+href=["']([^"']+?(?:filmy|serialy|novinki|multfilmy|multserialy)\/[^"']+\.html)["'][^>]*title=["']([^"']+)["']/i
      );
    if (!hm) continue;
    let href = hm[1];
    let image = "";
    let title = "";
    if (hm[2] && /\.(jpg|jpeg|png|webp|gif)/i.test(hm[2])) {
      image = hm[2];
      const tm =
        b.match(/title=["']([^"']{2,120})["']/i) ||
        b.match(/<h[23][^>]*>\s*<a[^>]*>([^<]+)</i) ||
        b.match(/alt=["']([^"']+)["']/i);
      title = tm ? tm[1] : "";
    } else {
      title = hm[2] || "";
      const im = b.match(
        /(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
      );
      if (im) image = im[1];
    }
    if (!title) {
      const tm = b.match(/<h[23][^>]*>[\s\S]*?<a[^>]*>([^<]+)</i);
      if (tm) title = tm[1];
    }
    push(title, href, image);
  }

  // fallback: any film/serial links with nearby img
  if (results.length < 3) {
    const re =
      /href=["']([^"']+\/(?:filmy|serialy|novinki|multfilmy|multserialy)\/\d+-[^"']+\.html)["'][^>]*>([^<]{2,100})</gi;
    let m;
    while ((m = re.exec(html))) {
      push(m[2], m[1], "");
    }
  }

  return results;
}

async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);

    let results = [];

    // GET search
    try {
      const url =
        baseUrl +
        "/index.php?do=search&subaction=search&story=" +
        encodeURIComponent(q);
      const html = await getText(
        await soraFetch(url, { headers: { Referer: baseUrl + "/" } })
      );
      results = parseSearchHtml(html);
    } catch (e) {}

    // POST search fallback
    if (results.length < 2) {
      try {
        const body =
          "do=search&subaction=search&story=" + encodeURIComponent(q);
        const html = await getText(
          await soraFetch(baseUrl + "/index.php?do=search", {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              Referer: baseUrl + "/",
              "X-Requested-With": "XMLHttpRequest",
            },
            body: body,
          })
        );
        const more = parseSearchHtml(html);
        const seen = {};
        results.forEach((r) => (seen[r.href] = true));
        more.forEach((r) => {
          if (!seen[r.href]) results.push(r);
        });
      } catch (e) {}
    }

    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
      html.match(/name="description"\s+content="([^"]+)"/i) ||
      html.match(
        /class="[^"]*(?:full-text|ftext|story|description)[^"]*"[^>]*>([\s\S]{30,500}?)<\//i
      );
    if (dm) {
      description = String(dm[1])
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
    }
    return JSON.stringify([
      { description: description || "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const isSeries = /\/(serialy|multserialy)\//i.test(pageUrl);
    if (!isSeries) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    // episode buttons / links with e=
    const re =
      /(?:href|data-href|data-id)=["']([^"']*(?:[?&]e=|episode[=_]|seriya)[^"']*)["'][^>]*>([^<]{0,40})/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const se = parseSE(href);
      let en = se.episode || parseInt((m[2].match(/\d+/) || [])[0], 10) || 0;
      let sn = se.season || 1;
      if (!en) continue;
      const key = sn + "-" + en;
      if (seen[key]) continue;
      seen[key] = true;
      eps.push({
        href: pageUrl + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }

    // numbered episode anchors: 1 2 3 ...
    if (eps.length < 2) {
      const nums = html.match(/(?:серия|episode)[^0-9]{0,20}(\d{1,4})/gi) || [];
      let max = 0;
      for (let i = 0; i < nums.length; i++) {
        const n = parseInt((nums[i].match(/\d+/) || [])[0], 10);
        if (n > max && n < 500) max = n;
      }
      if (max > 0) {
        for (let e = 1; e <= Math.min(max, 80); e++) {
          eps.push({
            href: pageUrl + "?s=1&e=" + e,
            number: e,
            season: 1,
            title: "S1E" + e,
          });
        }
      }
    }

    if (!eps.length) {
      return JSON.stringify([
        {
          href: pageUrl + "?s=1&e=1",
          number: 1,
          season: 1,
          title: "S1E1",
        },
      ]);
    }

    eps.sort((a, b) => a.season - b.season || a.number - b.number);
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      { href: String(url).split("?")[0], number: 1, season: 1, title: "S1E1" },
    ]);
  }
}

/* ---- stream helpers ---- */

function extractIframes(html) {
  const urls = [];
  const re =
    /<(?:iframe|source)[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = absUrl(m[1]);
    if (isHttp(u) && !/yandex|google|metrika|counter/i.test(u)) urls.push(u);
  }
  // data-src on divs used as players
  const re2 =
    /(?:data-src|data-player|data-iframe|data-url)=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = re2.exec(html))) {
    const u = m[1];
    if (!/yandex|google|metrika/i.test(u)) urls.push(u);
  }
  return urls;
}

function extractFileField(html) {
  const files = [];
  // "file":"url" or file:"url"
  const re = /["']file["']\s*:\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (isHttp(u)) files.push(u);
  }
  // m3u8 direct in page
  const re2 = /(https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*)/gi;
  while ((m = re2.exec(html))) files.push(m[1]);
  return files;
}

function extractPlaylistJson(html) {
  const m =
    html.match(/["']pl["']\s*:\s*["']([^"']+)["']/i) ||
    html.match(/["']playlist["']\s*:\s*["']([^"']+)["']/i);
  if (!m) return null;
  let s = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
  try {
    // sometimes pl is a URL to JSON
    if (isHttp(s)) return { url: s };
    s = s.replace(/'/g, '"');
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function flattenPl(node, out, season, episode) {
  out = out || [];
  if (!node) return out;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) flattenPl(node[i], out, season, episode);
    return out;
  }
  if (typeof node === "object") {
    if (node.file) {
      out.push({
        file: node.file,
        title: node.comment || node.title || "",
        season: node.season,
        episode: node.episode || node.serieId,
      });
    }
    if (node.playlist) flattenPl(node.playlist, out, season, episode);
  }
  return out;
}

async function resolveIframeStreams(iframeUrl, season, episode) {
  const streams = [];
  try {
    const html = await getText(
      await soraFetch(iframeUrl, {
        headers: { Referer: baseUrl + "/" },
      })
    );
    if (!html) return streams;

    // file field inside embed
    const files = extractFileField(html);
    for (let i = 0; i < files.length; i++) {
      streams.push({
        title: "Player · " + (i + 1),
        streamUrl: files[i],
        headers: {
          "User-Agent": defaultHeaders["User-Agent"],
          Referer: iframeUrl,
        },
      });
    }

    // hls in embed page
    const hls = html.match(/(https?:\/\/[^"'\s]+?\.m3u8[^"'\s]*)/i);
    if (hls) {
      streams.push({
        title: "HLS",
        streamUrl: hls[1],
        headers: {
          "User-Agent": defaultHeaders["User-Agent"],
          Referer: iframeUrl,
        },
      });
    }

    // nested playlist
    const pl = extractPlaylistJson(html);
    if (pl && pl.url) {
      try {
        const plTxt = await getText(
          await soraFetch(pl.url, { headers: { Referer: iframeUrl } })
        );
        let data = null;
        try {
          data = JSON.parse(plTxt);
        } catch (e) {}
        if (data) {
          const items = flattenPl(data);
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (season && episode && it.season && it.episode) {
              if (+it.season !== season || +it.episode !== episode) continue;
            }
            let file = String(it.file || "");
            if (file.indexOf("//") === 0) file = "https:" + file;
            if (!isHttp(file)) continue;
            streams.push({
              title: it.title || "S" + (season || 1) + "E" + (episode || 1),
              streamUrl: file,
              headers: {
                "User-Agent": defaultHeaders["User-Agent"],
                Referer: iframeUrl,
              },
            });
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return streams;
}

async function extractStreamUrl(url) {
  try {
    const se = parseSE(url);
    const pageUrl = String(url).split("?")[0];
    const season = se.season || 1;
    const episode = se.episode || 1;

    const html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];

    // 1) direct file / m3u8 on page
    const files = extractFileField(html);
    for (let i = 0; i < files.length; i++) {
      streams.push({
        title: "Direct · " + (i + 1),
        streamUrl: files[i],
        headers: {
          "User-Agent": defaultHeaders["User-Agent"],
          Referer: pageUrl,
        },
      });
    }

    // 2) playlist JSON on page
    const pl = extractPlaylistJson(html);
    if (pl && !pl.url) {
      const items = flattenPl(pl);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let file = String(it.file || "");
        if (file.indexOf("//") === 0) file = "https:" + file;
        if (!isHttp(file)) continue;
        streams.push({
          title: it.title || "Stream " + (i + 1),
          streamUrl: file,
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: pageUrl,
          },
        });
      }
    }

    // 3) iframes → resolve
    const iframes = extractIframes(html);
    for (let i = 0; i < Math.min(iframes.length, 4); i++) {
      const sub = await resolveIframeStreams(iframes[i], season, episode);
      for (let j = 0; j < sub.length; j++) {
        sub[j].title = "Плеер " + (i + 1) + " · " + (sub[j].title || "Stream");
        streams.push(sub[j]);
      }
      // also expose iframe as last resort (some apps can play embed)
      if (!sub.length && isHttp(iframes[i])) {
        streams.push({
          title: "Плеер " + (i + 1) + " (embed)",
          streamUrl: iframes[i],
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: pageUrl,
          },
        });
      }
    }

    // dedupe
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!streams[i].streamUrl || !isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 140);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
