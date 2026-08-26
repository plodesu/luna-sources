/**
 * ÇizgiMax (cizgimax.online) – Sora / Luna
 * Search: /ara/?q=  (poster + film-name cards only)
 * Series: /diziler/{slug}-izle/
 * Episodes: /{slug}-{s}-sezon-{e}-bolum-izle/
 * Streams: JSON.parse(atob(...)) → /api/stream/sibnet/?t= → mp4 302
 * v1.0.1
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
function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/sibnet/.test(n)) return 0;
  if (/vidmoly|rapidvid|vidmoxy/.test(n)) return 1;
  if (/voe/.test(n)) return 2;
  if (/dzen/.test(n)) return 3;
  if (/mailru|hdfc|byse|fkr|hexload/.test(n)) return 4;
  return 5;
}
function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/([^/?#]+?)-(\d+)-sezon-(\d+)-bolum(?:-izle)?\/?/i);
  if (m)
    return {
      type: "episode",
      slug: m[1],
      season: parseInt(m[2], 10),
      episode: parseInt(m[3], 10),
    };
  m = s.match(/\/([^/?#]+?)-(\d+)-bolum(?:-izle)?\/?/i);
  if (m)
    return {
      type: "episode",
      slug: m[1],
      season: 0,
      episode: parseInt(m[2], 10),
    };
  m = s.match(/\/diziler\/([^/?#]+?)(?:-izle)?\/?/i);
  if (m)
    return {
      type: "series",
      slug: m[1].replace(/-izle$/i, ""),
      season: 0,
      episode: 0,
    };
  return { type: "unknown", slug: "", season: 0, episode: 0 };
}

/* ---------- server list (fix \/ escapes before atob) ---------- */
function parseServerList(html) {
  const servers = [];
  if (!html) return servers;

  const re = /JSON\.parse\(\s*atob\(\s*["']([^"']+)["']\s*\)\s*\)/g;
  let m;
  while ((m = re.exec(html))) {
    let raw = m[1]
      .replace(/\\\//g, "/")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"');
    let decoded = "";
    try {
      decoded = b64decode(raw);
    } catch (e) {
      continue;
    }
    if (!decoded || (decoded.charAt(0) !== "[" && decoded.charAt(0) !== "{"))
      continue;
    try {
      const j = JSON.parse(decoded);
      if (Array.isArray(j)) {
        j.forEach(function (s) {
          if (s && (s.streamUrl || s.resolveUrl || s.videoId)) servers.push(s);
        });
      } else if (j && typeof j === "object") {
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

  const seen = {};
  const out = [];
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    const key =
      String(s.type || "") +
      "|" +
      String(s.streamUrl || s.resolveUrl || s.videoId || i);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(s);
  }
  return out;
}

/* ---------- resolve stream proxy (302 → mp4) ---------- */
async function resolveProxyStream(proxyPath, referer) {
  const url = absUrl(proxyPath);
  if (!url) return [];
  const headers = {
    "User-Agent": UA,
    Referer: referer || baseUrl + "/",
    Accept: "*/*",
  };

  // 1) try manual redirect for Location
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: headers,
    });
    if (res) {
      let loc = "";
      try {
        if (res.headers && res.headers.get)
          loc = res.headers.get("Location") || res.headers.get("location") || "";
      } catch (e) {}
      // some runtimes expose status + headers differently
      if (!loc && res.status >= 300 && res.status < 400) {
        try {
          loc = (res.headers && res.headers.Location) || "";
        } catch (e) {}
      }
      if (loc) {
        if (loc.indexOf("//") === 0) loc = "https:" + loc;
        if (loc.charAt(0) === "/") loc = baseUrl + loc;
        return [forceHttps(loc)];
      }
      if (res.url && /\.(mp4|m3u8)(\?|$)/i.test(res.url)) {
        return [forceHttps(res.url)];
      }
    }
  } catch (e) {}

  // 2) soraFetch / fetchv2 may auto-follow; check final url
  try {
    const res2 = await soraFetch(url, { headers: headers });
    if (res2) {
      try {
        if (res2.url && /\.(mp4|m3u8)(\?|$)/i.test(res2.url)) {
          return [forceHttps(res2.url)];
        }
      } catch (e) {}
      // headers Location if still present
      try {
        if (res2.headers && res2.headers.get) {
          const loc2 =
            res2.headers.get("Location") || res2.headers.get("location") || "";
          if (loc2 && isHttp(loc2)) return [forceHttps(loc2)];
        }
      } catch (e) {}
    }
  } catch (e) {}

  // 3) return proxy URL itself — player often follows 302
  return [url];
}

