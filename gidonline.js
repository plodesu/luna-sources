/**
 * GidOnline RU – films & series for Sora / Luna
 * Site: https://gidonline.eu
 * v1.2.0 – mobile UA + embess m3u8 extraction (all titles)
 */

const baseUrl = "https://gidonline.eu";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
  const method = options.method || "GET";
  const body = options.body || null;
  try {
    if (typeof fetchv2 === "function") {
      return await fetchv2(url, headers, method, body);
    }
    return await fetch(url, { headers: headers, method: method, body: body });
  } catch (e1) {
    try {
      return await fetch(url, { headers: headers, method: method, body: body });
    } catch (e2) {
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
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/[Ss]\d+[Ee]\d+/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/Episode\s*\d+/gi, "")
    .replace(/Сезон\s*\d+/gi, "")
    .replace(/Серия\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
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
      if (!href || seen[href] || href.indexOf(".html") === -1) continue;
      seen[href] = true;
      results.push({
        title: decodeHtml(m[4] || m[3] || ""),
        image: absUrl(m[2]),
        href: href,
      });
    }

    if (results.length === 0) {
      const simpleRe =
        /<a\s+href="((?:https?:\/\/gidonline\.eu)?\/\d+-[^"]+\.html)"[\s\S]{0,500}?alt="([^"]+)"/gi;
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
        900
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

    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
    ]);
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

    const eps = [];
    const seen = {};

    const epRe =
      /data-(?:season|s)=["']?(\d+)["']?[^>]*data-(?:episode|e)=["']?(\d+)["']?/gi;
    let m;
    while ((m = epRe.exec(html)) !== null) {
      const key = m[1] + "-" + m[2];
      if (seen[key]) continue;
      seen[key] = true;
      const s = parseInt(m[1], 10);
      const e = parseInt(m[2], 10);
      eps.push({
        href: url + (url.indexOf("?") >= 0 ? "&" : "?") + "s=" + s + "&e=" + e,
        number: e,
        season: s,
        title: "S" + s + "E" + e,
      });
    }

    if (eps.length === 0) {
      const linkRe =
        /href="([^"]+)"[^>]*>\s*(?:Сезон\s*)?(\d+)\s*(?:серия|эпизод|e|E)\s*(\d+)/gi;
      while ((m = linkRe.exec(html)) !== null) {
        const key = m[2] + "-" + m[3];
        if (seen[key]) continue;
        seen[key] = true;
        eps.push({
          href: absUrl(m[1]),
          number: parseInt(m[3], 10),
          season: parseInt(m[2], 10),
          title: "S" + m[2] + "E" + m[3],
        });
      }
    }

    if (eps.length > 0) {
      eps.sort(function (a, b) {
        if (a.season !== b.season) return a.season - b.season;
        return a.number - b.number;
      });
      return JSON.stringify(eps);
    }

    return JSON.stringify([
      { href: url, number: 1, season: 1, title: "Смотреть" },
    ]);
  } catch (err) {
    return JSON.stringify([
      { href: url, number: 1, season: 1, title: "Смотреть" },
    ]);
  }
}

