/**
 * Animeniz – Sora / Luna
 * Turkish sub anime (animeniz.com)
 * Next.js SPA – limited HTML scraping
 * v1.0.0
 */
const baseUrl = "https://animeniz.com";
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

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[ğ]/g, "g")
    .replace(/[ü]/g, "u")
    .replace(/[ş]/g, "s")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
      if (!/\/anime-(diziler|filmler)\//i.test(href)) return;
      seen[href] = true;
      let img = absUrl(image || "");
      if (img.indexOf("data:image") === 0) img = "";
      results.push({
        title: decodeEntities(title || "Anime").replace(/\s+/g, " ").trim(),
        image: img,
        href: href,
      });
    }

    // Try list pages + possible search variants
    const searchUrls = [
      baseUrl + "/anime-diziler",
      baseUrl + "/anime-filmler",
      baseUrl + "/?q=" + encodeURIComponent(cleaned),
      baseUrl + "/search?q=" + encodeURIComponent(cleaned),
      baseUrl + "/anime-diziler?search=" + encodeURIComponent(cleaned),
    ];

    let html = "";
    for (let i = 0; i < searchUrls.length; i++) {
      html = await getText(
        await soraFetch(searchUrls[i], {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,*/*",
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
            Referer: baseUrl + "/",
          },
        })
      );
      if (html && html.length > 3000 && !/Just a moment|BAILOUT_TO_CLIENT/i.test(html)) {
        // Extract known anime links from HTML / RSC payload
        let re = /href="(\/anime-diziler\/[a-z0-9\-]+)"/gi;
        let m;
        while ((m = re.exec(html))) {
          const slug = m[1].split("/").pop();
          const title = slug.replace(/-/g, " ");
          push(m[1], title, "");
        }
        re = /href="(\/anime-filmler\/[a-z0-9\-]+)"/gi;
        while ((m = re.exec(html))) {
          const slug = m[1].split("/").pop();
          const title = slug.replace(/-/g, " ");
          push(m[1], title, "");
        }
        // Also catch full URLs
        re = /href="(https?:\/\/(?:www\.)?animeniz\.com\/anime-(?:diziler|filmler)\/[a-z0-9\-]+)"/gi;
        while ((m = re.exec(html))) {
          const slug = m[1].split("/").pop();
          push(m[1], slug.replace(/-/g, " "), "");
        }
      }
    }

    // Simple relevance filter
    const q = cleaned.toLowerCase();
    const scored = results.map(function (r) {
      const t = r.title.toLowerCase();
      let score = 0;
      if (t.indexOf(q) >= 0) score += 10;
      q.split(/\s+/).forEach(function (w) {
        if (w.length > 1 && t.indexOf(w) >= 0) score += 3;
      });
      return { r: r, score: score };
    });
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    const ranked = scored
      .filter(function (x) {
        return x.score > 0;
      })
      .map(function (x) {
        return x.r;
      });

    return JSON.stringify((ranked.length ? ranked : results).slice(0, 25));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(url));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);

    let title = "";
    const tm =
      html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    if (tm) title = decodeEntities(tm[1]).replace(/\s*\|\s*Animeniz.*$/i, "").trim();

    return JSON.stringify([
      {
        description: description || "N/A",
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

async function extractEpisodes(url) {
  try {
    const html = await getText(await soraFetch(url));
    const eps = [];
    const seen = {};

    // Common episode patterns for Turkish sites + Next.js links
    const patterns = [
      /href="(\/anime-diziler\/[^"]+?(?:bolum|episode|ep)[^"]*)"/gi,
      /href="(\/anime-diziler\/[^"]+?\/\d+)"/gi,
      /href="(https?:\/\/(?:www\.)?animeniz\.com\/anime-diziler\/[^"]+?(?:bolum|episode)[^"]*)"/gi,
      /"slug"\s*:\s*"([^"]+)"[^}]*?"episode"\s*:\s*(\d+)/gi,
      /episode[_-]?number["']?\s*[:=]\s*["']?(\d+)/gi,
    ];

    for (let p = 0; p < patterns.length; p++) {
      const re = patterns[p];
      let m;
      while ((m = re.exec(html))) {
        let href = m[1];
        let num = parseInt(m[2] || "0", 10);

        if (!href) continue;
        href = absUrl(href);
        if (seen[href]) continue;

        if (!num) {
          const nm = href.match(/(?:bolum|episode|ep)[_-]?(\d+)/i) || href.match(/\/(\d+)\/?$/);
          if (nm) num = parseInt(nm[1], 10);
        }
        if (!num) num = eps.length + 1;

        seen[href] = true;
        eps.push({
          href: href,
          number: num,
          title: "Bölüm " + num,
        });
      }
    }

    // If still empty, try generating sequential episode links from slug
    if (!eps.length) {
      const slugMatch = String(url).match(/\/anime-diziler\/([a-z0-9\-]+)/i);
      if (slugMatch) {
        const slug = slugMatch[1];
        // Placeholder – real episode count unknown without API
        for (let i = 1; i <= 12; i++) {
          eps.push({
            href: baseUrl + "/anime-diziler/" + slug + "/bolum-" + i,
            number: i,
            title: "Bölüm " + i,
          });
        }
      }
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    if (!eps.length) {
      eps.push({ href: String(url), number: 1, title: "Bölüm 1" });
    }

    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "Bölüm 1" },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const html = await getText(
      await soraFetch(url, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );

    if (!html || /Just a moment/i.test(html)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const streams = [];
    const seen = {};

    function add(u, label) {
      u = forceHttps(String(u || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
      if (!isHttp(u) || seen[u]) return;
      if (/\.m3u8|\.mp4|googlevideo|sibnet|drive|ok\.ru|vidmoly|dood/i.test(u) === false && !/player/i.test(u)) return;
      seen[u] = true;
      streams.push({
        title: "Animeniz · " + (label || "Stream"),
        name: "Animeniz · " + (label || "Stream"),
        streamUrl: u,
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
        },
      });
    }

    // Direct m3u8 / mp4
    let m;
    const reM3u = /https?:\/\/[^"'\\\s<>]+?\.m3u8[^"'\\\s<>]*/gi;
    while ((m = reM3u.exec(html))) add(m[0], "HLS");

    const reMp4 = /https?:\/\/[^"'\\\s<>]+?\.mp4[^"'\\\s<>]*/gi;
    while ((m = reMp4.exec(html))) add(m[0], "MP4");

    // iframe sources
    const reIframe = /<iframe[^>]+src=["']([^"']+)["']/gi;
    while ((m = reIframe.exec(html))) {
      const src = absUrl(m[1]);
      if (src) add(src, "Embed");
    }

    // Common player patterns
    const reFile = /["']file["']\s*:\s*["']([^"']+)["']/gi;
    while ((m = reFile.exec(html))) add(m[1], "File");

    const reSource = /["'](?:src|source|url|stream)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = reSource.exec(html))) add(m[1], "Source");

    // Next.js payload sometimes has escaped URLs
    const reEscaped = /https?:\\\/\\\/[^"'\\\s]+/gi;
    while ((m = reEscaped.exec(html))) {
      add(m[0].replace(/\\\//g, "/"), "Payload");
    }

    return JSON.stringify({
      streams: streams.slice(0, 10),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