async function resolveSibnetById(videoId) {
  if (!videoId) return [];
  try {
    const shell =
      "https://video.sibnet.ru/shell.php?videoid=" +
      encodeURIComponent(String(videoId));
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
      const mm = html.match(patterns[i]);
      if (!mm) continue;
      let u = mm[1].replace(/\\/g, "").trim();
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

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const qLower = cleaned.toLowerCase();

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]);
      if (!/\/$/.test(href)) href += "/";
      if (!href || seen[href]) return;
      if (!/\/diziler\/[^/]+-izle\/?$/i.test(href)) return;
      if (/\/diziler\/(anime|cizgi-film|dizi)(-izle)?\/?$/i.test(href)) return;
      seen[href] = true;
      let img = absUrl(image || "");
      if (img.indexOf("data:") === 0) img = "";
      title = decodeEntities(title || "")
        .replace(/\s+izle\s*$/i, "")
        .replace(/\s+-\s*Sezonluk Dizi.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return;
      results.push({ title: title, image: img, href: href });
    }

    const html = await getText(
      await soraFetch(baseUrl + "/ara/?q=" + encodeURIComponent(cleaned), {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          Referer: baseUrl + "/",
        },
      })
    );
    if (!html || html.length < 400) return JSON.stringify([]);

    // Primary: poster card + film-name
    // <a href="/diziler/xxx-izle/" class="poster"> ... img ... </a>
    // <a href="..." class="film-name">Title</a>
    const posterRe =
      /<a\s+href="((?:https?:\/\/[^"]+)?\/diziler\/[^"]+-izle\/?)"\s+class="poster">([\s\S]{0,900}?)<\/a>/gi;
    let m;
    while ((m = posterRe.exec(html))) {
      const href = m[1];
      const block = m[2];
      const imgM = block.match(/(?:src|data-src)="([^"]+)"/i);
      const after = html.slice(m.index, m.index + m[0].length + 500);
      const nameM =
        after.match(/class="film-name"[^>]*>([^<]+)/i) ||
        after.match(/class="phc-title"[^>]*>([^<]+)/i);
      const altM = after.match(/data-alt-title="([^"]+)"/i);
      let title = nameM ? nameM[1] : altM ? altM[1] : "";
      if (!title) {
        const slug = (href.match(/\/diziler\/([^/]+)-izle/i) || [])[1] || "";
        title = slug.replace(/-/g, " ");
      }
      // relevance: title or slug must contain a query token
      const slug = (href.match(/\/diziler\/([^/]+)-izle/i) || [])[1] || "";
      const hay = (title + " " + slug).toLowerCase();
      const tokens = qLower.split(/\s+/).filter(function (t) {
        return t.length > 1;
      });
      let ok = tokens.length === 0;
      for (let t = 0; t < tokens.length; t++) {
        if (hay.indexOf(tokens[t]) >= 0) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      push(href, title, imgM ? imgM[1] : "");
    }

    // Fallback: film-name links only (still filter by keyword)
    if (results.length < 3) {
      const fnRe =
        /<a\s+href="((?:https?:\/\/[^"]+)?\/diziler\/([^"]+)-izle\/?)"\s+class="film-name"[^>]*>([^<]+)/gi;
      while ((m = fnRe.exec(html))) {
        const hay = (m[2] + " " + m[3]).toLowerCase();
        const tokens = qLower.split(/\s+/).filter(function (t) {
          return t.length > 1;
        });
        let ok = false;
        for (let t = 0; t < tokens.length; t++) {
          if (hay.indexOf(tokens[t]) >= 0) {
            ok = true;
            break;
          }
        }
        if (!ok) continue;
        const poster = "/img/locandine/" + m[2] + "-poster.webp";
        push(m[1], m[3], poster);
      }
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
    if (p.slug) page = baseUrl + "/diziler/" + p.slug + "-izle/";
    const html = await getText(await soraFetch(page));

    let description = "N/A";
    const dm =
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      ) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i);
    if (dm)
      description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);

    let aliases = "N/A";
    const am =
      html.match(/Orijinal\s*(?:Ad|İsim)\s*:?\s*([^<\n]{2,120})/i) ||
      html.match(/data-alt-title="([^"]+)"/i);
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
    const seriesUrl = p.slug
      ? baseUrl + "/diziler/" + p.slug.replace(/-izle$/i, "") + "-izle/"
      : String(url);
    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

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
        number: season * 1000 + num,
        title: season + ". Sezon " + num + ". Bölüm",
      });
    }

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
      eps.push({ href: full, number: num, title: num + ". Bölüm" });
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    if (!eps.length)
      eps.push({ href: String(url), number: 1, title: "1. Bölüm" });
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
    if (!/^https?:\/\//i.test(epUrl))
      epUrl = baseUrl + (epUrl.charAt(0) === "/" ? epUrl : "/" + epUrl);
    if (!/\/$/.test(epUrl)) epUrl += "/";

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
    if (!epHtml || epHtml.length < 400)
      return JSON.stringify({ streams: [], subtitles: "" });

    const servers = parseServerList(epHtml);
    const streams = [];
    const seen = {};

    function addStream(title, media, refererHint) {
      media = forceHttps(String(media || ""));
      if (media.indexOf("//") === 0) media = "https:" + media;
      if (!isHttp(media) || seen[media]) return;
      if (
        !/\.(mp4|m3u8)(\?|$)/i.test(media) &&
        !/\/api\/stream\//i.test(media) &&
        !/sibnet\.ru/i.test(media)
      )
        return;
      seen[media] = true;
      const isSib = /sibnet/i.test(media) || /sibnet/i.test(title);
      const isProxy = /cizgimax\.online\/api\/stream/i.test(media);
      streams.push({
        title: title,
        name: title,
        streamUrl: media,
        url: media,
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          Referer: isSib
            ? "https://video.sibnet.ru/"
            : isProxy
            ? epUrl
            : refererHint || baseUrl + "/",
          Origin: isSib ? "https://video.sibnet.ru" : baseUrl,
        },
      });
    }

    for (let i = 0; i < servers.length && streams.length < 12; i++) {
      const s = servers[i];
      const type = String(s.type || "").toLowerCase();
      let label = decodeEntities(s.label || type || "Host").trim();
      if (!label) label = type || "Host";
      // clearer picker labels
      if (s.lang === "sub" && label.toLowerCase().indexOf("altyaz") < 0)
        label = label + " (Altyazı)";
      if (s.lang === "dub" && label.toLowerCase().indexOf("dublaj") < 0)
        label = label + " (Dublaj)";

      // A) Official proxy (sibnet / vidmoly / voe / …)
      if (s.streamUrl) {
        const resolved = await resolveProxyStream(s.streamUrl, epUrl);
        for (let r = 0; r < resolved.length; r++) {
          addStream(label, resolved[r], epUrl);
        }
        // always also expose proxy URL as selectable option
        addStream(label + " · Proxy", absUrl(s.streamUrl), epUrl);
      }

      // B) Sibnet videoId fallback
      if (s.videoId) {
        const byId = await resolveSibnetById(String(s.videoId));
        for (let r = 0; r < byId.length; r++) {
          addStream(label + " · CDN", byId[r], "https://video.sibnet.ru/");
        }
      }

      // C) Dzen opaque – only if direct media appears
      if (s.resolveUrl && !s.streamUrl) {
        try {
          const body = await getText(
            await soraFetch(absUrl(s.resolveUrl), {
              headers: {
                "User-Agent": UA,
                Referer: epUrl,
                Accept: "application/json,*/*",
              },
            })
          );
          const jm = body.match(
            /https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/i
          );
          if (jm) addStream(label, jm[0], epUrl);
        } catch (e) {}
      }
    }

    streams.sort(function (a, b) {
      return hostRank(a.title) - hostRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