function findKinopoiskId(html) {
  const m =
    html.match(/[?&]kp=(\d+)/) ||
    html.match(/kinopoisk[^0-9]{0,20}(\d{3,8})/i) ||
    html.match(/data-kp=["']?(\d+)/i) ||
    html.match(/\/kp\/(\d+)/) ||
    html.match(/embed\/kp\/(\d+)/);
  return m ? m[1] : null;
}

function parseSeasonEpisode(url) {
  const s = (url.match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (url.match(/[?&#]e=(\d+)/i) || [])[1];
  return {
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null,
  };
}

function collectStreams(text, out, titlePrefix) {
  if (!text) return;
  const seen = {};

  const re = /https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let u = m[0]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\/g, "");
    u = u.replace(/[),;]+$/, "");
    if (seen[u]) continue;
    seen[u] = true;
    out.push({
      title:
        (titlePrefix || "HLS") +
        (out.length + 1 > 1 ? " " + (out.length + 1) : ""),
      streamUrl: u,
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
      },
    });
  }

  const fileRe = /file\s*[:=]\s*["']([^"']+)["']/gi;
  while ((m = fileRe.exec(text)) !== null) {
    let u = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    if (u.indexOf("http") !== 0) continue;
    if (seen[u]) continue;
    seen[u] = true;
    const isHls = u.indexOf("m3u8") !== -1;
    out.push({
      title: (titlePrefix || "Stream") + (isHls ? " HLS" : " MP4"),
      streamUrl: u,
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
      },
    });
  }

  const qRe = /\[(\d{3,4}p?)\]\s*(https?:\/\/[^\s,]+)/gi;
  while ((m = qRe.exec(text)) !== null) {
    let u = m[2].replace(/\\u0026/g, "&");
    if (seen[u]) continue;
    seen[u] = true;
    out.push({
      title: m[1],
      streamUrl: u,
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
      },
    });
  }
}

async function extractStreamUrl(url) {
  try {
    const clean = String(url).split("#")[0];
    const se = parseSeasonEpisode(clean);
    const pageUrl = clean.split("?")[0];

    const res = await soraFetch(pageUrl);
    const html = await getText(res);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const streams = [];
    const kp = findKinopoiskId(html);

    collectStreams(html, streams, "Page");

    if (kp) {
      const embessUrls = [
        "https://api.embess.ws/embed/kp/" + kp + "?host=gidonline.eu",
        "https://api.embess.ws/embed/kp/" + kp,
      ];
      if (se.season && se.episode) {
        embessUrls.push(
          "https://api.embess.ws/embed/kp/" +
            kp +
            "?host=gidonline.eu&s=" +
            se.season +
            "&e=" +
            se.episode
        );
        embessUrls.push(
          "https://api.embess.ws/embed/kp/" +
            kp +
            "?s=" +
            se.season +
            "&e=" +
            se.episode
        );
      }

      for (let i = 0; i < embessUrls.length; i++) {
        try {
          const er = await soraFetch(embessUrls[i]);
          const eh = await getText(er);
          if (eh && eh.length > 100) {
            collectStreams(eh, streams, "GidOnline");
          }
        } catch (e) {}
      }

      const backups = [
        "https://voidboost.net/embed/" + kp,
        "https://voidboost.net/?kp=" + kp,
        "https://api.ninsel.ws/embed/kp/" + kp,
      ];
      if (se.season && se.episode) {
        backups.push(
          "https://voidboost.net/serial/" +
            kp +
            "/iframe?s=" +
            se.season +
            "&e=" +
            se.episode
        );
      }
      for (let i = 0; i < backups.length; i++) {
        try {
          const br = await soraFetch(backups[i]);
          const bh = await getText(br);
          if (bh && bh.length > 100) collectStreams(bh, streams, "CDN");
        } catch (e) {}
      }
    }

    const iframeRe = /(?:iframe[^>]+src|data-src)=["']([^"']+)["']/gi;
    let im;
    const tried = {};
    while ((im = iframeRe.exec(html)) !== null) {
      let src = absUrl(im[1].replace(/&amp;/g, "&"));
      if (!src || tried[src]) continue;
      if (/youtube\.com|youtu\.be|trailer/i.test(src)) continue;
      tried[src] = true;
      try {
        const ir = await soraFetch(src, {
          headers: {
            "User-Agent": defaultHeaders["User-Agent"],
            Referer: pageUrl,
          },
        });
        const ih = await getText(ir);
        if (ih && ih.length > 100) collectStreams(ih, streams, "Player");
      } catch (e) {}
    }

    const uniq = [];
    const seenU = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s.streamUrl || seenU[s.streamUrl]) continue;
      if (
        s.streamUrl.indexOf(".m3u8") === -1 &&
        s.streamUrl.indexOf(".mp4") === -1 &&
        s.streamUrl.indexOf("/hls") === -1
      ) {
        continue;
      }
      seenU[s.streamUrl] = true;
      uniq.push(s);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (err) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
