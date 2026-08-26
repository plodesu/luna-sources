/**
 * ÇizgiMax (cizgimax.online) – Sora / Luna
 * Search: /ara/?q=
 * Series: /diziler/{slug}-izle/
 * Episodes: /{slug}-{n}-sezon-{m}-bolum-izle/  or  /{slug}-{m}-bolum-izle/
 * Streams: atob(serverList) → /api/stream/sibnet/?t=… → direct mp4
 * v1.0.0
 */
const baseUrl = "https://cizgimax.online";
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
    const init = { method: method, headers: headers, body: body };
    if (options.redirect) init.redirect = options.redirect;
    return await fetch(url, init);
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
      if (res.headers && typeof res.headers.get === "function") {
        /* Response object without body yet */
      }
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

function parseHref(url) {
  const s = String(url || "");
  // /slug-2-sezon-15-bolum-izle/
  let m = s.match(
    /\/([^/?#]+?)-(\d+)-sezon-(\d+)-bolum(?:-izle)?\/?/i
  );
  if (m) {
    return {
      type: "episode",
      slug: m[1],
      season: parseInt(m[2], 10),
      episode: parseInt(m[3], 10),
      fullPath: s.replace(/^https?:\/\/[^/]+/i, "").split("?")[0],
    };
  }
  // /slug-15-bolum-izle/
  m = s.match(/\/([^/?#]+?)-(\d+)-bolum(?:-izle)?\/?/i);
  if (m) {
    return {
      type: "episode",
      slug: m[1],
      season: 0,
      episode: parseInt(m[2], 10),
      fullPath: s.replace(/^https?:\/\/[^/]+/i, "").split("?")[0],
    };
  }
  // /diziler/slug-izle/
  m = s.match(/\/diziler\/([^/?#]+?)(?:-izle)?\/?/i);
  if (m) {
    return {
      type: "series",
      slug: m[1].replace(/-izle$/i, ""),
      season: 0,
      episode: 0,
      fullPath: "",
    };
  }
  return { type: "unknown", slug: "", season: 0, episode: 0, fullPath: "" };
}

function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/sibnet/.test(n)) return 0;
  if (/vidmoly|rapidvid|vidmoxy/.test(n)) return 1;
  if (/voe/.test(n)) return 2;
  if (/dzen/.test(n)) return 3;
  if (/mailru|hdfc|byse|fkr/.test(n)) return 4;
  return 5;
}

/* ---------- stream helpers ---------- */
async function resolveProxyStream(proxyPath, referer) {
  const url = absUrl(proxyPath);
  if (!url) return [];
  try {
    // Prefer manual redirect to capture Location (direct mp4)
    let res = null;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Referer: referer || baseUrl + "/",
          Accept: "*/*",
        },
      });
    } catch (e) {
      res = await soraFetch(url, {
        headers: {
          "User-Agent": UA,
          Referer: referer || baseUrl + "/",
          Accept: "*/*",
        },
      });
    }

    if (!res) return [];

    // 302 / 301 → Location
    let loc = "";
    try {
      if (res.headers && typeof res.headers.get === "function") {
        loc = res.headers.get("Location") || res.headers.get("location") || "";
      }
    } catch (e) {}
    if (loc) {
      if (loc.indexOf("//") === 0) loc = "https:" + loc;
      if (loc.charAt(0) === "/") loc = baseUrl + loc;
      return [forceHttps(loc)];
    }

    // Some runtimes auto-follow; final url may be on response
    try {
      if (res.url && /\.(mp4|m3u8)(\?|$)/i.test(res.url)) {
        return [forceHttps(res.url)];
      }
    } catch (e) {}

    // Body might be tiny redirect HTML or already media URL text
    const text = await getText(res);
    if (/^https?:\/\//i.test(text.trim())) {
      return [forceHttps(text.trim().split(/\s/)[0])];
    }
    const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/i);
    if (m) return [forceHttps(m[0])];

    // Last resort: return proxy URL itself (player may follow 302)
    return [url];
  } catch (e) {
    return [url];
  }
}

async function resolveSibnetById(videoId) {
  if (!videoId) return [];
  try {
    const shell =
      "https://video.sibnet.ru/shell.php?videoid=" + encodeURIComponent(videoId);
    const html = await getText(
      await soraFetch(shell, {
        headers: {
          "User-Agent": UA,
          Referer: baseUrl + "/",
          Origin: "https://video.sibnet.ru",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html || /400 Bad/i.test(html) || html.length < 80) return [];
    const found = [];
    const patterns = [
      /player\.src\s*\(\s*\{[^}]*src\s*:\s*["']([^"']+)["']/i,
      /src\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
      /["']src["']\s*:\s*["']([^"']+)["']/i,
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = html.match(patterns[i]);
      if (!m) continue;
      let u = m[1].replace(/\\/g, "").trim();
      if (u.indexOf("//") === 0) u = "https:" + u;
      if (u.charAt(0) === "/") u = "https://video.sibnet.ru" + u;
      if (isHttp(u)) found.push(u);
    }
    const abs = html.match(
      /https?:\/\/[^"'\\\s]+sibnet[^"'\\\s]+\.mp4[^"'\\\s]*/gi
    );
    if (abs) abs.forEach(function (u) { found.push(u); });
    return found;
  } catch (e) {
    return [];
  }
}

/** Parse atob("...") server JSON from episode HTML */
function parseServerList(html) {
  const servers = [];
  if (!html) return servers;
  const atobs = html.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/g) || [];
  for (let i = 0; i < atobs.length; i++) {
    const m = atobs[i].match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/);
    if (!m) continue;
    let raw = "";
    try {
      raw = b64decode(m[1]);
    } catch (e) {
      continue;
    }
    if (!raw || (raw.charAt(0) !== "[" && raw.charAt(0) !== "{")) continue;
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) {
        j.forEach(function (s) {
          if (s && (s.streamUrl || s.resolveUrl || s.videoId)) servers.push(s);
        });
      } else if (j && typeof j === "object") {
        // { sub: [...], dub: [...], any: [...] }
        ["sub", "dub", "any"].forEach(function (k) {
          if (Array.isArray(j[k])) {
            j[k].forEach(function (s) {
              if (s && (s.streamUrl || s.resolveUrl || s.videoId))
                servers.push(s);
            });
          }
        });
      }
    } catch (e) {}
  }
  // dedupe by streamUrl/resolveUrl
  const seen = {};
  const out = [];
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    const key = String(s.streamUrl || s.resolveUrl || s.videoId || i);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(s);
  }
  return out;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]);
      if (!/\/$/.test(href)) href += "/";
      if (!href || seen[href]) return;
      if (!/\/diziler\/[^/]+-izle\/?$/i.test(href)) return;
      // skip category pages
      if (/\/diziler\/(anime|cizgi-film|dizi)-izle\/?$/i.test(href)) return;
      if (/\/diziler\/(anime|cizgi-film|dizi)\/?$/i.test(href)) return;
      seen[href] = true;
      let img = absUrl(image || "");
      if (img && img.indexOf("http") !== 0) img = absUrl(img);
      if (img.indexOf("data:") === 0) img = "";
      results.push({
        title: decodeEntities(title || "Seri")
          .replace(/\s+izle\s*$/i, "")
          .replace(/\s+/g, " ")
          .trim(),
        image: img,
        href: href,
      });
    }

    const searchUrl =
      baseUrl + "/ara/?q=" + encodeURIComponent(cleaned);
    const html = await getText(
      await soraFetch(searchUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          Referer: baseUrl + "/",
        },
      })
    );
    if (!html || html.length < 500) return JSON.stringify([]);

    // links to /diziler/xxx-izle/ + nearby poster/title
    let re =
      /href="((?:https?:\/\/[^"]+)?\/diziler\/[^"]+-izle\/?)"[\s\S]{0,400}?(?:src|data-src)="([^"]+\.(?:webp|jpg|jpeg|png)[^"]*)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const slug = (m[1].match(/\/diziler\/([^/]+)-izle/i) || [])[1] || "";
      const title = slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, function (c) {
          return c.toUpperCase();
        });
      push(m[1], title, m[2]);
    }

    re =
      /href="((?:https?:\/\/[^"]+)?\/diziler\/([^"]+)-izle\/?)"[^>]*title="([^"]+)"/gi;
    while ((m = re.exec(html))) push(m[1], m[3], "");

    re =
      /href="((?:https?:\/\/[^"]+)?\/diziler\/([^"]+)-izle\/?)"/gi;
    while ((m = re.exec(html))) {
      if (results.length >= 25) break;
      const title = m[2]
        .replace(/-/g, " ")
        .replace(/\b\w/g, function (c) {
          return c.toUpperCase();
        });
      // try poster convention
      const poster = "/img/locandine/" + m[2] + "-poster.webp";
      push(m[1], title, poster);
    }

    return JSON.stringify(results.slice(0, 25));
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* ===================== DETAILS ===================== */
async function extractDetails(url) {
  try {
    const p = parseHref(url);
    let page = String(url);
    if (p.type === "series" && p.slug) {
      page = baseUrl + "/diziler/" + p.slug + "-izle/";
    } else if (p.type === "episode" && p.slug) {
      page = baseUrl + "/diziler/" + p.slug + "-izle/";
    }
    const html = await getText(await soraFetch(page));

    let description = "N/A";
    const dm =
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      ) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i);
    if (dm) {
      description = decodeEntities(dm[1])
        .replace(/<[^>]+>/g, "")
        .slice(0, 900);
    }

    let aliases = "N/A";
    const am =
      html.match(/Orijinal\s*(?:Ad|İsim)\s*:?\s*([^<\n]{2,120})/i) ||
      html.match(/English\s*:?\s*([^<\n]{2,120})/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym =
      html.match(/Yapım\s*Yılı\s*:?\s*([^<\n]{2,40})/i) ||
      html.match(/Yıl\s*:?\s*(\d{4})/i);
    if (ym) airdate = decodeEntities(ym[1]).trim();

    return JSON.stringify([
      { description: description, aliases: aliases, airdate: airdate },
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
    const seriesUrl =
      p.slug
        ? baseUrl + "/diziler/" + p.slug.replace(/-izle$/i, "") + "-izle/"
        : String(url);

    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

    // /slug-2-sezon-15-bolum-izle/
    let re =
      /href="((?:https?:\/\/[^"]+)?\/([^"/]+?)-(\d+)-sezon-(\d+)-bolum(?:-izle)?\/?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      let full = absUrl(m[1]);
      if (!/\/$/.test(full)) full += "/";
      const season = parseInt(m[3], 10);
      const num = parseInt(m[4], 10);
      const key = season + "-" + num;
      if (seen[key]) continue;
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0)
        continue;
      seen[key] = true;
      eps.push({
        href: full,
        number: season > 1 ? season * 1000 + num : num,
        title:
          season > 0
            ? season + ". Sezon " + num + ". Bölüm"
            : num + ". Bölüm",
      });
    }

    // /slug-15-bolum-izle/ (no season)
    re =
      /href="((?:https?:\/\/[^"]+)?\/([^"/]+?)-(\d+)-bolum(?:-izle)?\/?)"/gi;
    while ((m = re.exec(html))) {
      if (/-sezon-\d+-bolum/i.test(m[1])) continue;
      let full = absUrl(m[1]);
      if (!/\/$/.test(full)) full += "/";
      const num = parseInt(m[3], 10);
      const key = "0-" + num;
      if (seen[key]) continue;
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0)
        continue;
      seen[key] = true;
      eps.push({
        href: full,
        number: num,
        title: num + ". Bölüm",
      });
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    // renumber if we used season*1000 scheme for display order only —
    // keep href/title; number field used for sorting in app
    if (!eps.length) {
      eps.push({ href: String(url), number: 1, title: "1. Bölüm" });
    }
    return JSON.stringify(eps.slice(0, 800));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "1. Bölüm" },
    ]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    let epUrl = String(url).split("?")[0];
    if (!/^https?:\/\//i.test(epUrl)) {
      epUrl = baseUrl + (epUrl.charAt(0) === "/" ? epUrl : "/" + epUrl);
    }
    if (!/\/$/.test(epUrl)) epUrl += "/";

    // series page → first episode
    if (/\/diziler\//i.test(epUrl)) {
      const seriesHtml = await getText(await soraFetch(epUrl));
      const em =
        seriesHtml.match(
          /href="((?:https?:\/\/[^"]+)?\/[^"]+?-1-sezon-1-bolum[^"]*)"/i
        ) ||
        seriesHtml.match(
          /href="((?:https?:\/\/[^"]+)?\/[^"]+-1-bolum(?:-izle)?\/?)"/i
        );
      if (!em) return JSON.stringify({ streams: [], subtitles: "" });
      epUrl = absUrl(em[1]);
      if (!/\/$/.test(epUrl)) epUrl += "/";
    }

    const epHtml = await getText(
      await soraFetch(epUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!epHtml || epHtml.length < 400) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const servers = parseServerList(epHtml);
    const streams = [];
    const seen = {};

    for (let i = 0; i < servers.length && streams.length < 10; i++) {
      const s = servers[i];
      const type = String(s.type || "").toLowerCase();
      const label =
        decodeEntities(s.label || type || "Host").trim() || type || "Host";

      let mediaUrls = [];

      // 1) Official stream proxy (best path)
      if (s.streamUrl) {
        mediaUrls = await resolveProxyStream(s.streamUrl, epUrl);
      }

      // 2) Sibnet videoId fallback
      if (!mediaUrls.length && s.videoId) {
        mediaUrls = await resolveSibnetById(String(s.videoId));
      }

      // 3) Dzen / opaque resolve – try np-resolve then skip heavy SPA
      if (!mediaUrls.length && s.resolveUrl && /dzen|np-resolve/i.test(String(s.resolveUrl) + type)) {
        try {
          const resolved = await getText(
            await soraFetch(absUrl(s.resolveUrl), {
              headers: {
                "User-Agent": UA,
                Referer: epUrl,
                Accept: "application/json",
              },
            })
          );
          // may return {"id":"..."} – not a direct media URL; skip for now
          const jm = resolved.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/i);
          if (jm) mediaUrls = [jm[0]];
        } catch (e) {}
      }

      for (let r = 0; r < mediaUrls.length; r++) {
        let media = forceHttps(mediaUrls[r]);
        if (media.indexOf("//") === 0) media = "https:" + media;
        if (!isHttp(media) || seen[media]) continue;
        // accept mp4/m3u8 or our own stream proxy / sibnet CDN
        if (
          !/\.(mp4|m3u8)(\?|$)/i.test(media) &&
          !/\/api\/stream\//i.test(media) &&
          !/sibnet\.ru/i.test(media)
        )
          continue;
        seen[media] = true;

        const isSib = /sibnet/i.test(media) || type === "sibnet";
        const isProxy = /cizgimax\.online\/api\/stream/i.test(media);

        streams.push({
          title: label,
          name: label,
          streamUrl: media,
          url: media,
          headers: {
            "User-Agent": UA,
            Accept: "*/*",
            Referer: isSib
              ? "https://video.sibnet.ru/"
              : isProxy
              ? epUrl
              : baseUrl + "/",
            Origin: isSib
              ? "https://video.sibnet.ru"
              : baseUrl,
          },
        });
      }
    }

    streams.sort(function (a, b) {
      return hostRank(a.title) - hostRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 10),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
