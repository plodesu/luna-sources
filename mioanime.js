/**
 * MioAnime – Sora / Luna (Thai anime, ซับไทย)
 * https://www.mioanime.net
 * v1.0.0
 */
const baseUrl = "https://www.mioanime.net";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.5",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
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

function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  if (u.indexOf("http") !== 0) return baseUrl + "/" + u;
  return u;
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const url = baseUrl + "/?s=" + encodeURIComponent(q);
    const html = await getText(await soraFetch(url));
    if (!html) return JSON.stringify([]);

    const results = [];
    const seen = {};

    // links like /11/ or /130/
    const re =
      /href=["']((?:https?:\/\/[^"']+)?\/(\d+)\/)["'][^>]*>/gi;
    let m;
    const candidates = [];
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const id = m[2];
      if (seen[href]) continue;
      if (id.length > 6) continue; // skip play ids sometimes embedded
      seen[href] = true;
      candidates.push({ href: href, id: id, index: m.index });
    }

    for (let i = 0; i < candidates.length && results.length < 20; i++) {
      const c = candidates[i];
      const slice = html.slice(Math.max(0, c.index - 100), c.index + 500);
      let title = "";
      const tm =
        slice.match(/>([^<]{4,120}(?:ซับไทย|พากย์ไทย|จบ)[^<]*)</i) ||
        slice.match(/alt=["']([^"']+)["']/i) ||
        slice.match(/title=["']([^"']+)["']/i);
      if (tm) title = tm[1].replace(/\s+/g, " ").trim();
      if (!title) {
        // look ahead for text after link
        const after = html.slice(c.index, c.index + 800);
        const tm2 = after.match(
          /\/\d+\/["'][^>]*>[\s\S]{0,40}?([A-Za-z0-9][^<]{5,100})/
        );
        if (tm2) title = tm2[1].replace(/\s+/g, " ").trim();
      }
      if (!title || title.length < 3) continue;
      // filter nav junk
      if (/หน้าแรก|login|category|page\//i.test(title)) continue;

      let image = "";
      const im = slice.match(
        /(?:src|data-src)=["']([^"']+(?:upload|\.jpg|\.png|\.webp)[^"']*)["']/i
      );
      if (im) image = absUrl(im[1]);

      results.push({ title: title, image: image, href: c.href });
    }

    // stronger: block by series card
    if (results.length < 3) {
      const re2 =
        /href=["']((?:https?:\/\/[^"']+)?\/\d+\/)["'][\s\S]{0,300}?>([^<]{5,150})</gi;
      seen = {};
      while ((m = re2.exec(html))) {
        const href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;
        const title = m[2].replace(/\s+/g, " ").trim();
        if (title.length < 4) continue;
        results.push({ title: title, image: "", href: href });
        if (results.length >= 20) break;
      }
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
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/name=["']description["'][^>]*content=["']([^"']+)/i);
    if (dm) {
      description = String(dm[1])
        .replace(/<[^>]+>/g, " ")
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
    const pageUrl = String(url).split("?")[0];
    // already a play page?
    if (/\/play\//i.test(pageUrl)) {
      const n = (pageUrl.match(/ตอนที่-(\d+)/) || pageUrl.match(/ep[_-]?(\d+)/i) || [])[1];
      return JSON.stringify([
        {
          href: pageUrl,
          number: n ? +n : 1,
          season: 1,
          title: n ? "ตอนที่ " + n : "Episode 1",
        },
      ]);
    }

    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    // /play/2845/...ตอนที่-1-...
    const re =
      /href=["']((?:https?:\/\/[^"']+)?\/play\/(\d+)\/[^"']*ตอนที่-(\d+)[^"']*)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const en = +m[3];
      if (seen[en]) continue;
      seen[en] = true;
      eps.push({
        href: href,
        number: en,
        season: 1,
        title: "ตอนที่ " + en,
      });
    }

    // fallback without Thai text
    if (!eps.length) {
      const re2 = /href=["']((?:https?:\/\/[^"']+)?\/play\/(\d+)\/[^"']+)["']/gi;
      let n = 0;
      while ((m = re2.exec(html))) {
        n++;
        const href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;
        const en =
          +(href.match(/ตอนที่-(\d+)/) || href.match(/ep[_-]?(\d+)/i) || [])[1] ||
          n;
        eps.push({
          href: href,
          number: en,
          season: 1,
          title: "ตอนที่ " + en,
        });
      }
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    if (!eps.length) {
      eps.push({
        href: pageUrl,
        number: 1,
        season: 1,
        title: "Episode 1",
      });
    }
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0],
        number: 1,
        season: 1,
        title: "Episode 1",
      },
    ]);
  }
}

/* ---- streams ---- */

function extractHashes(html) {
  const hashes = [];
  const re =
    /(?:player_new|playerv2|player|all_in_one)\/?\?hash=([A-Za-z0-9+/=]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (hashes.indexOf(m[1]) === -1) hashes.push(m[1]);
  }
  // mplayer token
  const re2 =
    /mplayer\.click\/[^"'?\s]+[?&]token=([A-Za-z0-9+/=]+)/gi;
  while ((m = re2.exec(html))) {
    if (hashes.indexOf(m[1]) === -1) hashes.push(m[1]);
  }
  // data-hash / hash: "
  const re3 = /(?:data-hash|hash)\s*[=:]\s*["']([A-Za-z0-9+/=]{20,})["']/gi;
  while ((m = re3.exec(html))) {
    if (hashes.indexOf(m[1]) === -1) hashes.push(m[1]);
  }
  return hashes;
}

function collectMedia(html) {
  const out = [];
  const patterns = [
    /["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi,
    /["']src["']\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi,
    /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/gi,
    /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/gi,
  ];
  for (let p = 0; p < patterns.length; p++) {
    let m;
    const re = patterns[p];
    re.lastIndex = 0;
    while ((m = re.exec(html))) {
      let u = m[1].replace(/[),;]+$/, "");
      if (isHttp(u) && out.indexOf(u) === -1) out.push(u);
    }
  }
  return out;
}

async function resolvePlayer(hash, referer) {
  const streams = [];
  const endpoints = [
    baseUrl + "/player/?hash=" + hash,
    baseUrl + "/player_new/?hash=" + hash,
    baseUrl + "/playerv2/?hash=" + hash,
    "https://www.mplayer.click/driveV4/?token=" + hash,
  ];
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const html = await getText(
        await soraFetch(endpoints[i], {
          headers: {
            Referer: referer || baseUrl + "/",
            Accept: "*/*",
          },
        })
      );
      if (!html || /Access Denied|404/i.test(html.slice(0, 200))) continue;
      const media = collectMedia(html);
      for (let j = 0; j < media.length; j++) {
        streams.push({
          title:
            (media[j].indexOf("m3u8") !== -1 ? "HLS" : "MP4") +
            " · Player " +
            (i + 1),
          streamUrl: media[j],
          headers: {
            "User-Agent": UA,
            Referer: endpoints[i],
          },
        });
      }
      if (streams.length) break;
    } catch (e) {}
  }
  return streams;
}

async function extractStreamUrl(url) {
  try {
    let pageUrl = String(url).split("?")[0];
    // if series page, need first episode – caller should pass play URL
    let html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    // if series list without play, pick first play link
    if (!/\/play\//i.test(pageUrl)) {
      const em = html.match(
        /href=["']((?:https?:\/\/[^"']+)?\/play\/\d+\/[^"']+)["']/i
      );
      if (em) {
        pageUrl = absUrl(em[1]);
        html = await getText(
          await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
        );
      }
    }

    let streams = [];

    // direct media on page
    const direct = collectMedia(html);
    for (let i = 0; i < direct.length; i++) {
      streams.push({
        title: direct[i].indexOf("m3u8") !== -1 ? "HLS" : "MP4",
        streamUrl: direct[i],
        headers: { "User-Agent": UA, Referer: pageUrl },
      });
    }

    // hash → player endpoints
    const hashes = extractHashes(html);
    for (let i = 0; i < Math.min(hashes.length, 3); i++) {
      const more = await resolvePlayer(hashes[i], pageUrl);
      for (let j = 0; j < more.length; j++) streams.push(more[j]);
      if (streams.length) break;
    }

    // iframes
    if (!streams.length) {
      const ifr = /<iframe[^>]+src=["']([^"']+)["']/gi;
      let m;
      while ((m = ifr.exec(html))) {
        const iu = absUrl(m[1]);
        if (!isHttp(iu)) continue;
        try {
          const ih = await getText(
            await soraFetch(iu, { headers: { Referer: pageUrl } })
          );
          const media = collectMedia(ih);
          for (let j = 0; j < media.length; j++) {
            streams.push({
              title: "Iframe",
              streamUrl: media[j],
              headers: { "User-Agent": UA, Referer: iu },
            });
          }
        } catch (e) {}
      }
    }

    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 140);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
