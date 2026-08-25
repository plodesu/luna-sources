/**
 * TürkAnime (turkanime.tv) – Sora / Luna
 * Search + posters OK
 * Streams: SIBNET (primary), Mail.ru, clear VOE/Dood/Filemoon
 * v1.0.3
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
    .replace(/&amp;/g, "&");
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
  if (/mail\.ru|mailru/.test(n)) return 1;
  if (/ok\.ru|odnoklassniki/.test(n)) return 2;
  if (/voe/.test(n)) return 3;
  if (/dood/.test(n)) return 4;
  if (/filemoon|moon/.test(n)) return 5;
  return 6;
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

function findMediaUrls(text) {
  const out = [];
  if (!text) return out;
  let m;
  const re = /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)[^"'\\\s<>]*/gi;
  while ((m = re.exec(text))) {
    out.push(
      m[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\+$/g, "")
    );
  }
  return out;
}

/** SIBNET: shell.php?videoid= → mp4 */
async function resolveSibnet(embedUrl) {
  try {
    let u = forceHttps(embedUrl);
    if (u.indexOf("//") === 0) u = "https:" + u;
    const html = await getText(
      await soraFetch(u, {
        headers: {
          Referer: baseUrl + "/",
          "User-Agent": UA,
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html) return [];
    const found = [];
    // src: "/v/....mp4" or full url
    let m =
      html.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/["']file["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/i);
    if (m) {
      let src = m[1];
      if (src.indexOf("//") === 0) src = "https:" + src;
      else if (src.charAt(0) === "/") src = "https://video.sibnet.ru" + src;
      found.push(src);
    }
    // player.src([{src:"...
    m = html.match(/player\.src\(\s*\[\s*\{\s*src:\s*["']([^"']+)["']/i);
    if (m) {
      let src = m[1];
      if (src.indexOf("//") === 0) src = "https:" + src;
      else if (src.charAt(0) === "/") src = "https://video.sibnet.ru" + src;
      found.push(src);
    }
    findMediaUrls(html).forEach(function (x) {
      found.push(x);
    });
    // path-only /v/xxx.mp4
    const paths = html.match(/\/v\/[0-9]+\/[^"'\\\s]+\.mp4/gi) || [];
    for (let i = 0; i < paths.length; i++) {
      found.push("https://video.sibnet.ru" + paths[i]);
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

/** Mail.ru embed */
async function resolveMailru(embedUrl) {
  try {
    let u = forceHttps(embedUrl);
    if (u.indexOf("//") === 0) u = "https:" + u;
    const html = await getText(
      await soraFetch(u, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    if (!html) return [];
    const found = findMediaUrls(html);
    const m =
      html.match(/["']metadataUrl["']\s*:\s*["']([^"']+)["']/i) ||
      html.match(/videoSrc\s*=\s*["']([^"']+)["']/i);
    if (m) {
      let meta = m[1];
      if (meta.indexOf("//") === 0) meta = "https:" + meta;
      const metaTxt = await getText(
        await soraFetch(meta, {
          headers: { Referer: u, "User-Agent": UA },
        })
      );
      findMediaUrls(metaTxt).forEach(function (x) {
        found.push(x);
      });
      try {
        const j = JSON.parse(metaTxt);
        if (j && j.videos) {
          for (let i = 0; i < j.videos.length; i++) {
            if (j.videos[i].url) found.push(j.videos[i].url);
          }
        }
      } catch (e2) {}
    }
    return dedupeUrls(found);
  } catch (e) {
    return [];
  }
}

/** Generic clear host (VOE/Dood/Filemoon patterns) */
async function resolveGeneric(embedUrl) {
  try {
    let u = forceHttps(embedUrl);
    if (u.indexOf("//") === 0) u = "https:" + u;
    const html = await getText(
      await soraFetch(u, {
        headers: { Referer: baseUrl + "/", "User-Agent": UA },
      })
    );
    return dedupeUrls(findMediaUrls(html));
  } catch (e) {
    return [];
  }
}

async function resolveEmbed(embedUrl, playerName) {
  const u = String(embedUrl || "");
  const n = String(playerName || "").toLowerCase();
  if (/sibnet/i.test(u) || /sibnet/i.test(n)) return resolveSibnet(u);
  if (/mail\.ru/i.test(u) || /mail/i.test(n)) return resolveMailru(u);
  if (/voe\.|dood\.|filemoon|streamwish|media\.cm/i.test(u))
    return resolveGeneric(u);
  // skip encrypted turkanime embed for now
  if (/turkanime\.tv\/embed/i.test(u)) return [];
  return resolveGeneric(u);
}

/**
 * Collect {playerName, videosecUrl} pairs and iframe embeds from a videosec HTML
 */
function parseVideosecPanel(html) {
  const players = [];
  if (!html) return players;
  // button with fa-play → name, onclick videosec
  const re =
    /IndexIcerik\('(ajax\/videosec[^']+)'[^>]*>[\s\S]{0,120}?<span class="fa fa-play[^"]*"><\/span>\s*([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    players.push({
      name: m[2].trim(),
      videosec: baseUrl + "/" + m[1],
    });
  }
  // alternate order: name then we already have from fa-play lines
  if (!players.length) {
    const re2 =
      /<span class="fa fa-play[^"]*"><\/span>\s*([^<]+)/gi;
    const names = [];
    while ((m = re2.exec(html))) names.push(m[1].trim());
    const re3 = /IndexIcerik\('(ajax\/videosec[^']+)'/gi;
    const urls = [];
    while ((m = re3.exec(html))) urls.push(baseUrl + "/" + m[1]);
    // map by order is unreliable; still push urls with generic name
    for (let i = 0; i < urls.length; i++) {
      players.push({
        name: names[i] || "Host",
        videosec: urls[i],
      });
    }
  }
  return players;
}

function extractClearIframes(html) {
  const out = [];
  if (!html) return out;
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = absUrl(decodeEntities(m[1]));
    if (!u) continue;
    if (/turkanime\.tv\/embed/i.test(u)) continue; // encrypted
    out.push(forceHttps(u.indexOf("//") === 0 ? "https:" + u.replace(/^\/\//, "//") : u));
  }
  return dedupeUrls(out);
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
      if (!href || seen[href] || !/\/anime\/[^/]+$/.test(href)) return;
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
    const html = await getText(
      await soraFetch(
        baseUrl + "/arama?arama=" + encodeURIComponent(cleaned),
        {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,*/*",
            Referer: baseUrl + "/",
          },
        }
      )
    );
    if (!html || html.length < 1000) return JSON.stringify([]);

    let re =
      /href="((?:\/\/www\.turkanime\.tv)?\/anime\/[^"]+)"[^>]*class="top-airing-item"[^>]*data-title="([^"]+)"[^>]*data-img="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) push(m[1], m[2], m[3]);

    re =
      /href="((?:\/\/www\.turkanime\.tv)?\/anime\/([^"]+))"[^>]*title="([^"]+)"/gi;
    while ((m = re.exec(html))) {
      let img = "";
      const slug = m[2];
      const ds = html.match(
        new RegExp(
          'data-(?:src|img)="([^"]*serilerb?/[0-9]+\\.(?:jpg|png|webp))"[\\s\\S]{0,250}' +
            slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        )
      );
      const ds2 = html.match(
        new RegExp(
          slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            '[\\s\\S]{0,250}data-(?:src|img)="([^"]*serilerb?/[0-9]+\\.(?:jpg|png|webp))"',
          "i"
        )
      );
      if (ds) img = ds[1];
      if (ds2) img = ds2[1];
      push(m[1], m[3], img);
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

    // 1) First videosec load (default fansub panel) — has player buttons
    const firstVs = epHtml.match(
      /ajax\/videosec&b=[^&"'\s]+(?:&v=[^&"'\s]+)?&f=[^&"'\s]+/
    );
    let panelHtml = "";
    if (firstVs) {
      panelHtml = await getText(
        await soraFetch(baseUrl + "/" + firstVs[0], {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: epUrl,
            "User-Agent": UA,
          },
        })
      );
    }
    if (!panelHtml) panelHtml = epHtml;

    // 2) Collect player list (SIBNET, VOE, MAIL, ...)
    const players = parseVideosecPanel(panelHtml);

    // Prefer order: SIBNET, MAIL, OK.RU, VOE, others
    players.sort(function (a, b) {
      return hostRank(a.name) - hostRank(b.name);
    });

    const streams = [];
    const seen = {};
    const maxPlayers = Math.min(players.length, 10);

    for (let i = 0; i < maxPlayers && streams.length < 8; i++) {
      const pl = players[i];
      try {
        const vh = await getText(
          await soraFetch(pl.videosec, {
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              Referer: epUrl,
              "User-Agent": UA,
            },
          })
        );
        const iframes = extractClearIframes(vh);
        // also check player name even if iframe list empty
        for (let j = 0; j < iframes.length; j++) {
          const resolved = await resolveEmbed(iframes[j], pl.name);
          for (let r = 0; r < resolved.length; r++) {
            const media = forceHttps(resolved[r]);
            if (!isHttp(media) || seen[media]) continue;
            if (
              !/\.(m3u8|mp4)(\?|$)/i.test(media) &&
              media.indexOf(".mp4") < 0 &&
              media.indexOf("m3u8") < 0
            )
              continue;
            seen[media] = true;
            const title = pl.name || "Stream";
            streams.push({
              title: title,
              name: title,
              streamUrl: media,
              headers: {
                "User-Agent": UA,
                Referer: /sibnet/i.test(media)
                  ? "https://video.sibnet.ru/"
                  : baseUrl + "/",
                Accept: "*/*",
              },
            });
          }
        }
      } catch (e2) {}
    }

    // 3) Fallback: any clear iframe already on first panel
    if (!streams.length) {
      const iframes = extractClearIframes(panelHtml);
      for (let j = 0; j < iframes.length; j++) {
        const resolved = await resolveEmbed(iframes[j], "");
        for (let r = 0; r < resolved.length; r++) {
          const media = forceHttps(resolved[r]);
          if (!isHttp(media) || seen[media]) continue;
          if (!/\.(m3u8|mp4)/i.test(media)) continue;
          seen[media] = true;
          streams.push({
            title: "Stream",
            streamUrl: media,
            headers: {
              "User-Agent": UA,
              Referer: baseUrl + "/",
              Accept: "*/*",
            },
          });
        }
      }
    }

    streams.sort(function (a, b) {
      return hostRank(a.title) - hostRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 8),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
