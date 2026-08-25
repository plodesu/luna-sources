/**
 * TürkAnime (turkanime.tv) – Sora / Luna
 * Turkish sub/dub anime
 * Streams: VOE, Doodstream, StreamWish (clear embeds)
 * v1.0.0
 */
const baseUrl = "https://www.turkanime.tv";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
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
    const slug = m[1];
    const em = slug.match(/-(\d+)-bolum$/i) || slug.match(/-(\d+)$/i);
    return {
      type: "episode",
      slug: slug.replace(/-\d+-bolum$/i, "").replace(/-\d+$/i, ""),
      epSlug: slug,
      episode: em ? parseInt(em[1], 10) : 1,
    };
  }
  m = s.match(/\/anime\/([^/?#]+)/i);
  if (m) {
    return { type: "series", slug: m[1], epSlug: "", episode: 0 };
  }
  return { type: "unknown", slug: "", epSlug: "", episode: 0 };
}

function makeSeriesHref(slug) {
  return baseUrl + "/anime/" + slug;
}

function makeEpHref(epSlug) {
  return baseUrl + "/video/" + epSlug;
}

function hostRank(name) {
  const n = String(name || "").toLowerCase();
  if (/voe/.test(n)) return 0;
  if (/streamwish|wish/.test(n)) return 1;
  if (/dood/.test(n)) return 2;
  if (/hdvid/.test(n)) return 3;
  if (/mediacm|mp4upload|sibnet/.test(n)) return 4;
  return 5;
}

function labelFromUrl(u) {
  u = String(u || "").toLowerCase();
  if (/voe\.sx|voe\.video/.test(u)) return "VOE";
  if (/dood\.(watch|to|so|ws|pm|la)/.test(u)) return "Doodstream";
  if (/streamwish|wish\.|swish/.test(u)) return "StreamWish";
  if (/hdvid|hd-vid/.test(u)) return "HDVID";
  if (/mediacm/.test(u)) return "MediaCM";
  if (/mp4upload/.test(u)) return "MP4Upload";
  if (/sibnet/.test(u)) return "Sibnet";
  if (/filemoon|moon/.test(u)) return "Filemoon";
  return "Host";
}

/** Collect external embed URLs from videosec HTML */
function extractEmbeds(html) {
  const out = [];
  if (!html) return out;
  let m;

  // iframe src
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) {
    let u = absUrl(decodeEntities(m[1]));
    if (!u || /turkanime\.tv\/embed/i.test(u)) continue; // skip encrypted native embed
    if (isHttp(u) || u.indexOf("//") === 0) {
      out.push(forceHttps(u.indexOf("//") === 0 ? "https:" + u : u));
    }
  }

  // raw known host patterns
  const hostRe =
    /(https?:)?\/\/(?:[a-z0-9.-]+\.)?(?:voe\.sx|voe\.video|dood\.(?:watch|to|so|ws|pm|la)|streamwish\.|filemoon\.|mp4upload\.|sibnet\.ru|hdvid\.)[^\s"'<>]+/gi;
  while ((m = hostRe.exec(html))) {
    let u = m[0];
    if (u.indexOf("//") === 0) u = "https:" + u;
    out.push(forceHttps(u));
  }

  const seen = {};
  const uniq = [];
  for (let i = 0; i < out.length; i++) {
    const u = out[i].split("#")[0];
    if (seen[u]) continue;
    seen[u] = true;
    uniq.push(u);
  }
  return uniq;
}

/** Parse all videosec AJAX URLs from episode HTML */
function collectVideosecUrls(html) {
  const urls = [];
  if (!html) return urls;
  const re = /ajax\/videosec&b=([^&"'\s]+)&(?:v=([^&"'\s]+)&)?f=([^&"'\s]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    let q = "ajax/videosec&b=" + m[1];
    if (m[2]) q += "&v=" + m[2];
    q += "&f=" + m[3];
    urls.push(baseUrl + "/" + q);
  }
  // also bare videosec without full path
  const re2 = /['"]ajax\/videosec&b=[^'"]+['"]/gi;
  while ((m = re2.exec(html))) {
    const inner = m[0].replace(/['"]/g, "");
    const full = baseUrl + "/" + inner;
    if (urls.indexOf(full) < 0) urls.push(full);
  }
  return urls.slice(0, 12);
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};
    const q = cleaned.toLowerCase();

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]);
      if (!href || seen[href]) return;
      if (!/\/anime\/[^/]+\/?$/.test(href)) return;
      seen[href] = true;
      results.push({
        title: decodeEntities(title || "Anime").replace(/\s+/g, " ").trim(),
        image: absUrl(image || ""),
        href: href.replace(/\/?$/, "/").replace(/\/$/, "") || href,
      });
    }

    // 1) Full list AJAX (filter client-side)
    let html = await getText(
      await soraFetch(baseUrl + "/ajax/tamliste", {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: baseUrl + "/",
          "User-Agent": UA,
        },
      })
    );

    if (html && html.length > 500) {
      const re =
        /href="(\/\/www\.turkanime\.tv\/anime\/[^"]+|\/anime\/[^"]+)"[^>]*title="([^"]+)"/gi;
      let m;
      while ((m = re.exec(html))) {
        const title = decodeEntities(m[2]);
        if (title.toLowerCase().indexOf(q) >= 0) {
          push(m[1], title, "");
        }
        if (results.length >= 25) break;
      }
      // alternate: animeAdi span
      if (results.length < 5) {
        const re2 =
          /href="([^"]*\/anime\/[^"]+)"[\s\S]{0,120}?<span class="animeAdi">([^<]+)</gi;
        while ((m = re2.exec(html))) {
          const title = decodeEntities(m[2]).trim();
          if (title.toLowerCase().indexOf(q) >= 0) push(m[1], title, "");
          if (results.length >= 25) break;
        }
      }
    }

    // 2) Homepage fallback
    if (!results.length) {
      html = await getText(await soraFetch(baseUrl + "/"));
      const re3 =
        /href="([^"]*\/anime\/[^"]+)"[^>]*(?:title|alt)="([^"]+)"/gi;
      let m;
      while ((m = re3.exec(html))) {
        const title = decodeEntities(m[2]);
        if (title.toLowerCase().indexOf(q) >= 0) push(m[1], title, "");
        if (results.length >= 20) break;
      }
    }

    // attach posters where possible (serilerb/{id}.jpg pattern later)
    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const p = parseHref(url);
    let page = url;
    if (p.type === "series" && p.slug) page = makeSeriesHref(p.slug);
    else if (p.type === "episode" && p.slug) page = makeSeriesHref(p.slug);

    const html = await getText(await soraFetch(page));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/Özet[;:]*\s*([^<]{20,400})/i);
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);

    let aliases = "N/A";
    const am = html.match(/İngilizce\s*:?\s*([^<\n]+)/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym = html.match(/Başlama Tarihi\s*:?\s*([^<\n]+)/i);
    if (ym) airdate = decodeEntities(ym[1]).trim();

    return JSON.stringify([
      { description: description || "N/A", aliases: aliases, airdate: airdate },
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
    let animeId = "";

    if (p.type === "series" && p.slug) {
      seriesUrl = makeSeriesHref(p.slug);
    } else if (p.type === "episode" && p.slug) {
      seriesUrl = makeSeriesHref(p.slug);
    }

    const html = await getText(await soraFetch(seriesUrl));
    const idM =
      html.match(/animeId[=:](\d+)/i) ||
      html.match(/bolumler&animeId=(\d+)/i) ||
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
        /href="(\/\/www\.turkanime\.tv\/video\/([^"]+)|\/video\/([^"]+))"[^>]*title="([^"]+)"/gi;
      let m;
      while ((m = re.exec(bolumHtml))) {
        const href = absUrl(m[1]);
        const epSlug = m[2] || m[3];
        if (seen[epSlug]) continue;
        seen[epSlug] = true;
        const title = decodeEntities(m[4] || epSlug);
        const numM = title.match(/(\d+)/) || epSlug.match(/-(\d+)-bolum/i);
        const num = numM ? parseInt(numM[1], 10) : eps.length + 1;
        eps.push({
          href: href,
          number: num,
          title: title.indexOf("Bölüm") >= 0 ? title : num + ". Bölüm",
        });
      }
    }

    // fallback: links on series page
    if (!eps.length) {
      const re2 = /href="([^"]*\/video\/([^"]+))"/gi;
      let m;
      while ((m = re2.exec(html))) {
        if (seen[m[2]]) continue;
        seen[m[2]] = true;
        const numM = m[2].match(/-(\d+)-bolum/i);
        const num = numM ? parseInt(numM[1], 10) : eps.length + 1;
        eps.push({
          href: absUrl(m[1]),
          number: num,
          title: num + ". Bölüm",
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
        title: "1. Bölüm",
      });
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
      epUrl = makeEpHref(p.epSlug);
    } else if (p.type === "series" && p.slug) {
      // first episode
      const seriesHtml = await getText(
        await soraFetch(makeSeriesHref(p.slug))
      );
      const idM = seriesHtml.match(/animeId[=:](\d+)/i);
      if (idM) {
        const bolumHtml = await getText(
          await soraFetch(baseUrl + "/ajax/bolumler&animeId=" + idM[1], {
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              Referer: makeSeriesHref(p.slug),
            },
          })
        );
        const em = bolumHtml.match(/href="([^"]*\/video\/[^"]+)"/i);
        if (em) epUrl = absUrl(em[1]);
        else return JSON.stringify({ streams: [], subtitles: "" });
      }
    }

    const epHtml = await getText(
      await soraFetch(epUrl, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!epHtml || epHtml.length < 500) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const videosecUrls = collectVideosecUrls(epHtml);
    // always include default first panel (already in page sometimes)
    const allEmbeds = [];
    const fansubHint = [];

    // embeds already in initial HTML
    extractEmbeds(epHtml).forEach(function (u) {
      allEmbeds.push({ url: u, fansub: "" });
    });

    // fansub names from buttons
    const fsRe = /<button[^>]*>[\s\S]*?<\/span>\s*([^<]+)<\/button>/gi;
    let fm;
    while ((fm = fsRe.exec(epHtml))) {
      const name = fm[1].trim();
      if (name && name.length < 40 && !/play|fa-/i.test(name)) {
        fansubHint.push(name);
      }
    }

    for (let i = 0; i < videosecUrls.length && i < 10; i++) {
      try {
        const vh = await getText(
          await soraFetch(videosecUrls[i], {
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              Referer: epUrl,
              "User-Agent": UA,
              Accept: "text/html,*/*",
            },
          })
        );
        const embeds = extractEmbeds(vh);
        // try to detect active fansub from this panel
        let fs = "";
        const active = vh.match(
          /btn-danger[^>]*>[\s\S]*?<\/span>\s*([^<]+)</i
        );
        if (active) fs = active[1].trim();
        for (let e = 0; e < embeds.length; e++) {
          allEmbeds.push({ url: embeds[e], fansub: fs });
        }
      } catch (e2) {}
    }

    const headers = {
      "User-Agent": UA,
      Referer: baseUrl + "/",
      Origin: baseUrl,
      Accept: "*/*",
    };

    const streams = [];
    const seen = {};

    for (let i = 0; i < allEmbeds.length; i++) {
      const item = allEmbeds[i];
      let u = forceHttps(item.url);
      if (!isHttp(u) || seen[u]) continue;
      // skip pure encrypted turkanime embed
      if (/turkanime\.tv\/embed\/#\/url\//i.test(u)) continue;
      seen[u] = true;

      const host = labelFromUrl(u);
      let title = host;
      if (item.fansub) title = item.fansub + " · " + host;

      streams.push({
        title: title,
        name: title,
        streamUrl: u,
        headers: headers,
      });
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
