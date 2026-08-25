/**
 * Asya Animeleri (asyaanimeleri.top) – Sora / Luna
 * v1.0.1 – fixed stream extraction (mirrors + Sibnet/OK)
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
  // /slug-12-bolum/ or /slug-12-bolum-turkce-altyazili/ or /slug-12-bolum-4k/
  let m = s.match(
    /\/([^/?#]+?)-(\d+)-bolum(?:-[a-z0-9-]+)?\/?(?:[?#]|$)/i
  );
  if (m) {
    return {
      type: "episode",
      slug: m[1],
      epSlug: m[1] + "-" + m[2] + "-bolum",
      episode: parseInt(m[2], 10),
      fullPath: s.replace(/^https?:\/\/[^/]+/i, "").split("?")[0],
    };
  }
  m = s.match(/\/series\/([^/?#]+)/i);
  if (m) return { type: "series", slug: m[1], epSlug: "", episode: 0, fullPath: "" };
  return { type: "unknown", slug: "", epSlug: "", episode: 0, fullPath: "" };
}

function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/sibnet/.test(n)) return 0;
  if (/ok\.ru|okru|odnoklassniki/.test(n)) return 1;
  if (/dailymotion|daily/.test(n)) return 2;
  if (/gdrive|google|gd\b/.test(n)) return 3;
  if (/abyss|stream|iamcdn/.test(n)) return 4;
  if (/fembed|femax|vanfem/.test(n)) return 5;
  if (/rumble/.test(n)) return 9;
  return 6;
}
function labelFromUrl(u) {
  u = String(u || "").toLowerCase();
  if (/sibnet/.test(u)) return "Sibnet";
  if (/ok\.ru|odnoklassniki/.test(u)) return "OK.ru";
  if (/dailymotion/.test(u)) return "Dailymotion";
  if (/drive\.google/.test(u)) return "GDrive";
  if (/abyss|iamcdn/.test(u)) return "Abyss";
  if (/fembed|femax|vanfem/.test(u)) return "Fembed";
  if (/rumble/.test(u)) return "Rumble";
  return "Host";
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
  // sibnet relative paths
  const rel = /["'](\/v\/[^"']+\.mp4[^"']*)["']/gi;
  while ((m = rel.exec(text))) {
    out.push("https://video.sibnet.ru" + m[1]);
  }
  return out;
}
function dedupeUrls(arr) {
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let u = forceHttps(String(arr[i] || "").split("#")[0]);
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (!isHttp(u) || seen[u]) continue;
    if (/jquery|bootstrap|google-analytics|facebook|cdnjs|adsbygoogle|yandex/i.test(u))
      continue;
    seen[u] = true;
    out.push(u);
  }
  return out;
}

/* ---------- resolvers ---------- */
async function resolveSibnet(embedUrl) {
  const found = [];
  try {
    const idM = String(embedUrl).match(/videoid=(\d+)/i);
    const vid = idM ? idM[1] : "";

    // 1) normal GET
    let html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          Referer: baseUrl + "/",
          Origin: "https://video.sibnet.ru",
          "User-Agent": UA,
          Accept: "text/html,*/*",
        },
      })
    );

    // 2) POST buffer_method=full (some regions)
    if ((!html || html.length < 200 || /400 Bad/i.test(html)) && vid) {
      html = await getText(
        await soraFetch(
          "https://video.sibnet.ru/shell.php?videoid=" + vid,
          {
            method: "POST",
            headers: {
              Referer: "https://video.sibnet.ru/shell.php?videoid=" + vid,
              Origin: "https://video.sibnet.ru",
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": UA,
            },
            body: "buffer_method=full",
          }
        )
      );
    }

    if (html && html.length > 100) {
      findMediaUrls(html).forEach((u) => found.push(u));
      const m =
        html.match(/player\.src\s*\(\s*\[?\s*\{?\s*src\s*:\s*["']([^"']+)["']/i) ||
        html.match(/src\s*:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
        html.match(/["']src["']\s*:\s*["']([^"']+)["']/i);
      if (m) {
        let u = m[1].replace(/\\/g, "");
        if (u.indexOf("//") === 0) u = "https:" + u;
        if (u.charAt(0) === "/") u = "https://video.sibnet.ru" + u;
        if (isHttp(u)) found.push(u);
      }
    }
  } catch (e) {}
  return dedupeUrls(found);
}

async function resolveOkRu(embedUrl) {
  try {
    let u = forceHttps(embedUrl);
    if (u.indexOf("//") === 0) u = "https:" + u;
    // normalize
    u = u.replace("://ok.ru/", "://m.ok.ru/");
    const html = await getText(
      await soraFetch(u, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html) return [];
    const found = findMediaUrls(html);
    // data-options / flashvars style
    const opt =
      html.match(/data-options="([^"]+)"/i) ||
      html.match(/data-movie-id="([^"]+)"/i);
    if (opt) {
      const raw = decodeEntities(opt[1])
        .replace(/&quot;/g, '"')
        .replace(/\\\//g, "/");
      findMediaUrls(raw).forEach((x) => found.push(x));
      const hm = raw.match(
        /(?:hlsMasterPlaylistUrl|videoSrc|ondemandSrc|movieSrc)["']?\s*:\s*["'](https?:[^"']+)/i
      );
      if (hm) found.push(hm[1].replace(/\\\//g, "/"));
    }
    // okcdn
    const cdn = html.match(
      /(https?:\/\/(?:vd|videocdn)[^"'\\\s]+\.(?:mp4|m3u8)[^"'\\\s]*)/gi
    );
    if (cdn) cdn.forEach((x) => found.push(x));
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveDailymotion(embedUrl) {
  try {
    const idM = String(embedUrl).match(
      /dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/i
    );
    if (!idM) return [];
    const id = idM[1];
    const meta = await getText(
      await soraFetch(
        "https://www.dailymotion.com/player/metadata/video/" + id,
        {
          headers: {
            Referer: "https://www.dailymotion.com/",
            "User-Agent": UA,
            Accept: "application/json",
          },
        }
      )
    );
    const found = [];
    try {
      const j = JSON.parse(meta);
      const q = j.qualities || {};
      Object.keys(q).forEach((k) => {
        const arr = q[k];
        if (Array.isArray(arr)) {
          arr.forEach((it) => {
            if (it && it.url) found.push(it.url);
          });
        }
      });
    } catch (e) {}
    findMediaUrls(meta).forEach((u) => found.push(u));
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

async function resolveGDrive(embedUrl) {
  try {
    const idM = embedUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (idM) {
      return [
        "https://drive.google.com/uc?export=download&id=" + idM[1],
        forceHttps(embedUrl),
      ];
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
  let u = forceHttps(embedUrl);
  if (u.indexOf("//") === 0) u = "https:" + u;
  if (/sibnet/i.test(u)) return resolveSibnet(u);
  if (/ok\.ru|odnoklassniki/i.test(u)) return resolveOkRu(u);
  if (/dailymotion/i.test(u)) return resolveDailymotion(u);
  if (/drive\.google/i.test(u)) return resolveGDrive(u);
  if (/rumble/i.test(u)) return []; // skip
  if (/fembed|femax|vanfem|membed/i.test(u)) return resolveGeneric(u);
  if (/abyss|iamcdn/i.test(u)) return resolveGeneric(u);
  return resolveGeneric(u);
}

function extractMirrors(html) {
  const jobs = [];
  const seen = {};
  if (!html) return jobs;

  // base64 option values
  const re =
    /<option[^>]*value=["']([A-Za-z0-9+/=]{30,})["'][^>]*>\s*([^<]*?)\s*<\/option>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const decoded = b64decode(m[1]);
      const srcM = decoded.match(/src=["']([^"']+)["']/i);
      if (!srcM) continue;
      let src = srcM[1].trim();
      if (src.indexOf("//") === 0) src = "https:" + src;
      src = forceHttps(src);
      if (!isHttp(src) || seen[src]) continue;
      seen[src] = true;
      const label = decodeEntities(m[2] || "").trim() || labelFromUrl(src);
      jobs.push({ url: src, fansub: label });
    } catch (e) {}
  }

  // plain iframes
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) {
    let src = m[1].trim();
    if (src.indexOf("//") === 0) src = "https:" + src;
    src = forceHttps(absUrl(src));
    if (!isHttp(src) || seen[src]) continue;
    if (/google\.com\/forms|adsbygoogle|facebook/i.test(src)) continue;
    seen[src] = true;
    jobs.push({ url: src, fansub: labelFromUrl(src) });
  }
  return jobs;
}

function isPlayableUrl(media) {
  if (!isHttp(media)) return false;
  if (/\.(m3u8|mp4)(\?|$)/i.test(media)) return true;
  if (/m3u8|\/v\/.+\.mp4|uc\?export=download|okcdn|sibnet\.ru\/v\//i.test(media))
    return true;
  return false;
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
        title: decodeEntities(title || "Anime").replace(/\s+/g, " ").trim(),
        image: img,
        href: href,
      });
    }

    const html = await getText(
      await soraFetch(baseUrl + "/?s=" + encodeURIComponent(cleaned), {
        headers: { "User-Agent": UA, Accept: "text/html,*/*", Referer: baseUrl + "/" },
      })
    );
    if (!html || html.length < 500) return JSON.stringify([]);

    let re =
      /<div class="bs[^"]*"[\s\S]{0,1500}?href="((?:https?:\/\/[^"]+)?\/series\/[^"]+)"[\s\S]{0,400}?(?:src|data-src)="([^"]+)"[\s\S]{0,300}?title="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) push(m[1], m[3], m[2]);

    re =
      /href="((?:https?:\/\/[^"]+)?\/series\/[^"]+)"[^>]*title="([^"]+)"[\s\S]{0,500}?(?:src|data-src)="([^"]+)"/gi;
    while ((m = re.exec(html))) push(m[1], m[2], m[3]);

    re = /href="((?:https?:\/\/[^"]+)?\/series\/([^"]+))"[^>]*title="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      if (results.length >= 25) break;
      push(m[1], m[3], "");
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
    const seriesPage =
      p.type === "series" && p.slug
        ? baseUrl + "/series/" + p.slug + "/"
        : p.slug
        ? baseUrl + "/series/" + p.slug + "/"
        : String(url);
    const html = await getText(await soraFetch(seriesPage));
    let description = "N/A";
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/name=["']description["']\s+content=["']([^"']+)/i);
    if (dm) description = decodeEntities(dm[1]).replace(/<[^>]+>/g, "").slice(0, 900);
    return JSON.stringify([
      { description, aliases: "N/A", airdate: "N/A" },
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
      ? baseUrl + "/series/" + p.slug + "/"
      : String(url);
    const html = await getText(await soraFetch(seriesUrl));
    const eps = [];
    const seen = {};

    // matches -N-bolum and -N-bolum-anything
    const re =
      /href="((?:https?:\/\/[^"]+)?\/([^"/]+)-(\d+)-bolum(?:-[a-z0-9-]+)?\/?)"/gi;
    let m;
    while ((m = re.exec(html))) {
      let full = absUrl(m[1]);
      if (!/\/$/.test(full)) full += "/";
      const num = parseInt(m[3], 10);
      if (seen[num]) continue;
      if (p.slug && m[2].indexOf(p.slug) < 0 && p.slug.indexOf(m[2]) < 0)
        continue;
      seen[num] = true;
      eps.push({ href: full, number: num, title: num + ". Bölüm" });
    }

    eps.sort((a, b) => a.number - b.number);
    if (!eps.length) {
      eps.push({ href: String(url), number: 1, title: "1. Bölüm" });
    }
    return JSON.stringify(eps.slice(0, 500));
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, title: "1. Bölüm" },
    ]);
  }
}

/* ===================== STREAMS ===================== */
async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let epUrl = String(url);

    // prefer the exact episode URL the app passed in
    if (p.type === "episode") {
      if (p.fullPath) {
        epUrl = baseUrl + p.fullPath;
        if (!/\/$/.test(epUrl)) epUrl += "/";
      } else if (p.epSlug) {
        epUrl = baseUrl + "/" + p.epSlug + "/";
      }
    } else if (p.type === "series" && p.slug) {
      const seriesHtml = await getText(
        await soraFetch(baseUrl + "/series/" + p.slug + "/")
      );
      const em = seriesHtml.match(
        /href="((?:https?:\/\/[^"]+)?\/[^"]+-1-bolum[^"]*)"/i
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

    const embedJobs = extractMirrors(epHtml);
    const streams = [];
    const seen = {};

    for (let i = 0; i < embedJobs.length && streams.length < 12; i++) {
      const job = embedJobs[i];
      const host = job.fansub || labelFromUrl(job.url);
      let resolved = await resolveEmbed(job.url);

      // if resolver empty, still try raw media patterns on a second fetch
      if (!resolved.length) {
        const html2 = await getText(
          await soraFetch(job.url, {
            headers: {
              Referer: baseUrl + "/",
              "User-Agent": UA,
              Accept: "*/*",
            },
          })
        );
        resolved = dedupeUrls(findMediaUrls(html2));
      }

      for (let r = 0; r < resolved.length; r++) {
        let media = forceHttps(resolved[r]);
        if (media.indexOf("//") === 0) media = "https:" + media;
        if (media.charAt(0) === "/") {
          if (/sibnet/i.test(job.url)) media = "https://video.sibnet.ru" + media;
          else continue;
        }
        if (!isPlayableUrl(media) || seen[media]) continue;
        seen[media] = true;

        const headers = {
          "User-Agent": UA,
          Accept: "*/*",
          Referer: job.url,
          Origin: (job.url.match(/^(https?:\/\/[^/]+)/) || [null, baseUrl])[1],
        };
        // Sibnet CDN often requires this referer
        if (/sibnet/i.test(media) || /sibnet/i.test(job.url)) {
          headers.Referer = job.url;
          headers.Origin = "https://video.sibnet.ru";
        }

        streams.push({
          title: host,
          name: host,
          streamUrl: media,
          headers: headers,
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
