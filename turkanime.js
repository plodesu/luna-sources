/**
 * TürkAnime (turkanime.tv) – Sora / Luna
 * Search: /arama?arama=KEYWORD
 * Episodes: ajax/bolumler
 * Streams: VOE / Doodstream / StreamWish embeds (clear hosts)
 * v1.0.1
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
    const epSlug = m[1];
    const em = epSlug.match(/-(\d+)-bolum$/i);
    let seriesSlug = epSlug.replace(/-\d+-bolum$/i, "");
    return {
      type: "episode",
      slug: seriesSlug,
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
  if (/voe/.test(n)) return 0;
  if (/streamwish|wish/.test(n)) return 1;
  if (/dood/.test(n)) return 2;
  if (/hdvid/.test(n)) return 3;
  if (/mediacm|mp4upload|sibnet|filemoon/.test(n)) return 4;
  return 5;
}

function labelFromUrl(u) {
  u = String(u || "").toLowerCase();
  if (/voe\.sx|voe\.video/.test(u)) return "VOE";
  if (/dood\.(watch|to|so|ws|pm|la|li)/.test(u)) return "Doodstream";
  if (/streamwish|wish\.|swishvideo/.test(u)) return "StreamWish";
  if (/hdvid|hd-vid/.test(u)) return "HDVID";
  if (/mediacm/.test(u)) return "MediaCM";
  if (/mp4upload/.test(u)) return "MP4Upload";
  if (/sibnet/.test(u)) return "Sibnet";
  if (/filemoon|moonplayer/.test(u)) return "Filemoon";
  return "Host";
}

function extractEmbeds(html) {
  const out = [];
  if (!html) return out;
  let m;

  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) {
    let u = absUrl(decodeEntities(m[1]));
    if (!u) continue;
    if (/turkanime\.tv\/embed/i.test(u)) continue;
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (isHttp(u)) out.push(forceHttps(u));
  }

  const hostRe =
    /(https?:)?\/\/(?:[a-z0-9.-]+\.)?(?:voe\.sx|voe\.video|dood\.(?:watch|to|so|ws|pm|la|li)|streamwish\.|swishvideo\.|filemoon\.|mp4upload\.|sibnet\.ru|hdvid\.)[^\s"'<>\\]+/gi;
  while ((m = hostRe.exec(html))) {
    let u = m[0];
    if (u.indexOf("//") === 0) u = "https:" + u;
    out.push(forceHttps(u.replace(/\\+$/g, "")));
  }

  const seen = {};
  const uniq = [];
  for (let i = 0; i < out.length; i++) {
    const u = out[i].split("#")[0];
    if (seen[u] || !isHttp(u)) continue;
    seen[u] = true;
    uniq.push(u);
  }
  return uniq;
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
  return urls.slice(0, 14);
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(String(href || "").split("?")[0]);
      if (!href || seen[href]) return;
      if (!/\/anime\/[^/]+\/?$/.test(href.replace(/\/$/, ""))) return;
      href = href.replace(/\/$/, "");
      seen[href] = true;
      let t = decodeEntities(title || "Anime")
        .replace(/\s+izle\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      results.push({
        title: t,
        image: absUrl(image || ""),
        href: href,
      });
    }

    // PRIMARY: official search page
    const searchUrl =
      baseUrl + "/arama?arama=" + encodeURIComponent(cleaned);
    let html = await getText(
      await soraFetch(searchUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          "Accept-Language": "tr-TR,tr;q=0.9",
          Referer: baseUrl + "/",
        },
      })
    );

    if (html && html.length > 2000 && !/404 Bulunamadı/i.test(html)) {
      // title= links
      let re =
        /href="((?:\/\/www\.turkanime\.tv)?\/anime\/[^"]+)"[^>]*title="([^"]+)"/gi;
      let m;
      while ((m = re.exec(html))) {
        push(m[1], m[2], "");
      }
      // any /anime/ link near text
      re =
        /href="((?:\/\/www\.turkanime\.tv)?\/anime\/[^"]+)"/gi;
      while ((m = re.exec(html))) {
        const slug = m[1].split("/anime/")[1] || "";
        if (!slug || seen[absUrl(m[1].replace(/\/$/, ""))]) continue;
        const nice = slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, function (c) {
            return c.toUpperCase();
          });
        push(m[1], nice, "");
      }
      // posters: serilerb near link
      for (let i = 0; i < results.length; i++) {
        const slug = results[i].href.split("/anime/")[1];
        if (!slug) continue;
        const imgRe = new RegExp(
          "anime/" +
            slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "[\\s\\S]{0,400}?serilerb/([0-9]+)\\.(jpg|png|webp)",
          "i"
        );
        const im = html.match(imgRe);
        if (im) {
          results[i].image =
            baseUrl + "/imajlar/serilerb/" + im[1] + "." + im[2];
        }
      }
    }

    // FALLBACK: tamliste (airing list) + word match
    if (!results.length) {
      html = await getText(
        await soraFetch(baseUrl + "/ajax/tamliste", {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: baseUrl + "/",
            "User-Agent": UA,
          },
        })
      );
      if (html && html.length > 500) {
        const q = cleaned.toLowerCase();
        const words = q.split(/\s+/).filter(function (w) {
          return w.length > 2;
        });
        const re =
          /href="((?:\/\/www\.turkanime\.tv)?\/anime\/[^"]+)"[^>]*title="([^"]+)"/gi;
        let m;
        while ((m = re.exec(html))) {
          const title = decodeEntities(m[2]).toLowerCase();
          let ok = title.indexOf(q) >= 0;
          if (!ok && words.length) {
            ok = words.every(function (w) {
              return title.indexOf(w) >= 0;
            });
          }
          if (ok) push(m[1], m[2], "");
          if (results.length >= 25) break;
        }
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
    let page = url;
    if (p.slug) page = baseUrl + "/anime/" + p.slug;

    const html = await getText(await soraFetch(page));
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) description = decodeEntities(dm[1]).slice(0, 900);
    else {
      const om = html.match(/Özet[;:\s]*([^<]{30,500})/i);
      if (om) description = decodeEntities(om[1]).slice(0, 900);
    }

    let aliases = "N/A";
    const am = html.match(/İngilizce\s*:?\s*([^<\n]{2,80})/i);
    if (am) aliases = decodeEntities(am[1]).trim();

    let airdate = "N/A";
    const ym = html.match(/Başlama Tarihi\s*:?\s*([^<\n]{2,60})/i);
    if (ym) airdate = decodeEntities(ym[1]).trim();

    return JSON.stringify([
      {
        description: description || "N/A",
        aliases: aliases,
        airdate: airdate,
      },
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
        const epSlug = m[2];
        if (seen[epSlug]) continue;
        seen[epSlug] = true;
        const title = decodeEntities(m[3] || epSlug);
        const numM =
          title.match(/(\d+)\s*\.?\s*Bölüm/i) ||
          epSlug.match(/-(\d+)-bolum/i) ||
          title.match(/(\d+)/);
        const num = numM ? parseInt(numM[1], 10) : eps.length + 1;
        eps.push({
          href: absUrl(m[1]),
          number: num,
          title: /\d/.test(title) ? title : num + ". Bölüm",
        });
      }
    }

    if (!eps.length) {
      const re2 = /href="((?:\/\/www\.turkanime\.tv)?\/video\/([^"]+))"/gi;
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

    const allEmbeds = [];
    extractEmbeds(epHtml).forEach(function (u) {
      allEmbeds.push({ url: u, fansub: "" });
    });

    const videosecUrls = collectVideosecUrls(epHtml);
    for (let i = 0; i < videosecUrls.length; i++) {
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
        let fs = "";
        const active = vh.match(
          /btn-danger[^>]*>[\s\S]{0,80}<\/span>\s*([^<]{1,40})</i
        );
        if (active) fs = active[1].trim();
        extractEmbeds(vh).forEach(function (u) {
          allEmbeds.push({ url: u, fansub: fs });
        });
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
      let u = forceHttps(allEmbeds[i].url);
      if (!isHttp(u) || seen[u]) continue;
      if (/turkanime\.tv\/embed/i.test(u)) continue;
      seen[u] = true;
      const host = labelFromUrl(u);
      let title = host;
      if (allEmbeds[i].fansub) title = allEmbeds[i].fansub + " · " + host;
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
