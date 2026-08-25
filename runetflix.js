/**
 * Runetflix.cc – Sora / Luna
 * Full HLS quality ladder (360–1080+) for movies AND series
 * v1.3.0
 */
const baseUrl = "https://runetflix.cc";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9",
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

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (isHttp(u)) return u;
  if (u.charAt(0) === "/") {
    const m = String(base || baseUrl).match(/^(https?:\/\/[^/]+)/i);
    return (m ? m[1] : baseUrl) + u;
  }
  const dir = String(base || baseUrl).replace(/[^/]+$/, "");
  return dir + u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : 1, episode: e ? +e : 1 };
}

function heightToLabel(h) {
  h = +h || 0;
  if (h >= 2160) return "2160p";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 480) return "480p";
  if (h >= 360) return "360p";
  if (h >= 240) return "240p";
  return h ? h + "p" : "Auto";
}

/**
 * Expand master OR media m3u8 into quality list.
 * - Master: every #EXT-X-STREAM-INF variant (360…1080+)
 * - Media-only (series bug): still return that stream as one quality
 * - Never caps at 720
 */
async function expandHlsQualities(hlsUrl, labelPrefix, headers) {
  const out = [];
  if (!isHttp(hlsUrl)) return out;

  let text = "";
  try {
    text = await getText(
      await soraFetch(hlsUrl, {
        headers: Object.assign(
          {
            "User-Agent": UA,
            Accept: "application/vnd.apple.mpegurl,*/*",
            Referer: baseUrl + "/",
          },
          headers || {}
        ),
      })
    );
  } catch (e) {
    return out;
  }
  if (!text || text.indexOf("#EXT") !== 0) {
    // not a playlist – still offer raw url
    out.push({
      title: (labelPrefix ? labelPrefix + " · " : "") + "Stream",
      streamUrl: hlsUrl,
      headers: headers,
    });
    return out;
  }

  const lines = text.split(/\r?\n/);
  const variants = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^#EXT-X-STREAM-INF:/i.test(line)) continue;

    const resM = line.match(/RESOLUTION=\d+x(\d+)/i);
    const bwM = line.match(/BANDWIDTH=(\d+)/i);
    let next = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] && lines[j].charAt(0) !== "#") {
        next = lines[j].trim();
        break;
      }
    }
    if (!next) continue;
    const url = absUrl(next, hlsUrl);
    if (!isHttp(url)) continue;

    const height = resM ? +resM[1] : 0;
    const bw = bwM ? +bwM[1] : 0;
    variants.push({ height: height, bw: bw, url: url });
  }

  // Master with variants → one stream per quality (no 720 cap)
  if (variants.length) {
    // unique by height (keep highest bandwidth)
    const byH = {};
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const key = v.height || v.bw;
      if (!byH[key] || v.bw > byH[key].bw) byH[key] = v;
    }
    const list = Object.keys(byH).map(function (k) {
      return byH[k];
    });
    list.sort(function (a, b) {
      return (b.height || b.bw) - (a.height || a.bw);
    });

    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const q = heightToLabel(v.height);
      out.push({
        title: (labelPrefix ? labelPrefix + " · " : "") + q,
        streamUrl: v.url,
        headers: headers,
      });
    }
    return out;
  }

  // Media playlist only (single quality – common on series episode links)
  // Offer master URL as Auto so player can still ABR if CDN redirects,
  // plus label inferred from EXT-X-STREAM or default
  out.push({
    title: (labelPrefix ? labelPrefix + " · " : "") + "Auto",
    streamUrl: hlsUrl,
    headers: headers,
  });
  return out;
}

/* ---- ids from page ---- */

