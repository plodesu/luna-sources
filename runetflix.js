/**
 * Runetflix.cc – Sora / Luna
 * Fixed search (grid-item cards) + full HLS qualities for movies & series
 * v1.3.1
 */
const baseUrl = "https://runetflix.cc";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
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
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\bсезон[а]?\s*\d+\b/gi, " ")
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

    variants.push({
      height: resM ? +resM[1] : 0,
      bw: bwM ? +bwM[1] : 0,
      url: url,
    });
  }

  if (variants.length) {
    const byH = {};
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const key = String(v.height || v.bw);
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
      out.push({
        title: (labelPrefix ? labelPrefix + " · " : "") + heightToLabel(v.height),
        streamUrl: v.url,
        headers: headers,
      });
    }
    return out;
  }

  out.push({
    title: (labelPrefix ? labelPrefix + " · " : "") + "Auto",
    streamUrl: hlsUrl,
    headers: headers,
  });
  return out;
}

function extractIds(html) {
  const ids = { cdHId: "", kpId: "", imId: "", pid: "" };
  let m = (html || "").match(/const\s+cdHId\s*=\s*['"]([^'"]+)['"]/);
  if (m) ids.cdHId = m[1];
  m = (html || "").match(/const\s+kpId\s*=\s*['"]([^'"]+)['"]/);
  if (m) ids.kpId = m[1];
  m = (html || "").match(/const\s+imId\s*=\s*['"]([^'"]+)['"]/);
  if (m) ids.imId = m[1];
  m = (html || "").match(/(?:const|var)\s+pid\s*=\s*['"]?(\d+)/);
  if (m) ids.pid = m[1];
  if (!ids.kpId) {
    m = (html || "").match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i);
    if (m) ids.kpId = m[1];
  }
  if (!ids.cdHId) {
    m = (html || "").match(/priceios\.live\/videos\/(\d+)\//i);
    if (m) ids.cdHId = m[1];
  }
  return ids;
}

function playerUrls(ids, season, episode) {
  const list = [];
  const s = season || 1;
  const e = episode || 1;

  if (ids.cdHId) {
    list.push({
      label: "FlixCDN",
      embed:
        "https://tarantino.priceios.live/show/" +
        ids.cdHId +
        "?extrans=1&unfseason=1&extepi=1&season=" +
        s +
        "&episode=" +
        e,
    });
  }
  if (ids.kpId) {
    list.push({
      label: "Domem",
      embed: "https://api.domem.ws/embed/kp/" + ids.kpId,
    });
    list.push({
      label: "UACDN",
      embed: "https://franko.uacdn.online/show/kinopoisk/" + ids.kpId,
    });
  }
  return list;
}

function collectRawFromHtml(html) {
  const urls = [];
  if (!html) return urls;
  if (/недоступен в вашем регионе/i.test(html)) return urls;

  const re = /https?:\/\/[^"'\s<>\\]+(?:\.m3u8|\.mp4)[^"'\s<>\\]*/gi;
  const found = html.match(re);
  if (found) {
    for (let i = 0; i < found.length; i++) {
      let u = found[i].replace(/\\u0026/g, "&").replace(/\\/g, "");
      if (/preview|thumb|poster|sprite/i.test(u)) continue;
      urls.push(u);
    }
  }

  const qm = html.matchAll
    ? html.matchAll(
        /["']?(360|480|720|1080|1440|2160|240)["']?\s*:\s*["'](https?:\/\/[^"']+)["']/gi
      )
    : [];
  try {
    for (const m of qm) {
      urls.push(m[2]);
    }
  } catch (e) {}

  const media = html.match(/["']media["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (media) urls.push(media[1]);
  const video = html.match(/["']video["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (video) urls.push(video[1]);
  const files = html.match(/["']files["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (files) urls.push(files[1]);

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
    const html = await getText(await soraFetch(embedUrl, { headers: headers }));
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

/* ---------------- search ---------------- */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const variants = [cleaned];
    const first = cleaned.split(/\s+/)[0];
    if (first && first.length > 2 && first !== cleaned) variants.push(first);

    const results = [];
    const seen = {};

    for (let v = 0; v < variants.length; v++) {
      const html = await getText(
        await soraFetch(baseUrl + "/index.php?do=search", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            Origin: baseUrl,
            Referer: baseUrl + "/",
            "User-Agent": UA,
          },
          body:
            "do=search&subaction=search&story=" +
            encodeURIComponent(variants[v]),
        })
      );
      if (!html || html.length < 500) continue;

      const parts = html.split(/<article[^>]*class="[^"]*grid-item/i);
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];

        let hm = p.match(
          /href=["'](https?:\/\/runetflix\.cc\/(?:movies|series|cartoon|film)\/[^"']+\.html)["']/i
        );
        if (!hm) {
          hm = p.match(
            /href=["'](https?:\/\/runetflix\.cc\/[^"']+\.html)["']/i
          );
        }
        if (!hm) continue;
        const href = hm[1];
        if (seen[href]) continue;

        let title = "";
        let tm = p.match(/title=["']([^"']+)["']/i);
        if (tm) title = tm[1].replace(/\s+/g, " ").trim();
        if (!title) {
          tm = p.match(/class="[^"]*item-title[^"]*"[^>]*>([^<]+)/i);
          if (tm) title = tm[1].replace(/\s+/g, " ").trim();
        }
        if (!title || title.length < 2) continue;
        if (/поиск|войти|избран|скачать|apk/i.test(title)) continue;

        let image = "";
        let im = p.match(/srcset=["']([^"'\s]+)/i);
        if (im) image = im[1];
        if (!image) {
          im = p.match(
            /(?:src|data-src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
          );
          if (im) image = im[1];
        }

        seen[href] = true;
        results.push({
          title: title,
          image: image || "",
          href: href,
        });
      }

      if (results.length) break;
    }

    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      (html || "").match(
        /name=["']description["']\s+content=["']([^"']+)/i
      ) ||
      (html || "").match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) {
      description = String(dm[1])
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
    }
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
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    const re = /[?&]s=(\d+)[^"'>\s]*[?&]?e=(\d+)|[?&]e=(\d+)[^"'>\s]*[?&]?s=(\d+)/gi;
    let m;
    while ((m = re.exec(html || ""))) {
      let s, e;
      if (m[1] && m[2]) {
        s = +m[1];
        e = +m[2];
      } else {
        e = +m[3];
        s = +m[4];
      }
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
      const key = item.title + "||" + item.streamUrl.slice(0, 120);
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
      const hasHi = streams.some(function (s) {
        return /1080|1440|2160/i.test(s.title);
      });
      if (hasHi || streams.length >= 8) break;
    }

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
