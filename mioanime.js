/**
 * MioAnime – Sora / Luna
 * Thai sub anime · player_new → /player/?hash= → JuicyCodes → HLS
 * v1.0.0
 */
const baseUrl = "https://www.mioanime.net";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
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

function parseHref(url) {
  const s = String(url || "");
  // episode: /play/20263/...
  let m = s.match(/\/play\/(\d+)/i);
  if (m) {
    return { type: "episode", playId: m[1], seriesId: "", href: s };
  }
  // series: /1462/
  m = s.match(/mioanime\.net\/(\d+)\/?/i) || s.match(/\/(\d+)\/?$/);
  if (m) {
    return { type: "series", playId: "", seriesId: m[1], href: s };
  }
  return { type: "unknown", playId: "", seriesId: "", href: s };
}

/* ---------- base64 + JuicyCodes packer unpack ---------- */

function b64decode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  str = String(str || "").replace(/[^A-Za-z0-9+/=]/g, "");
  let out = "";
  for (let i = 0; i < str.length; i += 4) {
    const a = chars.indexOf(str.charAt(i));
    const b = chars.indexOf(str.charAt(i + 1));
    const c = chars.indexOf(str.charAt(i + 2));
    const d = chars.indexOf(str.charAt(i + 3));
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== -1 && str.charAt(i + 2) !== "=")
      out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== -1 && str.charAt(i + 3) !== "=")
      out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

function baseN(n, base) {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (n === 0) return "0";
  let s = "";
  while (n > 0) {
    s = chars.charAt(n % base) + s;
    n = Math.floor(n / base);
  }
  return s;
}

function unpackDeanEdwards(packed) {
  const m = packed.match(
    /\}\('(.*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/s
  );
  if (!m) return packed;
  let p = m[1];
  const a = parseInt(m[2], 10);
  const c0 = parseInt(m[3], 10);
  const k = m[4].split("|");
  const dict = {};
  for (let i = 0; i < c0; i++) {
    const key = baseN(i, a);
    dict[key] = k[i] && k[i].length ? k[i] : key;
  }
  const keys = Object.keys(dict).sort(function (x, y) {
    return y.length - x.length;
  });
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (dict[key] === key) continue;
    const re = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    p = p.replace(re, dict[key]);
  }
  return p;
}

function unpackJuicyCodes(html) {
  if (!html || html.indexOf("JuicyCodes") < 0) return "";
  let arg = "";
  let m = html.match(/JuicyCodes\.Run\(([\s\S]*?)\)\s*;?\s*<\/script>/i);
  if (!m) m = html.match(/JuicyCodes\.Run\(([\s\S]*?)\)\s*;/i);
  if (!m) m = html.match(/JuicyCodes\.Run\(([\s\S]+)\)/i);
  if (!m) return "";
  arg = m[1];
  const parts = arg.match(/"([A-Za-z0-9+/=]*)"/g) || [];
  let joined = "";
  for (let i = 0; i < parts.length; i++) {
    joined += parts[i].replace(/"/g, "");
  }
  if (!joined) return "";
  let packed = "";
  try {
    packed = b64decode(joined);
  } catch (e) {
    return "";
  }
  if (packed.indexOf("eval(function") === 0 || packed.indexOf("}('") > 0) {
    return unpackDeanEdwards(packed);
  }
  return packed;
}

function extractHlsFromPlayer(html) {
  const out = [];
  if (!html) return out;

  const unpacked = unpackJuicyCodes(html);
  const sources = [html, unpacked];

  for (let s = 0; s < sources.length; s++) {
    const text = sources[s];
    if (!text) continue;

    let m;
    const re1 =
      /https:\/\/cdn-\d+\.bambam168\.xyz\/hls\/playlist\/[A-Za-z0-9+/=]+/g;
    while ((m = re1.exec(text))) out.push(m[0]);

    const re2 = /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8)[^"'\\\s<>]*/gi;
    while ((m = re2.exec(text))) {
      let u = m[0].replace(/\\+$/g, "").replace(/\\u0026/g, "&");
      if (isHttp(u)) out.push(u);
    }

    const re3 = /videoUrl\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = re3.exec(text))) out.push(m[1]);

    const re4 = /["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = re4.exec(text))) out.push(m[1]);
  }

  const seen = {};
  const uniq = [];
  for (let i = 0; i < out.length; i++) {
    const u = forceHttps(out[i]);
    if (!isHttp(u) || seen[u]) continue;
    seen[u] = true;
    uniq.push(u);
  }
  return uniq;
}

