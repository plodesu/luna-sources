/**
 * UAchan (uachan.top) – Sora / Luna
 * Ukrainian anime – direct HLS m3u8 in Playerjs
 * Search: POST do=search
 * v1.0.0
 */
const baseUrl = "https://uachan.top";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
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
  const epM = s.match(/[?#&]ep=(\d+)/i) || s.match(/#ep-(\d+)/i);
  const pageM = s.match(/\/anime\/(\d+)(?:-([^/?#]+))?/i);
  return {
    id: pageM ? pageM[1] : "",
    slug: pageM && pageM[2] ? pageM[2].replace(/\.html$/i, "") : "",
    episode: epM ? parseInt(epM[1], 10) : 0,
    pageUrl: pageM
      ? baseUrl + "/anime/" + pageM[1] + (pageM[2] ? "-" + pageM[2].replace(/\.html$/i, "") + ".html" : ".html")
      : s.split("#")[0].split("?")[0],
  };
}

function pageHref(id, slug) {
  return baseUrl + "/anime/" + id + (slug ? "-" + slug : "") + ".html";
}
function epHref(pageUrl, n) {
  return pageUrl.replace(/[?#].*$/, "") + "#ep-" + n;
}

/** Parse Playerjs playlist from HTML */
function parsePlaylist(html) {
  const out = [];
  // file: [{"title":"...","file":"https://...m3u8"},...]
  const m =
    html.match(/file:\s*(\[\s*\{[\s\S]*?\}\s*\])/i) ||
    html.match(/file:\s*(\[[\s\S]*?m3u8[\s\S]*?\])/i);
  if (!m) {
    // og:video single
    const og = html.match(/property="og:video"\s+content="([^"]+m3u8[^"]*)"/i);
    if (og) out.push({ number: 1, title: "1 серія", url: og[1] });
    return out;
  }
  let arr = null;
  try {
    arr = JSON.parse(m[1]);
  } catch (e) {
    // loose extract
    const re = /\{\s*"title"\s*:\s*"([^"]*)"\s*,\s*"file"\s*:\s*"([^"]+)"\s*\}/g;
    let x;
    while ((x = re.exec(m[1]))) {
      out.push({
        number: out.length + 1,
        title: x[1],
        url: x[2].replace(/\\\//g, "/"),
      });
    }
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    if (!it || !it.file) continue;
    const numM = String(it.title || "").match(/(\d+)/);
    out.push({
      number: numM ? parseInt(numM[1], 10) : i + 1,
      title: it.title || "Серія " + (i + 1),
      url: String(it.file).replace(/\\\//g, "/"),
    });
  }
  out.sort(function (a, b) {
    return a.number - b.number;
  });
  return out;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const body =
      "do=search&subaction=search&story=" + encodeURIComponent(cleaned);
    const html = await getText(
      await soraFetch(baseUrl + "/index.php?do=search", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: baseUrl,
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
        },
        body: body,
      })
    );
    if (!html) return JSON.stringify([]);

    // Prefer block after result count
    let chunk = html;
    const ri = html.indexOf("result_num");
    if (ri >= 0) chunk = html.substring(ri, ri + 100000);

    const results = [];
    const seen = {};
    const re =
      /<a class="poster[^"]*"\s+href="([^"]+)"[^>]*>[\s\S]*?(?:data-src|src)="([^"]+)"[^>]*(?:alt="([^"]*)")?[\s\S]*?<h2 class="poster__title[^"]*">\s*([^<]+)\s*<\/h2>/gi;
    let m;
    while ((m = re.exec(chunk))) {
      const href = absUrl(m[1]);
      if (!/\/anime\/\d+/i.test(href) || seen[href]) continue;
      seen[href] = true;
      const title = (m[4] || m[3] || "").replace(/&amp;/g, "&").trim();
      results.push({
        title: title || href,
        image: absUrl(m[2]),
        href: href,
      });
    }
    // fallback simpler
    if (!results.length) {
      const re2 =
        /href="((?:https?:\/\/[^"]+)?\/anime\/\d+-[^"]+\.html)"[^>]*>[\s\S]{0,400}?poster__title[^>]*>\s*([^<]+)/gi;
      while ((m = re2.exec(html))) {
        const href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;
        results.push({
          title: m[2].replace(/&amp;/g, "&").trim(),
          image: "",
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
    const p = parseHref(url);
    const html = await getText(await soraFetch(p.pageUrl || url));
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
        description: (desc || "N/A").slice(0, 900),
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
    const pageUrl = p.pageUrl || url;
    const html = await getText(await soraFetch(pageUrl));
    if (!html) return JSON.stringify([]);
    const list = parsePlaylist(html);
    const eps = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      eps.push({
        href: epHref(pageUrl, it.number),
        number: it.number,
        title: it.title || "Серія " + it.number,
      });
    }
    // Sora season split works if numbers restart per season page
    return JSON.stringify(eps.slice(0, 2000));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    const pageUrl = p.pageUrl || url;
    const want = p.episode || 1;
    const html = await getText(
      await soraFetch(pageUrl, {
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html)
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const list = parsePlaylist(html);
    let chosen = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].number === want) {
        chosen = list[i];
        break;
      }
    }
    if (!chosen && list.length) chosen = list[0];
    if (!chosen || !isHttp(chosen.url))
      return JSON.stringify({ streams: [], subtitles: "", stream: "" });

    const media = forceHttps(chosen.url);
    const headers = {
      "User-Agent": UA,
      Referer: baseUrl + "/",
      Origin: baseUrl,
      Accept: "*/*",
    };
    // Master playlist already exposes 1080p first on this CDN
    return JSON.stringify({
      stream: media,
      streams: [
        {
          title: "UA · " + (chosen.title || "Серія " + want),
          name: "UA · HLS",
          streamUrl: media,
          headers: headers,
        },
      ],
      subtitles: "",
      subtitle: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "", stream: "" });
  }
}
