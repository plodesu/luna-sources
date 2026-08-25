/**
 * TürkAnime TV – Sora / Luna
 * Turkish sub/dub anime (turkanime.tv)
 * Search: POST/GET /arama
 * Stream: ajax/videosec
 * v1.1.0
 */
const baseUrl = "https://www.turkanime.tv";
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

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]);
      if (!href || seen[href]) return;
      // Prefer /anime/ links for series pages
      if (!/\/anime\//i.test(href) && !/\/video\//i.test(href)) return;
      seen[href] = true;

      let img = absUrl(image || "");
      if (img.indexOf("data:image") === 0) img = "";

      results.push({
        title: decodeEntities(title || "Anime").replace(/\s+/g, " ").trim(),
        image: img,
        href: href,
      });
    }

    let html = "";

    // GET first
    try {
      html = await getText(
        await soraFetch(baseUrl + "/arama?arama=" + encodeURIComponent(cleaned), {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,*/*",
            Referer: baseUrl + "/",
          },
        })
      );
    } catch (e) {}

    // POST fallback
    if (!html || html.length < 1500 || /Just a moment|404|Bulunamadı/i.test(html)) {
      try {
        html = await getText(
          await soraFetch(baseUrl + "/arama", {
            method: "POST",
            headers: {
              "User-Agent": UA,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "text/html,*/*",
              Referer: baseUrl + "/",
              Origin: baseUrl,
            },
            body: "arama=" + encodeURIComponent(cleaned),
          })
        );
      } catch (e2) {}
    }

    if (!html || html.length < 1000) return JSON.stringify([]);

    // Best pattern: data-title + data-img + href/data-url
    let re =
      /data-title="([^"]+)"[\s\S]{0,400}?data-img="([^"]+)"[\s\S]{0,400}?(?:data-url|href)="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      push(m[3], m[1], m[2]);
    }

    // Reverse order sometimes
    re =
      /(?:data-url|href)="([^"]*\/(?:anime|video)\/[^"]+)"[\s\S]{0,400}?data-title="([^"]+)"[\s\S]{0,200}?data-img="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      push(m[1], m[2], m[3]);
    }

    // data-src lazy images
    re =
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/anime\/[^"]+)"[\s\S]{0,300}?(?:data-src|src)="([^"]*imajlar[^"]+)"[\s\S]{0,200}?(?:title|alt|data-title)="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      push(m[1], m[3], m[2]);
    }

    // Simple /anime/ links
    re = /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/anime\/[^"]+)"/gi;
    while ((m = re.exec(html))) {
      const slug = m[1].split("/").pop().replace(/\/$/, "");
      push(m[1], slug.replace(/-/g, " "), "");
    }

    re = /href="(\/anime\/[^"]+)"/gi;
    while ((m = re.exec(html))) {
      const slug = m[1].split("/").pop().replace(/\/$/, "");
      push(m[1], slug.replace(/-/g, " "), "");
    }

    // Score
    const q = cleaned.toLowerCase();
    const scored = results.map(function (r) {
      const t = r.title.toLowerCase();
      let score = 0;
      if (t.indexOf(q) >= 0) score += 15;
      q.split(/\s+/).forEach(function (w) {
        if (w.length > 2 && t.indexOf(w) >= 0) score += 4;
      });
      if (r.image) score += 2;
      return { r: r, score: score };
    });
    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    const final = scored
      .filter(function (x) {
        return x.score > 0;
      })
      .map(function (x) {
        return x.r;
      });

    return JSON.stringify((final.length ? final : results).slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== details ===================== */

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(absUrl(url)));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/data-ozet="([^"]+)"/i);
    if (dm) {
      description = decodeEntities(dm[1].replace(/<[^>]+>/g, " "))
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

/* ===================== episodes ===================== */

async function extractEpisodes(url) {
  try {
    const pageUrl = absUrl(url);
    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    // Prefer /video/ links
    const patterns = [
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/video\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(\/video\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/video\/[^"]+)"/gi,
      /href="(\/video\/[^"]+)"/gi,
      /data-url="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/video\/[^"]+)"/gi,
    ];

    for (let p = 0; p < patterns.length; p++) {
      const re = patterns[p];
      let m;
      while ((m = re.exec(html))) {
        let href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;

        let title = decodeEntities((m[2] || "").replace(/<[^>]+>/g, " ")).trim();
        let num = 0;
        const nm =
          title.match(/(\d+)\s*\.?\s*[Bb]ölüm/i) ||
          title.match(/[Bb]ölüm\s*(\d+)/i) ||
          href.match(/(?:bolum|episode|ep)[_-]?(\d+)/i) ||
          href.match(/-(\d+)(?:-bolum)?(?:\.html)?$/i);
        if (nm) num = parseInt(nm[1], 10);
        if (!num) num = eps.length + 1;
        if (!title || title.length < 2) title = "Bölüm " + num;

        eps.push({ href: href, number: num, title: title });
      }
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    if (!eps.length) {
      eps.push({ href: pageUrl, number: 1, title: "Bölüm 1" });
    }

    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "Bölüm 1" },
    ]);
  }
}