function extractHash(html) {
  if (!html) return "";
  let m = html.match(/player_new\/\?hash=([A-Za-z0-9+/=]+)/i);
  if (m) return m[1];
  m = html.match(/\/player\/\?hash=([A-Za-z0-9+/=]+)/i);
  if (m) return m[1];
  m = html.match(/playerv2\/\?hash=([A-Za-z0-9+/=]+)/i);
  if (m) return m[1];
  m = html.match(/hash=([A-Za-z0-9+/=]{40,})/i);
  if (m) return m[1];
  return "";
}

function episodeNumberFromTitle(title, fallback) {
  const t = String(title || "");
  let m = t.match(/ตอนที่\s*(\d+)/i) || t.match(/(?:ep|episode|e)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return fallback;
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(href);
      if (!href || seen[href]) return;
      // only series pages /ID/
      if (!/\/\d+\/?$/.test(href.replace(/\?.*$/, ""))) return;
      seen[href] = true;
      results.push({
        title: decodeEntities(title || "Anime").replace(/\s+/g, " ").trim(),
        image: absUrl(image || ""),
        href: href.indexOf("/", href.length - 1) >= 0 ? href : href + "/",
      });
    }

    // primary search
    const searchUrl =
      baseUrl + "/?search=" + encodeURIComponent(cleaned);
    let html = await getText(await soraFetch(searchUrl));

    // CF challenge → try category thai sub
    if (!html || html.length < 3000 || /Just a moment/i.test(html)) {
      html = await getText(
        await soraFetch(baseUrl + "/category/31/%E0%B8%8B%E0%B8%B1%E0%B8%9A%E0%B9%84%E0%B8%97%E0%B8%A2/")
      );
    }
    if (!html || html.length < 3000 || /Just a moment/i.test(html)) {
      html = await getText(await soraFetch(baseUrl + "/"));
    }

    // card patterns
    let re =
      /href="(https?:\/\/(?:www\.)?mioanime\.net\/\d+\/)"[\s\S]{0,400}?(?:alt|title)="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      push(m[1], m[2], "");
      if (results.length >= 25) break;
    }

    re =
      /href="(\/\d+\/)"[\s\S]{0,400}?(?:alt|title)="([^"]+)"/gi;
    while ((m = re.exec(html)) && results.length < 25) {
      push(m[1], m[2], "");
    }

    // filter by keyword if we fell back to home/category
    if (results.length > 8 && cleaned.length > 1) {
      const q = cleaned.toLowerCase();
      const filtered = results.filter(function (r) {
        return r.title.toLowerCase().indexOf(q) >= 0;
      });
      if (filtered.length) return JSON.stringify(filtered.slice(0, 20));
    }

    // posters
    for (let i = 0; i < results.length; i++) {
      const imgRe = new RegExp(
        'href="' +
          results[i].href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          '"[\\s\\S]{0,500}?src="([^"]+)"',
        "i"
      );
      const im = html.match(imgRe);
      if (im) results[i].image = absUrl(im[1]);
    }

    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    let page = url;
    if (p.type === "episode" && p.playId) {
      page = baseUrl + "/play/" + p.playId + "/";
    } else if (p.seriesId) {
      page = baseUrl + "/" + p.seriesId + "/";
    }
    const html = await getText(await soraFetch(page));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);
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
    const p = parseHref(url);
    let seriesUrl = url;
    if (p.type === "series" && p.seriesId) {
      seriesUrl = baseUrl + "/" + p.seriesId + "/";
    } else if (p.type === "episode") {
      // try to find series link from episode page
      const ehtml = await getText(
        await soraFetch(baseUrl + "/play/" + p.playId + "/")
      );
      const sm = ehtml.match(/href="(https?:\/\/(?:www\.)?mioanime\.net\/\d+\/)"/);
      if (sm) seriesUrl = sm[1];
      else {
        return JSON.stringify([
          {
            href: baseUrl + "/play/" + p.playId + "/",
            number: 1,
            title: "ตอนที่ 1",
          },
        ]);
      }
    }

    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

    const re =
      /href="(https?:\/\/(?:www\.)?mioanime\.net\/play\/(\d+)\/[^"]*)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = decodeEntities(m[1]);
      const playId = m[2];
      if (seen[playId]) continue;
      seen[playId] = true;
      // title near link
      const chunk = html.slice(m.index, m.index + 250);
      const tm = chunk.match(/>([^<]{3,80})</);
      let title = tm ? decodeEntities(tm[1]).trim() : "";
      if (!title || title.length < 2) {
        const slug = href.split("/").pop().replace(/\.html.*/, "");
        title = decodeURIComponent(slug).replace(/-/g, " ");
      }
      const num = episodeNumberFromTitle(title, eps.length + 1);
      eps.push({
        href: href,
        number: num,
        title: title.indexOf("ตอน") >= 0 ? title : "ตอนที่ " + num,
      });
    }

    // relative
    if (!eps.length) {
      const re2 = /href="(\/play\/(\d+)\/[^"]*)"/gi;
      while ((m = re2.exec(html))) {
        if (seen[m[2]]) continue;
        seen[m[2]] = true;
        const num = eps.length + 1;
        eps.push({
          href: absUrl(m[1]),
          number: num,
          title: "ตอนที่ " + num,
        });
      }
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    if (!eps.length) {
      eps.push({
        href: String(url),
        number: 1,
        title: "ตอนที่ 1",
      });
    }

    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "ตอนที่ 1" },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let epUrl = url;
    if (p.type === "episode" && p.playId) {
      epUrl = baseUrl + "/play/" + p.playId + "/";
    } else if (p.seriesId) {
      // first episode of series
      const seriesHtml = await getText(
        await soraFetch(baseUrl + "/" + p.seriesId + "/")
      );
      const em = seriesHtml.match(
        /href="(https?:\/\/(?:www\.)?mioanime\.net\/play\/\d+\/[^"]*)"/i
      );
      if (em) epUrl = decodeEntities(em[1]);
      else return JSON.stringify({ streams: [], subtitles: "" });
    }

    const epHtml = await getText(
      await soraFetch(epUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!epHtml || /Just a moment/i.test(epHtml)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const hash = extractHash(epHtml);
    if (!hash) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const streams = [];
    const seen = {};
    const headers = {
      "User-Agent": UA,
      Referer: baseUrl + "/",
      Origin: "https://www.mioanime.net",
      Accept: "*/*",
    };

    function addStream(title, streamUrl) {
      streamUrl = forceHttps(streamUrl);
      if (!isHttp(streamUrl) || seen[streamUrl]) return;
      seen[streamUrl] = true;
      streams.push({
        title: title,
        name: title,
        streamUrl: streamUrl,
        headers: headers,
      });
    }

    // --- Player 1: main /player/?hash= (best) ---
    const playerUrls = [
      baseUrl + "/player/?hash=" + hash,
      baseUrl + "/player_new/?hash=" + hash,
    ];

    for (let i = 0; i < playerUrls.length; i++) {
      const ph = await getText(
        await soraFetch(playerUrls[i], {
          headers: {
            Referer: epUrl,
            "User-Agent": UA,
            Accept: "text/html,*/*",
          },
        })
      );
      // nested iframe /player/
      if (ph && ph.indexOf("/player/?hash=") >= 0 && ph.indexOf("JuicyCodes") < 0) {
        const nested = ph.match(/src=["']([^"']*\/player\/\?hash=[^"']+)["']/i);
        if (nested) {
          const nh = await getText(
            await soraFetch(absUrl(decodeEntities(nested[1])), {
              headers: { Referer: playerUrls[i], "User-Agent": UA },
            })
          );
          const found = extractHlsFromPlayer(nh);
          for (let f = 0; f < found.length; f++) {
            addStream("MioAnime · HLS", found[f]);
          }
        }
      }
      const found = extractHlsFromPlayer(ph);
      for (let f = 0; f < found.length; f++) {
        addStream(i === 0 ? "MioAnime · HLS" : "MioAnime · Player", found[f]);
      }
      if (streams.length) break;
    }

    // --- Player 2: playerv2 / driveV4 backup ---
    if (!streams.length) {
      const driveUrl =
        "https://www.mplayer.click/driveV4/?token=" + encodeURIComponent(hash);
      const dh = await getText(
        await soraFetch(driveUrl, {
          headers: { Referer: baseUrl + "/", "User-Agent": UA },
        })
      );
      const found = extractHlsFromPlayer(dh);
      for (let f = 0; f < found.length; f++) {
        addStream("MioAnime · Drive", found[f]);
      }
      // direct mp4/google
      if (dh) {
        let m;
        const gre =
          /https?:\/\/(?:drive\.google\.com|[^"'\\\s]+googlevideo[^"'\\\s]+)[^"'\\\s]*/gi;
        while ((m = gre.exec(dh))) addStream("MioAnime · Drive", m[0]);
      }
    }

    return JSON.stringify({
      streams: streams.slice(0, 8),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