function extractIds(html) {
  const ids = { cdHId: "", kpId: "", imId: "", pid: "" };
  let m = (html || "").match(/const\s+cdHId\s*=\s*['"]([^'"]+)['"]/);
  if (m) ids.cdHId = m[1];
  m = (html || "").match(/const\s+kpId\s*=\s*['"]([^'"]+)['"]/);
  if (m) ids.kpId = m[1];
  m = (html || "").match(/const\s+imId\s*=\s*['"]([^'"]+)['"]/);
  if (m) ids.imId = m[1];
  m = (html || "").match(/const\s+pid\s*=\s*['"]?(\d+)/);
  if (m) ids.pid = m[1];
  if (!ids.kpId) {
    m = (html || "").match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i);
    if (m) ids.kpId = m[1];
  }
  return ids;
}

function playerUrls(ids, season, episode) {
  const list = [];
  const se =
    (season ? "&season=" + season : "") +
    (episode ? "&episode=" + episode : "");

  // Primary FlixCDN / Priceios
  if (ids.cdHId) {
    list.push({
      label: "FlixCDN",
      embed:
        "https://tarantino.priceios.live/show/" +
        ids.cdHId +
        "?extrans=1&unfseason=1&extepi=1&season=" +
        (season || 1) +
        "&episode=" +
        (episode || 1),
    });
  }
  // Domem / Alloha-style
  if (ids.kpId) {
    list.push({
      label: "Domem",
      embed: "https://api.domem.ws/embed/kp/" + ids.kpId,
    });
  }
  // UA CDN
  if (ids.kpId) {
    list.push({
      label: "UACDN",
      embed: "https://franko.uacdn.online/show/kinopoisk/" + ids.kpId,
    });
  }
  return list;
}

/** Pull every m3u8/mp4 from player HTML + common JSON shapes */
function collectRawFromHtml(html) {
  const urls = [];
  if (!html) return urls;
  if (/недоступен в вашем регионе|captcha_required\":true/i.test(html)) {
    return urls;
  }

  const re = /https?:\/\/[^"'\s<>\\]+(?:\.m3u8|\.mp4)[^"'\s<>\\]*/gi;
  const found = html.match(re);
  if (found) {
    for (let i = 0; i < found.length; i++) {
      let u = found[i].replace(/\\u0026/g, "&").replace(/\\/g, "");
      if (/preview|thumb|poster|sprite/i.test(u)) continue;
      urls.push(u);
    }
  }

  // files / quality maps: "1080":"https://...m3u8"
  const qm = html.matchAll(
    /["']?(360|480|720|1080|1440|2160|240)["']?\s*:\s*["'](https?:\/\/[^"']+)["']/gi
  );
  for (const m of qm) {
    urls.push(m[2]);
  }

  // PLAYER_PAYLOAD / media field
  const media = html.match(/["']media["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (media) urls.push(media[1]);
  const video = html.match(/["']video["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (video) urls.push(video[1]);
  const files = html.match(/["']files["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (files) urls.push(files[1]);

  // dedupe
  const seen = {};
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    if (seen[urls[i]]) continue;
    seen[urls[i]] = true;
    out.push(urls[i]);
  }
  return out;
}

async function resolveEmbed(embedUrl, label) {
  const headers = {
    "User-Agent": UA,
    Referer: baseUrl + "/",
    Origin: baseUrl,
  };
  try {
    const html = await getText(
      await soraFetch(embedUrl, { headers: headers })
    );
    const raw = collectRawFromHtml(html);
    const streams = [];

    for (let i = 0; i < raw.length; i++) {
      const u = raw[i];
      if (/\.m3u8/i.test(u)) {
        const q = await expandHlsQualities(u, label, headers);
        for (let j = 0; j < q.length; j++) streams.push(q[j]);
      } else if (/\.mp4/i.test(u)) {
        streams.push({
          title: label + " · MP4",
          streamUrl: u,
          headers: headers,
        });
      }
    }
    return streams;
  } catch (e) {
    return [];
  }
}

/* ---- search / details / episodes ---- */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const html = await getText(
      await soraFetch(baseUrl + "/index.php?do=search", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Origin: baseUrl,
          Referer: baseUrl + "/",
        },
        body:
          "do=search&subaction=search&story=" + encodeURIComponent(cleaned),
      })
    );
    const results = [];
    const seen = {};
    const re =
      /<a[^>]+href=["'](https?:\/\/runetflix\.cc\/[^"']+\.html)["'][^>]*>\s*([^<]{2,120})/gi;
    let m;
    while ((m = re.exec(html || ""))) {
      const href = m[1];
      const title = m[2].replace(/\s+/g, " ").trim();
      if (seen[href] || title.length < 2) continue;
      if (/поиск|search|войти|избран/i.test(title)) continue;
      seen[href] = true;
      results.push({ title: title, image: "", href: href });
    }
    // posters
    for (let i = 0; i < results.length; i++) {
      const im = (html || "").match(
        new RegExp(
          results[i].href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "[\\s\\S]{0,400}?(?:src|data-src)=[\"']([^\"']+\\.(?:jpg|jpeg|png|webp)[^\"']*)[\"']",
          "i"
        )
      );
      if (im) results[i].image = absUrl(im[1], baseUrl);
    }
    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm = (html || "").match(
      /name=["']description["']\s+content=["']([^"']+)/i
    );
    if (dm) {
      description = dm[1].replace(/\s+/g, " ").trim().slice(0, 900);
    }
    return JSON.stringify([
      { description: description, aliases: "N/A", airdate: "N/A" },
    ]);
  } catch (e) {
    return JSON.stringify([
      { description: "N/A", aliases: "N/A", airdate: "N/A" },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    // series episode buttons if any
    const re = /[?&]s=(\d+)[^"'>\s]*e=(\d+)/gi;
    let m;
    const seen = {};
    while ((m = re.exec(html || ""))) {
      const s = +m[1];
      const e = +m[2];
      const key = s + "-" + e;
      if (seen[key]) continue;
      seen[key] = true;
      eps.push({
        href: pageUrl + "?s=" + s + "&e=" + e,
        number: e,
        season: s,
        title: "S" + s + "E" + e,
      });
    }
    if (!eps.length) {
      eps.push({
        href: pageUrl,
        number: 1,
        season: 1,
        title: "Смотреть",
      });
    }
    eps.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0],
        number: 1,
        season: 1,
        title: "Смотреть",
      },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const raw = String(url);
    const pageUrl = raw.split("?")[0].split("#")[0];
    const se = parseSE(raw);
    const html = await getText(await soraFetch(pageUrl));
    const ids = extractIds(html);
    const players = playerUrls(ids, se.season, se.episode);

    const streams = [];
    const seen = {};

    function add(item) {
      if (!item || !isHttp(item.streamUrl)) return;
      const key = item.title + "||" + item.streamUrl.slice(0, 100);
      if (seen[key]) return;
      seen[key] = true;
      streams.push({
        title: item.title,
        name: item.title,
        streamUrl: item.streamUrl,
        headers: item.headers || {
          "User-Agent": UA,
          Referer: baseUrl + "/",
        },
      });
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const got = await resolveEmbed(p.embed, p.label);
      for (let j = 0; j < got.length; j++) add(got[j]);
      // stop early if we already have multiple qualities
      const has1080 = streams.some(function (s) {
        return /1080|1440|2160/i.test(s.title);
      });
      if (has1080 || streams.length >= 6) break;
    }

    // Sort: higher quality first
    streams.sort(function (a, b) {
      const ha = +(String(a.title).match(/(\d{3,4})p/) || [0, 0])[1];
      const hb = +(String(b.title).match(/(\d{3,4})p/) || [0, 0])[1];
      return hb - ha;
    });

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
