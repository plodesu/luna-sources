/**
 * TürkAnime (turkanime.tv) – Sora / Luna
 * Search: /arama?arama=
 * Posters: data-img / serilerb
 * Streams: resolve VOE / Filemoon / Dood / Sibnet / MediaCM → m3u8|mp4
 * v1.0.2
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
function parseHref(url) {
  const s = String(url || "");
  let m = s.match(/\/video\/([^/?#]+)/i);
  if (m) {
    const epSlug = m[1];
    const em = epSlug.match(/-(\d+)-bolum$/i);
    return {
      type: "episode",
      slug: epSlug.replace(/-\d+-bolum$/i, ""),
      epSlug: epSlug,
      episode: em ? parseInt(em[1], 10) : 1,
    };
  }
  m = s.match(/\/anime\/([^/?#]+)/i);
  if (m) return { type: "series", slug: m[1], epSlug: "", episode: 0 };
  return { type: "unknown", slug: "", epSlug: "", episode: 0 };
}

function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/sibnet/.test(n)) return 0;
  if (/voe/.test(n)) return 1;
  if (/filemoon|moon/.test(n)) return 2;
  if (/dood/.test(n)) return 3;
  if (/mediacm|media\.cm/.test(n)) return 4;
  if (/streamwish|wish/.test(n)) return 5;
  return 6;
}
function labelFromUrl(u) {
  u = String(u || "").toLowerCase();
  if (/sibnet/.test(u)) return "Sibnet";
  if (/voe\.sx|voe\.video/.test(u)) return "VOE";
  if (/filemoon|moon|bysesukior|kerapoxy|farordoms/.test(u)) return "Filemoon";
  if (/dood\./.test(u)) return "Doodstream";
  if (/media\.cm|mediacm/.test(u)) return "MediaCM";
  if (/streamwish|swish/.test(u)) return "StreamWish";
  return "Host";
}

/* ---------- unpack helpers ---------- */
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
    const re = new RegExp(
      "\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "g"
    );
    p = p.replace(re, dict[key]);
  }
  return p;
}

function findMediaUrls(text) {
  const out = [];
  if (!text) return out;
  let m;
  const re =
    /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)[^"'\\\s<>]*/gi;
  while ((m = re.exec(text))) {
    let u = m[0]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\+$/g, "");
    if (isHttp(u)) out.push(forceHttps(u));
  }
  return out;
}