/* ===================== stream ===================== */

async function extractStreamUrl(url) {
  try {
    const pageUrl = absUrl(url);
    const html = await getText(
      await soraFetch(pageUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );

    if (!html || /Just a moment/i.test(html)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const streams = [];
    const seen = {};

    function add(u, label) {
      u = forceHttps(
        String(u || "")
          .replace(/\\u0026/g, "&")
          .replace(/\\\//g, "/")
          .replace(/&amp;/g, "&")
      );
      if (!isHttp(u) || seen[u]) return;
      // Filter noise
      if (/a-ads\.com|google-analytics|facebook|twitter|cdnjs/i.test(u)) return;
      seen[u] = true;
      streams.push({
        title: "TürkAnime · " + (label || "Stream"),
        name: "TürkAnime · " + (label || "Stream"),
        streamUrl: u,
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
        },
      });
    }

    // 1) Collect all ajax/videosec endpoints from the page
    const ajaxList = [];
    const reAjax =
      /ajax\/videosec&b=([A-Za-z0-9+/=]+)(?:&|&amp;)f=([A-Za-z0-9+/=]+)/gi;
    let m;
    while ((m = reAjax.exec(html))) {
      ajaxList.push({
        url:
          baseUrl +
          "/ajax/videosec&b=" +
          encodeURIComponent(m[1]) +
          "&f=" +
          encodeURIComponent(m[2]),
      });
    }

    // Also catch already-encoded variants
    const reAjax2 =
      /IndexIcerik\(['"]ajax\/videosec&b=([^&'"]+)&f=([^&'"]+)['"]/gi;
    while ((m = reAjax2.exec(html))) {
      ajaxList.push({
        url:
          baseUrl +
          "/ajax/videosec&b=" +
          m[1] +
          "&f=" +
          m[2],
      });
    }

    // 2) Fetch each player endpoint (limit to first 6)
    for (let i = 0; i < Math.min(ajaxList.length, 6); i++) {
      try {
        const playerHtml = await getText(
          await soraFetch(ajaxList[i].url, {
            headers: {
              "User-Agent": UA,
              Referer: pageUrl,
              "X-Requested-With": "XMLHttpRequest",
              Accept: "*/*",
            },
          })
        );
        if (!playerHtml) continue;

        // iframe
        const reIframe = /<iframe[^>]+src=["']([^"']+)["']/gi;
        while ((m = reIframe.exec(playerHtml))) add(absUrl(m[1]), "Embed");

        // direct media
        const reM3u = /https?:\/\/[^"'\\\s<>]+?\.m3u8[^"'\\\s<>]*/gi;
        while ((m = reM3u.exec(playerHtml))) add(m[0], "HLS");

        const reMp4 = /https?:\/\/[^"'\\\s<>]+?\.mp4[^"'\\\s<>]*/gi;
        while ((m = reMp4.exec(playerHtml))) add(m[0], "MP4");

        // file: "..."
        const reFile = /["']file["']\s*:\s*["']([^"']+)["']/gi;
        while ((m = reFile.exec(playerHtml))) add(m[1], "File");

        // source / src
        const reSrc =
          /["'](?:src|source|url|videoSource|securedLink)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
        while ((m = reSrc.exec(playerHtml))) add(m[1], "Source");

        // common hosts
        const reHost =
          /https?:\/\/[^"'\\\s<>]*(?:sibnet|drive\.google|ok\.ru|vidmoly|dood|pixeldrain|sendvid|uqload|vudea|alucard|bankai|amaterasu)[^"'\\\s<>]*/gi;
        while ((m = reHost.exec(playerHtml))) add(m[0], "Host");
      } catch (e) {}
    }

    // 3) Fallback: anything already on the main page
    const reIframe2 = /<iframe[^>]+src=["']([^"']+)["']/gi;
    while ((m = reIframe2.exec(html))) add(absUrl(m[1]), "PageEmbed");

    const reM3u2 = /https?:\/\/[^"'\\\s<>]+?\.m3u8[^"'\\\s<>]*/gi;
    while ((m = reM3u2.exec(html))) add(m[0], "HLS");

    const reMp42 = /https?:\/\/[^"'\\\s<>]+?\.mp4[^"'\\\s<>]*/gi;
    while ((m = reMp42.exec(html))) add(m[0], "MP4");

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
