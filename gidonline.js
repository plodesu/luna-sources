/**
 * GidOnline – Russian films & series for Sora / Luna
 * Site: https://gidonline.eu
 */

const baseUrl = "https://gidonline.eu";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
};

async function soraFetch(url, options = {}) {
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
  const method = options.method || "GET";
  const body = options.body || null;
  try {
    if (typeof fetchv2 === "function") {
      return await fetchv2(url, headers, method, body);
    }
    return await fetch(url, { headers, method, body });
  } catch (e) {
    try {
      return await fetch(url, { headers, method, body });
    } catch (err) {
      return null;
    }
  }
}

async function getText(res) {
  if (!res) return "";
  try {
    if (typeof res.text === "function") return await res.text();
    if (typeof res === "string") return res;
    return String(res);
  } catch (e) {
    return "";
  }
}

function decodeHtml(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function absUrl(u) {
  if (!u) return "";
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return baseUrl + u;
  return u;
}

async function searchResults(keyword) {
  try {
    const q = String(keyword || "")
      .replace(/Episode\s*\d+/gi, "")
      .replace(/Season\s*\d+/gi, "")
      .trim();
    if (!q) return JSON.stringify([]);

    const url =
      baseUrl +
      "/index.php?do=search&subaction=search&story=" +
      encodeURIComponent(q);

    const res = await soraFetch(url);
    const html = await getText(res);
    if (!html) return JSON.stringify([]);

    const results = [];
    const seen = {};

    const blockRe =
      /class="mainlink"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>[\s\S]*?<span>([^<]*)<\/span>/gi;

    let m;
    while ((m = blockRe.exec(html)) !== null) {
      const href = absUrl(m[1]);
      if (!href || seen[href]) continue;
      if (!/\.html/.test(href)) continue;
      seen[href] = true;

      const title =
        decodeHtml(m[4]) || decodeHtml(m[3]) || href.split("/").pop();
      const image = absUrl(m[2]);

      results.push({
        title: title,
        image: image,
        href: href,
      });
    }

    if (results.length === 0) {
      const simpleRe =
        /<a\s+href="((?:https?:\/\/gidonline\.eu)?\/\d+-[^"]+\.html)"[\s\S]{0,400}?alt="([^"]+)"/gi;
      while ((m = simpleRe.exec(html)) !== null) {
        const href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;
        results.push({
          title: decodeHtml(m[2]),
          image: "",
          href: href,
        });
      }
    }

    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const res = await soraFetch(url);
    const html = await getText(res);
    if (!html) {
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    }

    let description = "N/A";
    const descMatch =
      html.match(
        /<div[^>]+class="[^"]*(?:description|full-text|fdesc)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ) ||
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
      html.match(/name="description"\s+content="([^"]+)"/i);
    if (descMatch) {
      description = decodeHtml(descMatch[1].replace(/<[^>]+>/g, " ")).slice(
        0,
        800
      );
    }

    let aliases = "N/A";
    const orig =
      html.match(/Оригинальное\s*название[:\s]*<\/[^>]+>\s*([^<]+)/i) ||
      html.match(/itemprop="alternativeHeadline"[^>]*>([^<]+)/i);
    if (orig) aliases = decodeHtml(orig[1]);

    let airdate = "N/A";
    const year =
      html.match(/(?:Год|year)[:\s]*<\/[^>]+>\s*(?:<[^>]+>)*\s*(\d{4})/i) ||
      html.match(/itemprop="dateCreated"[^>]*content="(\d{4})/i) ||
      html.match(/\((\d{4})\)/);
    if (year) airdate = year[1];

    return JSON.stringify([{ description, aliases, airdate }]);
  } catch (err) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const res = await soraFetch(url);
    const html = await getText(res);

    const titleTag = (html.match(/<title>([^<]+)/i) || [])[1] || "";
    const isSeries =
      /сериал|season|сезон|эпизод|серия/i.test(html) &&
      !/фильм\s*\(/i.test(titleTag);

    if (isSeries) {
      const eps = [];
      const epRe =
        /data-(?:season|s)=["']?(\d+)["']?[^>]*data-(?:episode|e)=["']?(\d+)["']?/gi;
      let m;
      const seen = {};
      while ((m = epRe.exec(html)) !== null) {
        const key = m[1] + "-" + m[2];
        if (seen[key]) continue;
        seen[key] = true;
        eps.push({
          href: url + "#s" + m[1] + "e" + m[2],
          number: parseInt(m[2], 10),
          season: parseInt(m[1], 10),
          title: "S" + m[1] + "E" + m[2],
        });
      }
      if (eps.length > 0) return JSON.stringify(eps);
    }

    return JSON.stringify([
      {
        href: url,
        number: 1,
        season: 1,
        title: isSeries ? "Смотреть сериал" : "Смотреть фильм",
      },
    ]);
  } catch (err) {
    return JSON.stringify([
      { href: url, number: 1, season: 1, title: "Смотреть" },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const clean = String(url).split("#")[0];
    const res = await soraFetch(clean);
    const html = await getText(res);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const seen = {};

    const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let m;
    let idx = 0;
    while ((m = iframeRe.exec(html)) !== null) {
      let src = absUrl(m[1].replace(/&amp;/g, "&"));
      if (!src || seen[src]) continue;
      if (/youtube\.com|youtu\.be|trailer/i.test(src)) continue;
      seen[src] = true;
      idx++;
      streams.push({
        title: "GidOnline Player " + idx,
        streamUrl: src,
        headers: {
          "User-Agent": defaultHeaders["User-Agent"],
          Referer: baseUrl + "/",
        },
      });
    }

    const dataRe = /data-src=["']([^"']+)["']/gi;
    while ((m = dataRe.exec(html)) !== null) {
      let src = absUrl(m[1].replace(/&amp;/g, "&"));
      if (!src || seen[src]) continue;
      if (/youtube\.com|youtu\.be|\.jpg|\.png|\.webp/i.test(src)) continue;
      if (!/embed|player|api\.|play|video|kp=/i.test(src)) continue;
      seen[src] = true;
      streams.push({
        title: "GidOnline Embed",
        streamUrl: src,
        headers: {
          "User-Agent": defaultHeaders["User-Agent"],
          Referer: baseUrl + "/",
        },
      });
    }

    const kp =
      html.match(/[?&]kp=(\d+)/) ||
      html.match(/kinopoisk[^0-9]*(\d{3,})/i) ||
      html.match(/data-kp=["']?(\d+)/i);
    if (kp && streams.length === 0) {
      const id = kp[1];
      const embeds = [
        "https://api.embess.ws/embed/kp/" + id + "?host=gidonline.eu",
        "https://api.embess.ws/embed/kp/" + id,
      ];
      for (const e of embeds) {
        streams.push({
          title: "GidOnline KP " + id,
          streamUrl: e,
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: baseUrl + "/",
          },
        });
      }
    }

    return JSON.stringify({ streams: streams, subtitles: "" });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