/** Resolve VOE embed → m3u8 */
async function resolveVoe(embedUrl) {
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
    if (!html || html.length < 200) return [];
    const found = findMediaUrls(html);
    // sources / hls json
    let m = html.match(
      /["']hls["']\s*:\s*["'](https?:\/\/[^"']+)["']/i
    );
    if (m) found.push(m[1]);
    m = html.match(
      /["']file["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i
    );
    if (m) found.push(m[1]);
    // base64 blob
    const b64s = html.match(/["']([A-Za-z0-9+/]{60,}={0,2})["']/g) || [];
    for (let i = 0; i < b64s.length && i < 8; i++) {
      try {
        const raw = b64decode(b64s[i].replace(/['"]/g, ""));
        findMediaUrls(raw).forEach(function (u) {
          found.push(u);
        });
        if (/https?:\/\//.test(raw) && /\.m3u8/.test(raw)) {
          const um = raw.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
          if (um) found.push(um[0]);
        }
      } catch (e) {}
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

/** Filemoon-family (packer) */
async function resolveFilemoon(embedUrl) {
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
    let text = html;
    if (/eval\(function\(p,a,c,k,e/.test(html)) {
      const pm = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\('[\s\S]+?'\.split\('\|'\)\)\)/);
      if (pm) text += "\n" + unpackDeanEdwards(pm[0]);
    }
    const found = findMediaUrls(text);
    const fm = text.match(
      /["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/i
    );
    if (fm) found.push(fm[1]);
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

/** Doodstream pass_md5 → mp4 */
async function resolveDood(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          Referer: "https://dood.watch/",
          "User-Agent": UA,
        },
      })
    );
    if (!html) return [];
    const pass = html.match(/\/pass_md5\/([a-zA-Z0-9\/]+)/);
    if (!pass) {
      return dedupeUrls(findMediaUrls(html));
    }
    const passUrl =
      forceHttps(embedUrl).replace(/\/e\/.*/, "") +
      "/pass_md5/" +
      pass[1];
    const tokenPart = await getText(
      await soraFetch(passUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent": UA,
        },
      })
    );
    if (!tokenPart || tokenPart.length < 10 || tokenPart.length > 500)
      return [];
    // dood final url = token + random chars + ?token=
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let rnd = "";
    for (let i = 0; i < 10; i++)
      rnd += chars.charAt(Math.floor(Math.random() * chars.length));
    const tok = html.match(/[?&]token=([a-zA-Z0-9]+)/) ||
      html.match(/makePlay\(['"]([^'"]+)/);
    let finalUrl = String(tokenPart).trim() + rnd;
    if (tok) finalUrl += "?token=" + tok[1] + "&expiry=" + Date.now();
    if (isHttp(finalUrl)) return [forceHttps(finalUrl)];
    return [];
  } catch (e) {
    return [];
  }
}

/** Sibnet – often direct video */
async function resolveSibnet(embedUrl) {
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html) return [];
    const found = findMediaUrls(html);
    const m =
      html.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/player\.src\(([^)]+)\)/i);
    if (m) {
      let u = m[1].replace(/['"]/g, "");
      if (u.indexOf("//") === 0) u = "https:" + u;
      if (isHttp(u)) found.push(u);
    }
    // sibnet video path
    const sm = html.match(
      /(https?:\/\/[^"' ]*sibnet[^"' ]+\.(?:mp4|m3u8)[^"' ]*)/i
    );
    if (sm) found.push(sm[1]);
    return dedupeUrls(found);
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

function dedupeUrls(arr) {
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const u = forceHttps(String(arr[i] || "").split("#")[0]);
    if (!isHttp(u) || seen[u]) continue;
    if (/jquery|bootstrap|google|facebook|cdnjs/i.test(u)) continue;
    seen[u] = true;
    out.push(u);
  }
  return out;
}

async function resolveEmbed(embedUrl) {
  const u = forceHttps(embedUrl);
  if (/voe\.sx|voe\.video/i.test(u)) return resolveVoe(u);
  if (/dood\./i.test(u)) return resolveDood(u);
  if (/sibnet/i.test(u)) return resolveSibnet(u);
  if (
    /filemoon|bysesukior|kerapoxy|farordoms|moon\.|mediacm|media\.cm|streamwish|swish/i.test(
      u
    )
  )
    return resolveFilemoon(u);
  return resolveGeneric(u);
}

function extractEmbedsFromHtml(html) {
  const out = [];
  if (!html) return out;
  let m;
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) {
    let u = absUrl(decodeEntities(m[1]));
    if (!u || /turkanime\.tv\/embed/i.test(u)) continue;
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (isHttp(u)) out.push(forceHttps(u));
  }
  const hostRe =
    /(https?:)?\/\/(?:[a-z0-9.-]+\.)?(?:voe\.sx|voe\.video|dood\.(?:watch|to|so|ws|pm|la|li)|sibnet\.ru|filemoon\.|bysesukior\.|media\.cm|streamwish\.|mp4upload\.)[^\s"'<>\\]+/gi;
  while ((m = hostRe.exec(html))) {
    let u = m[0];
    if (u.indexOf("//") === 0) u = "https:" + u;
    out.push(forceHttps(u));
  }
  return dedupeUrls(out);
}

function collectVideosecUrls(html) {
  const urls = [];
  if (!html) return urls;
  const re =
    /ajax\/videosec&b=([^&"'\s]+)&(?:v=([^&"'\s]+)&)?f=([^&"'\s]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    let q = "ajax/videosec&b=" + m[1];
    if (m[2]) q += "&v=" + m[2];
    q += "&f=" + m[3];
    const full = baseUrl + "/" + q;
    if (urls.indexOf(full) < 0) urls.push(full);
  }
  return urls.slice(0, 16);
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]).replace(/\/$/, "");
      if (!href || seen[href]) return;
      if (!/\/anime\/[^/]+$/.test(href)) return;
      seen[href] = true;
      let img = absUrl(image || "");
      if (img.indexOf("data:") === 0) img = "";
      results.push({
        title: decodeEntities(title || "Anime")
          .replace(/\s+izle\s*$/i, "")
          .replace(/\s+/g, " ")
          .trim(),
        image: img,
        href: href,
      });
    }

    const searchUrl =
      baseUrl + "/arama?arama=" + encodeURIComponent(cleaned);
    const html = await getText(
      await soraFetch(searchUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          Referer: baseUrl + "/",
        },
      })
    );

    if (!html || html.length < 1000) return JSON.stringify([]);

    // top-airing style: data-title + data-img
    let re =
      /href="((?:\/\/www\.turkanime\.tv)?\/anime\/[^"]+)"[^>]*class="top-airing-item"[^>]*data-title="([^"]+)"[^>]*data-img="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) push(m[1], m[2], m[3]);

    re =
      /data-title="([^"]+)"[^>]*data-img="([^"]+)"[^>]*data-url="[^"]*"[^>]*href="((?:\/\/www\.turkanime\.tv)?\/anime\/[^"]+)"/gi;
    while ((m = re.exec(html))) push(m[3], m[1], m[2]);

    // panel title links
    re =
      /href="((?:\/\/www\.turkanime\.tv)?\/anime\/([^"]+))"[^>]*title="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      let img = "";
      // look nearby for seriler image
      const slug = m[2];
      const imgRe = new RegExp(
        "serilerb?/" +
          "[0-9]+\\.(?:jpg|png|webp)[\\s\\S]{0,80}" +
          slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "|" +
          slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[\\s\\S]{0,300}?((?:imajlar/)?serilerb?/[0-9]+\\.(?:jpg|png|webp))",
        "i"
      );
      const im = html.match(imgRe);
      if (im) {
        img = im[1] || im[0];
        if (img.indexOf("seriler") >= 0 && img.indexOf("imajlar") < 0)
          img = "imajlar/" + img.replace(/^.*?(seriler)/, "$1");
      }
      // data-src near this slug
      const ds = html.match(
        new RegExp(
          'data-(?:src|img)="([^"]*serilerb?/[0-9]+\\.(?:jpg|png|webp))"[\\s\\S]{0,200}' +
            slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        )
      );
      if (ds) img = ds[1];
      const ds2 = html.match(
        new RegExp(
          slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            '[\\s\\S]{0,200}data-(?:src|img)="([^"]*serilerb?/[0-9]+\\.(?:jpg|png|webp))"',
          "i"
        )
      );
      if (ds2) img = ds2[1];
      push(m[1], m[3], img);
    }

    // fill missing posters from known pattern after opening anime is heavy;
    // try global data-img map by order
    if (results.length) {
      const imgs = [];
      const ire =
        /data-(?:src|img)="((?:\/\/www\.turkanime\.tv)?\/?imajlar\/serilerb?\/[0-9]+\.(?:jpg|png|webp))"/gi;
      while ((m = ire.exec(html))) imgs.push(absUrl(m[1]));
      // also seriler without prefix in path
      for (let i = 0; i < results.length; i++) {
        if (results[i].image) continue;
        // guess from slug hash not possible; leave empty or match by index if counts align
      }
    }

    return JSON.stringify(results.slice(0, 25));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    const page = p.slug ? baseUrl + "/anime/" + p.slug : String(url);
    const html = await getText(await soraFetch(page));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);
    let aliases = "N/A";
    const am = html.match(/İngilizce\s*:?\s*([^<\n]{2,100})/i);
    if (am) aliases = decodeEntities(am[1]).trim();
    let airdate = "N/A";
    const ym = html.match(/Başlama Tarihi\s*:?\s*([^<\n]{2,80})/i);
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

