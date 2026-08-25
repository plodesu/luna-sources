/**
 * Runetflix.cc – Sora / Luna
 * Search + Domem/FlixCDN streams
 * Qualities: 1080p / 720p / 480p only (deduped, with audio)
 * v1.3.2
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
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  return "";
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
  return ids;
}

function playerUrls(ids, season, episode) {
  const list = [];
  const s = season || 1;
  const e = episode || 1;

  if (ids.kpId) {
    list.push({
      label: "Domem",
      embed: "https://api.domem.ws/embed/kp/" + ids.kpId,
    });
  }
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

  const qm = html.matchAll(
    /["']?(360|480|720|1080|1440|2160|240)["']?\s*:\s*["'](https?:\/\/[^"']+)["']/gi
  );
  for (const m of qm) {
    urls.push(m[2]);
  }

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

/**
 * One master → unique 1080 / 720 / 480 with audio when possible
 */
async function expandHlsQualities(hlsUrl, labelPrefix, headers) {
  const out = [];
  if (!isHttp(hlsUrl)) return out;

  const hdr = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/vnd.apple.mpegurl,*/*",
      Referer: baseUrl + "/",
    },
    headers || {}
  );

  let text = "";
  try {
    text = await getText(await soraFetch(hlsUrl, { headers: hdr }));
  } catch (e) {
    return out;
  }

  if (!text || text.indexOf("#EXT") !== 0) {
    out.push({
      title: (labelPrefix ? labelPrefix + " · " : "") + "Auto",
      streamUrl: hlsUrl,
      headers: hdr,
    });
    return out;
  }

  const lines = text.split(/\r?\n/);
  const byQuality = {};
  const hasAudioGroups = /#EXT-X-MEDIA:[^\n]*TYPE=AUDIO/i.test(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^#EXT-X-STREAM-INF:/i.test(line)) continue;

    const resM = line.match(/RESOLUTION=\d+x(\d+)/i);
    const bwM = line.match(/BANDWIDTH=(\d+)/i);
    const codecs = ((line.match(/CODECS="([^"]+)"/i) || [])[1] || "").toLowerCase();
    const hasAudio =
      /mp4a|aac|opus|ac-3|ec-3/.test(codecs) || /AUDIO=/i.test(line);

    let next = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] && lines[j].charAt(0) !== "#") {
        next = lines[j].trim();
        break;
      }
    }
    if (!next) continue;

    const height = resM ? +resM[1] : 0;
    const label = heightToLabel(height);
    if (!label) continue;

    let url = absUrl(next, hlsUrl);
    if (!isHttp(url)) continue;

    // Video-only child + separate audio in master → keep master (sound works)
    if (!hasAudio && hasAudioGroups) {
      url = hlsUrl;
    }

    const score = (hasAudio ? 1000 : 0) + (bwM ? +bwM[1] / 1000 : 0);
    if (!byQuality[label] || score > byQuality[label].score) {
      byQuality[label] = { url: url, score: score };
    }
  }

  const order = ["1080p", "720p", "480p"];
  for (let i = 0; i < order.length; i++) {
    const q = order[i];
    if (!byQuality[q]) continue;
    out.push({
      title: (labelPrefix ? labelPrefix + " · " : "") + q,
      streamUrl: byQuality[q].url,
      headers: hdr,
    });
  }

  if (!out.length) {
    out.push({
      title: (labelPrefix ? labelPrefix + " · " : "") + "Auto",
      streamUrl: hlsUrl,
      headers: hdr,
    });
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

    // One master m3u8 only → no duplicate 720p rows
    let master = "";
    for (let i = 0; i < raw.length; i++) {
      if (/\.m3u8/i.test(raw[i])) {
        master = raw[i];
        break;
      }
    }
    if (!master) {
      for (let i = 0; i < raw.length; i++) {
        if (/\.mp4/i.test(raw[i])) {
          return [
            {
              title: label + " · MP4",
              streamUrl: raw[i],
              headers: headers,
            },
          ];
        }
      }
      return [];
    }
    return await expandHlsQualities(master, label, headers);
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
        if (/поиск|войти|избран|скачать/i.test(title)) continue;

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
    const seen = {};
    const re = /[?&]s=(\d+)[^"'>\s]*e=(\d+)/gi;
    let m;
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
    const seenTitle = {};

    function add(item) {
      if (!item || !isHttp(item.streamUrl)) return;
      const t = String(item.title || "").trim();
      if (!t || seenTitle[t]) return;
      seenTitle[t] = true;
      streams.push({
        title: t,
        name: t,
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

      const has720 = !!seenTitle[p.label + " · 720p"];
      const has480 = !!seenTitle[p.label + " · 480p"];
      const has1080 = !!seenTitle[p.label + " · 1080p"];
      if (has1080 || (has720 && has480)) break;
    }

    const rank = { "1080p": 3, "720p": 2, "480p": 1, Auto: 0 };
    streams.sort(function (a, b) {
      const qa = (a.title.match(/(1080|720|480)p|Auto/) || [])[0] || "";
      const qb = (b.title.match(/(1080|720|480)p|Auto/) || [])[0] || "";
      return (rank[qb] || 0) - (rank[qa] || 0);
    });

    return JSON.stringify({
      streams: streams.slice(0, 6),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
