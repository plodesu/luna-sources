/**
 * Asya Animeleri (asyaanimeleri.top) – Sora / Luna
 * Search: /?s=
 * Series: /series/{slug}/
 * Episodes: /{slug}-{n}-bolum/
 * Players: mirror select (base64 iframe) → Sibnet / GD / Abyss / Rumble
 * v1.0.0
 */
const baseUrl = "https://asyaanimeleri.top";
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
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
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
  let m = s.match(/\/([^/?#]+)-(\d+)-bolum(?:-[a-z0-9]+)?\/?/i);
  if (m) {
    return {
      type: "episode",
      slug: m[1],
      epSlug: m[1] + "-" + m[2] + "-bolum",
      episode: parseInt(m[2], 10),
    };
  }
  m = s.match(/\/series\/([^/?#]+)/i);
  if (m) return { type: "series", slug: m[1], epSlug: "", episode: 0 };
  return { type: "unknown", slug: "", epSlug: "", episode: 0 };
}

function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/sibnet/.test(n)) return 0;
  if (/gdrive|google|gd\b/.test(n)) return 1;
  if (/abyss|stream|iamcdn/.test(n)) return 2;
  if (/rumble/.test(n)) return 5;
  return 4;
}
function labelFromUrl(u) {
  u = String(u || "").toLowerCase();
  if (/sibnet/.test(u)) return "Sibnet";
  if (/drive\.google|googleapis/.test(u)) return "GDrive";
  if (/abyss|iamcdn|player\.abyss/.test(u)) return "Abyss";
  if (/rumble/.test(u)) return "Rumble";
  if (/voe/.test(u)) return "VOE";
  if (/dood/.test(u)) return "Doodstream";
  return "Host";
}

/* ---------- base64 + media helpers ---------- */
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
function findMediaUrls(text) {
  const out = [];
  if (!text) return out;
  let m;
  const re = /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)[^"'\\\s<>]*/gi;
  while ((m = re.exec(text))) {
    let u = m[0]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\+$/g, "");
    if (isHttp(u)) out.push(forceHttps(u));
  }
  return out;
}
function dedupeUrls(arr) {
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const u = forceHttps(String(arr[i] || "").split("#")[0]);
    if (!isHttp(u) || seen[u]) continue;
    if (/jquery|bootstrap|google-analytics|facebook|cdnjs|adsbygoogle/i.test(u))
      continue;
    seen[u] = true;
    out.push(u);
  }
  return out;
}

/* ---------- resolvers ---------- */
async function resolveSibnet(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          Referer: baseUrl + "/",
          "User-Agent": UA,
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html) return [];
    const found = findMediaUrls(html);
    const m =
      html.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/player\.src\(["']([^"']+)["']/i) ||
      html.match(/(https?:\/\/[^"' ]*sibnet[^"' ]+\.(?:mp4|m3u8)[^"' ]*)/i);
    if (m) {
      let u = m[1].replace(/['"]/g, "");
      if (u.indexOf("//") === 0) u = "https:" + u;
      if (isHttp(u)) found.push(u);
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveAbyss(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html) return [];
    let found = findMediaUrls(html);
    // jwplayer / file patterns
    const fm =
      html.match(/["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
      html.match(/["']sources?["']\s*:\s*\[\s*\{[^}]*["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
      html.match(/(https?:\/\/[^"'\s]+iamcdn[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
    if (fm) found.push(fm[1] || fm[0]);
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveGDrive(embedUrl) {
  try {
    // keep preview as last resort; many apps can open drive preview
    const idM = embedUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (idM) {
      // uc?export=download sometimes works, otherwise leave preview
      const direct =
        "https://drive.google.com/uc?export=download&id=" + idM[1];
      return [direct, forceHttps(embedUrl)];
    }
    return [forceHttps(embedUrl)];
  } catch (e) {
    return [];
  }
}

async function resolveGeneric(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    return dedupeUrls(findMediaUrls(html));
  } catch (e) {
    return [];
  }
}

async function resolveEmbed(embedUrl) {
  const u = forceHttps(embedUrl);
  if (/sibnet/i.test(u)) return resolveSibnet(u);
  if (/drive\.google/i.test(u)) return resolveGDrive(u);
  if (/abyss|iamcdn|player\.abyss/i.test(u)) return resolveAbyss(u);
  if (/rumble/i.test(u)) return []; // skip rumble for app players
  return resolveGeneric(u);
}

/** Extract mirror iframes from episode HTML (base64 options) */
function extractMirrors(html) {
  const jobs = [];
  if (!html) return jobs;
  // <option value="BASE64" ...>Label</option>
  const re =
    /<option[^>]+value=["']([A-Za-z0-9+/=]{40,})["'][^>]*>\s*([^<]*?)\s*<\/option>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const decoded = b64decode(m[1]);
      const srcM = decoded.match(/src=["']([^"']+)["']/i);
      if (srcM) {
        const label = decodeEntities(m[2] || "").trim() || labelFromUrl(srcM[1]);
        jobs.push({ url: forceHttps(srcM[1]), fansub: label });
      }
    } catch (e) {}
  }
  // also plain iframes on page
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) {
    const u = forceHttps(absUrl(m[1]));
    if (isHttp(u) && !/google\.com\/forms|adsbygoogle/i.test(u)) {
      jobs.push({ url: u, fansub: labelFromUrl(u) });
    }
  }
  return jobs;
}

/* ===================== SEARCH ===================== */
async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]).replace(/\/$/, "");
      if (!href || seen[href]) return;
      if (!/\/series\/[^/]+$/i.test(href)) return;
      seen[href] = true;
      let img = absUrl(image || "");
      if (img.indexOf("data:") === 0) img = "";
      results.push({
        title: decodeEntities(title || "Anime")
          .replace(/\s+/g, " ")
          .trim(),
        image: img,
        href: href,
      });
    }

    const searchUrl = baseUrl + "/?s=" + encodeURIComponent(cleaned);
    const html = await getText(
      await soraFetch(searchUrl, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*", Referer: baseUrl + "/" },
      })
    );
    if (!html || html.length < 500) return JSON.stringify([]);

    // theme cards: .bs / .bsx
    let re =
      /<div class="bs[^"]*"[\s\S]{0,1500}?href="((?:https?:\/\/[^"]+)?\/series\/[^"]+)"[\s\S]{0,400}?(?:src|data-src)="([^"]+)"[\s\S]{0,300}?title="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) push(m[1], m[3], m[2]);

    // alternate order (title before img)
    re =
      /href="((?:https?:\/\/[^"]+)?\/series\/[^"]+)"[^>]*title="([^"]+)"[\s\S]{0,500}?(?:src|data-src)="([^"]+)"/gi;
    while ((m = re.exec(html))) push(m[1], m[2], m[3]);

    // simple fallback
    re = /href="((?:https?:\/\/[^"]+)?\/series\/([^"]+))"[^>]*title="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      if (results.length >= 25) break;
      push(m[1], m[3], "");
    }

    // fill missing images from nearby uploads
    if (results.some((r) => !r.image)) {
      const imgs = [];
      const ire = /(?:src|data-src)="(https?:\/\/[^"]*\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
      while ((m = ire.exec(html))) imgs.push(m[1]);
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
    const page = p.slug
      ? p.type === "series"
        ? baseUrl + "/series/" + p.slug + "/"
        : baseUrl + "/series/" + p.slug + "/"
      : String(url);
    const seriesPage = /\/series\//i.test(page)
      ? page
      : baseUrl + "/series/" + (p.slug || "") + "/";
    const html = await getText(await soraFetch(seriesPage));

    let description = "N/A";
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\//i);
    if (dm) description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);

    let aliases = "N/A";
    const am =
      html.match(/Alternatif\s*:?\s*([^<\n]{2,120})/i) ||
      html.match(/English\s*:?\s*([^<\n]{2,120})/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym =
      html.match(/Yayın\s*:?\s*([^<\n]{2,80})/i) ||
      html.match(/Başlangıç\s*:?\s*([^<\n]{2,80})/i);
    if (ym) airdate = decodeEntities(ym[1]).trim();

    return JSON.stringify([{ description, aliases, airdate }]);
  } catch (e) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

/* ===================== EPISODES ===================== */
async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    const seriesUrl = p.slug
      ? baseUrl + "/series/" + p.slug + "/"
      : String(url);
    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

    const re =
      /href="((?:https?:\/\/[^"]+)?\/([^"/]+)-(\d+)-bolum(?:-[a-z0-9]+)?\/?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const full = absUrl(m[1]).replace(/\/$/, "") + "/";
      const num = parseInt(m[3], 10);
      if (seen[num]) continue;
      // belong to series
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0) continue;
      seen[num] = true;
      eps.push({
        href: full,
        number: num,
        title: num + ". Bölüm",
      });
    }

    eps.sort((a, b) => a.number - b.number);
    if (!eps.length) {
      eps.push({ href: String(url), number: 1, title: "1. Bölüm" });
    }
    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([{ href: String(url), number: 1, title: "1. Bölüm" }]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let epUrl = url;
    if (p.type === "episode" && p.epSlug) {
      epUrl = baseUrl + "/" + p.epSlug + "/";
    } else if (p.type === "series" && p.slug) {
      const seriesHtml = await getText(
        await soraFetch(baseUrl + "/series/" + p.slug + "/")
      );
      const em = seriesHtml.match(
        /href="((?:https?:\/\/[^"]+)?\/[^"]+-1-bolum[^"]*)"/i
      );
      if (!em) return JSON.stringify({ streams: [], subtitles: "" });
      epUrl = absUrl(em[1]);
    }

    const epHtml = await getText(
      await soraFetch(epUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!epHtml || epHtml.length < 400) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const embedJobs = extractMirrors(epHtml);
    const streams = [];
    const seen = {};

    for (let i = 0; i < embedJobs.length && streams.length < 10; i++) {
      const job = embedJobs[i];
      const host = job.fansub || labelFromUrl(job.url);
      const resolved = await resolveEmbed(job.url);
      for (let r = 0; r < resolved.length; r++) {
        const media = forceHttps(resolved[r]);
        if (!isHttp(media) || seen[media]) continue;
        // accept m3u8/mp4 or known host direct links
        if (
          !/\.(m3u8|mp4)(\?|$)/i.test(media) &&
          media.indexOf("m3u8") < 0 &&
          !/drive\.google\.com\/uc/i.test(media)
        )
          continue;
        seen[media] = true;
        streams.push({
          title: host,
          name: host,
          streamUrl: media,
          headers: {
            "User-Agent": UA,
            Referer: job.url,
            Origin: (job.url.match(/^(https?:\/\/[^/]+)/) || [null, baseUrl])[1],
            Accept: "*/*",
          },
        });
      }
    }

    streams.sort((a, b) => hostRank(a.title) - hostRank(b.title));
    return JSON.stringify({
      streams: streams.slice(0, 10),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