async function extractEpisodes(url) {
  try {
    const p = parseHref(url);
    const seriesUrl = p.slug
      ? baseUrl + "/anime/" + p.slug
      : String(url);
    const html = await getText(await soraFetch(seriesUrl));
    let animeId = "";
    const idM =
      html.match(/bolumler&animeId=(\d+)/i) ||
      html.match(/animeId[=:](\d+)/i) ||
      html.match(/imajlar\/serilerb\/(\d+)\./i);
    if (idM) animeId = idM[1];

    const eps = [];
    const seen = {};
    if (animeId) {
      const bolumHtml = await getText(
        await soraFetch(baseUrl + "/ajax/bolumler&animeId=" + animeId, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: seriesUrl,
            "User-Agent": UA,
          },
        })
      );
      const re =
        /href="((?:\/\/www\.turkanime\.tv)?\/video\/([^"]+))"[^>]*title="([^"]+)"/gi;
      let m;
      while ((m = re.exec(bolumHtml))) {
        if (seen[m[2]]) continue;
        seen[m[2]] = true;
        const title = decodeEntities(m[3]);
        const numM =
          title.match(/(\d+)\s*\.?\s*Bölüm/i) ||
          m[2].match(/-(\d+)-bolum/i);
        const num = numM ? parseInt(numM[1], 10) : eps.length + 1;
        eps.push({
          href: absUrl(m[1]),
          number: num,
          title: /\d/.test(title) ? title : num + ". Bölüm",
        });
      }
    }
    eps.sort(function (a, b) {
      return a.number - b.number;
    });
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

async function extractStreamUrl(url) {
  try {
    const p = parseHref(url);
    let epUrl = url;
    if (p.type === "episode" && p.epSlug) {
      epUrl = baseUrl + "/video/" + p.epSlug;
    } else if (p.type === "series" && p.slug) {
      const seriesHtml = await getText(
        await soraFetch(baseUrl + "/anime/" + p.slug)
      );
      const idM =
        seriesHtml.match(/bolumler&animeId=(\d+)/i) ||
        seriesHtml.match(/animeId[=:](\d+)/i);
      if (!idM) return JSON.stringify({ streams: [], subtitles: "" });
      const bolumHtml = await getText(
        await soraFetch(baseUrl + "/ajax/bolumler&animeId=" + idM[1], {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: baseUrl + "/anime/" + p.slug,
          },
        })
      );
      const em = bolumHtml.match(
        /href="((?:\/\/www\.turkanime\.tv)?\/video\/[^"]+)"/i
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

    // collect all embed candidates from every videosec panel
    const embedJobs = [];
    const videosecUrls = collectVideosecUrls(epHtml);

    // also parse any clear embeds on page
    extractEmbedsFromHtml(epHtml).forEach(function (u) {
      embedJobs.push({ url: u, fansub: "" });
    });

    for (let i = 0; i < videosecUrls.length; i++) {
      try {
        const vh = await getText(
          await soraFetch(videosecUrls[i], {
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              Referer: epUrl,
              "User-Agent": UA,
            },
          })
        );
        let fs = "";
        const active = vh.match(
          /btn-danger[^>]*>[\s\S]{0,100}<\/span>\s*([^<]{1,40})</i
        );
        if (active) fs = active[1].trim();
        extractEmbedsFromHtml(vh).forEach(function (u) {
          embedJobs.push({ url: u, fansub: fs });
        });
      } catch (e2) {}
    }

    const streams = [];
    const seen = {};

    for (let i = 0; i < embedJobs.length && streams.length < 10; i++) {
      const job = embedJobs[i];
      const host = labelFromUrl(job.url);
      const resolved = await resolveEmbed(job.url);
      for (let r = 0; r < resolved.length; r++) {
        const media = forceHttps(resolved[r]);
        if (!isHttp(media) || seen[media]) continue;
        // must look like media
        if (!/\.(m3u8|mp4)(\?|$)/i.test(media) && media.indexOf("m3u8") < 0)
          continue;
        seen[media] = true;
        let title = host;
        if (job.fansub) title = job.fansub + " · " + host;
        const headers = {
          "User-Agent": UA,
          Referer: job.url,
          Origin: job.url.replace(/^(https?:\/\/[^/]+).*/, "$1"),
          Accept: "*/*",
        };
        streams.push({
          title: title,
          name: title,
          streamUrl: media,
          headers: headers,
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
