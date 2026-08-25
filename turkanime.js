/**
 * TürkAnime TV – Sora / Luna
 * Turkish sub/dub anime (turkanime.tv)
 * Search: GET/POST /arama
 * v1.0.1
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
      if (!/\/anime\//i.test(href)) return;
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

    // 1) Try GET first (more reliable in Sora/Luna)
    try {
      const getUrl = baseUrl + "/arama?arama=" + encodeURIComponent(cleaned);
      html = await getText(
        await soraFetch(getUrl, {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,*/*",
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
            Referer: baseUrl + "/",
          },
        })
      );
    } catch (e) {}

    // 2) Fallback to POST if GET failed
    if (!html || html.length < 1500 || /Just a moment|404|Bulunamadı/i.test(html)) {
      try {
        html = await getText(
          await soraFetch(baseUrl + "/arama", {
            method: "POST",
            headers: {
              "User-Agent": UA,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "text/html,*/*",
              "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
              Referer: baseUrl + "/",
              Origin: baseUrl,
            },
            body: "arama=" + encodeURIComponent(cleaned),
          })
        );
      } catch (e2) {}
    }

    if (!html || html.length < 1000) {
      return JSON.stringify([]);
    }

    // --- Parsing ---

    // Pattern A: full anime links
    let re = /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/anime\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const slug = m[1].split("/").pop().replace(/\/$/, "");
      push(m[1], slug.replace(/-/g, " "), "");
    }

    // Pattern B: relative links
    re = /href="(\/anime\/[^"]+)"/gi;
    while ((m = re.exec(html))) {
      const slug = m[1].split("/").pop().replace(/\/$/, "");
      push(m[1], slug.replace(/-/g, " "), "");
    }

    // Pattern C: link + image + title nearby
    re =
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/anime\/[^"]+|\/anime\/[^"]+)"[^>]*>[\s\S]{0,400}?src="([^"]+)"[\s\S]{0,200}?(?:title|alt)="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      push(m[1], m[3], m[2]);
    }

    // Pattern D: title inside the <a>
    re =
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/anime\/[^"]+|\/anime\/[^"]+)"[^>]*>([^<]{3,100})</gi;
    while ((m = re.exec(html))) {
      const t = decodeEntities(m[2]).trim();
      if (t.length > 2) push(m[1], t, "");
    }

    // Score by relevance
    const q = cleaned.toLowerCase();
    const scored = results.map(function (r) {
      const t = r.title.toLowerCase();
      let score = 0;
      if (t.indexOf(q) >= 0) score += 15;
      q.split(/\s+/).forEach(function (w) {
        if (w.length > 2 && t.indexOf(w) >= 0) score += 4;
      });
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
      html.match(/class="[^"]*ozet[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<p[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
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
    const html = await getText(await soraFetch(absUrl(url)));
    const eps = [];
    const seen = {};

    const patterns = [
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/video\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(\/video\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="((?:https?:)?\/\/(?:www\.)?turkanime\.tv\/video\/[^"]+)"/gi,
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
          href.match(/-(\d+)(?:\.html)?$/);
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
      eps.push({ href: String(url), number: 1, title: "Bölüm 1" });
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
    const html = await getText(
      await soraFetch(absUrl(url), {
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
      if (
        !/\.m3u8|\.mp4|googlevideo|sibnet|drive|ok\.ru|vidmoly|dood|alucard|bankai|amaterasu|pixeldrain|sendvid|uqload|vudea/i.test(
          u
        ) &&
        !/player|embed|video/i.test(u)
      )
        return;
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

    // iframe embeds
    let m;
    const reIframe = /<iframe[^>]+src=["']([^"']+)["']/gi;
    while ((m = reIframe.exec(html))) add(absUrl(m[1]), "Embed");

    // data-src / data-url
    const reData = /data-(?:src|url|video|file)=["']([^"']+)["']/gi;
    while ((m = reData.exec(html))) add(absUrl(m[1]), "Data");

    // direct m3u8 / mp4
    const reM3u = /https?:\/\/[^"'\\\s<>]+?\.m3u8[^"'\\\s<>]*/gi;
    while ((m = reM3u.exec(html))) add(m[0], "HLS");

    const reMp4 = /https?:\/\/[^"'\\\s<>]+?\.mp4[^"'\\\s<>]*/gi;
    while ((m = reMp4.exec(html))) add(m[0], "MP4");

    // JS file: "..."
    const reFile = /["']file["']\s*:\s*["']([^"']+)["']/gi;
    while ((m = reFile.exec(html))) add(m[1], "File");

    // Player names
    const rePlayer =
      /(?:alucard|bankai|amaterasu|gdrive|sibnet|sendvid|uqload|vudea)[^"']*["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = rePlayer.exec(html))) add(m[1], "Player");

    // Generic player/embed links
    const reLink =
      /href=["'](https?:\/\/[^"']+(?:player|embed|video)[^"']*)["']/gi;
    while ((m = reLink.exec(html))) add(m[1], "Link");

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
