/**
 * MioAnime – Sora / Luna
 * Thai sub (ซับไทย) – prefer Server 4 (IOS)
 * v1.1.0
 */
const baseUrl = "https://www.mioanime.net";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
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

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, " ")
    .trim();
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);
    const qn = norm(q);

    const html = await getText(
      await soraFetch(baseUrl + "/?s=" + encodeURIComponent(q))
    );
    if (!html || /just a moment|cf-browser|verify you are human/i.test(html)) {
      return JSON.stringify([]);
    }

    const results = [];
    const seen = {};

    // series cards: /123/
    const re = /href=["']((?:https?:\/\/[^"']+)?\/(\d+)\/)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const id = m[2];
      if (seen[href]) continue;
      if (id.length > 5) continue;
      seen[href] = true;

      const slice = html.slice(Math.max(0, m.index - 80), m.index + 600);
      let title = "";
      const tm =
        slice.match(
          />([^<]{3,140}?(?:ซับไทย|พากย์ไทย|จบ|Season|ตอน)[^<]*)</i
        ) ||
        slice.match(/alt=["']([^"']{3,120})["']/i) ||
        slice.match(/title=["']([^"']{3,120})["']/i);
      if (tm) title = tm[1].replace(/\s+/g, " ").trim();
      if (!title || title.length < 3) continue;
      if (/หน้าแรก|login|category|แฟนเพจ|ดูตอน/i.test(title)) continue;

      // soft relevance: skip if query has latin letters and title has zero overlap
      const tn = norm(title);
      const qParts = qn.split(" ").filter(function (x) {
        return x.length > 2;
      });
      if (qParts.length && /[a-z]/.test(qn)) {
        let hit = 0;
        for (let i = 0; i < qParts.length; i++) {
          if (tn.indexOf(qParts[i]) !== -1) hit++;
        }
        if (hit === 0 && qParts.length >= 2) continue;
      }

      let image = "";
      const im = slice.match(
        /(?:src|data-src)=["']([^"']*\/upload\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
      );
      if (im) image = absUrl(im[1]);

      results.push({ title: title, image: image, href: href });
      if (results.length >= 20) break;
    }

    // fill missing posters from series page (top 8)
    for (let i = 0; i < Math.min(results.length, 8); i++) {
      if (results[i].image) continue;
      try {
        const ph = await getText(await soraFetch(results[i].href));
        const og =
          ph.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
          ph.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
          ph.match(/\/upload\/[a-f0-9]+\.(?:jpg|png|webp)/i);
        if (og) results[i].image = absUrl(og[1] || og[0]);
      } catch (e) {}
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(String(url).split("?")[0]));
    let description = "N/A";
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/name=["']description["'][^>]*content=["']([^"']+)/i);
    if (dm) {
      description = String(dm[1])
        .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
        .replace(/&amp;/g, "&")
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
    if (/\/play\//i.test(pageUrl)) {
      const n = (pageUrl.match(/ตอนที่-(\d+)/) || [])[1];
      return JSON.stringify([
        {
          href: pageUrl,
          number: n ? +n : 1,
          season: 1,
          title: n ? "ตอนที่ " + n : "EP 1",
        },
      ]);
    }

    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};
    const re =
      /href=["']((?:https?:\/\/[^"']+)?\/play\/(\d+)\/[^"']*?ตอนที่-(\d+)[^"']*)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const en = +m[3];
      if (seen[en]) continue;
      seen[en] = true;
      eps.push({
        href: absUrl(m[1]),
        number: en,
        season: 1,
        title: "ตอนที่ " + en,
      });
    }
    if (!eps.length) {
      const re2 = /href=["']((?:https?:\/\/[^"']+)?\/play\/\d+\/[^"']+)["']/gi;
      let n = 0;
      while ((m = re2.exec(html))) {
        n++;
        const href = absUrl(m[1]);
        const en = +(href.match(/ตอนที่-(\d+)/) || [])[1] || n;
        if (seen[en]) continue;
        seen[en] = true;
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
      eps.push({ href: pageUrl, number: 1, season: 1, title: "EP 1" });
    }
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      { href: String(url).split("?")[0], number: 1, season: 1, title: "EP 1" },
    ]);
  }
}

/* ---- streams: prefer Server 4 (IOS) ---- */

function collectMedia(html) {
  const out = [];
  const regs = [
    /["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi,
    /["']src["']\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    /sources?\s*:\s*\[[^\]]*file\s*:\s*["'](https?:\/\/[^"']+)["']/gi,
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi,
    /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/gi,
  ];
  for (let r = 0; r < regs.length; r++) {
    let m;
    const re = regs[r];
    re.lastIndex = 0;
    while ((m = re.exec(html))) {
      let u = m[1].replace(/[),;]+$/, "");
      if (isHttp(u) && out.indexOf(u) === -1) out.push(u);
    }
  }
  return out;
}

function extractServerEntries(html) {
  // onclick / data for Server N and IOS
  const list = [];
  const re =
    /(Server\s*4\s*\(?\s*IOS\s*\)?|Server\s*[1-4]|สำรอง|Main\s*Player)[\s\S]{0,200}?(?:hash|token|src|url|file)\s*[=:]\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    list.push({ label: m[1].replace(/\s+/g, " ").trim(), value: m[2] });
  }
  // generic hashes
  const re2 =
    /(?:player_new|playerv2|player)\/?\?hash=([A-Za-z0-9+/=]+)/gi;
  while ((m = re2.exec(html))) {
    list.push({ label: "hash", value: m[1] });
  }
  const re3 =
    /mplayer\.click\/[^"'?\s]*[?&]token=([A-Za-z0-9+/=]+)/gi;
  while ((m = re3.exec(html))) {
    list.push({ label: "mplayer", value: m[1] });
  }
  const re4 = /(?:data-hash|hash)\s*[=:]\s*["']([A-Za-z0-9+/=]{16,})["']/gi;
  while ((m = re4.exec(html))) {
    list.push({ label: "data-hash", value: m[1] });
  }
  return list;
}

function preferIOS(entries) {
  const ios = [];
  const rest = [];
  for (let i = 0; i < entries.length; i++) {
    if (/ios|server\s*4/i.test(entries[i].label)) ios.push(entries[i]);
    else rest.push(entries[i]);
  }
  return ios.concat(rest);
}

async function resolveHash(hash, referer, label) {
  const streams = [];
  const endpoints = [
    baseUrl + "/player/?hash=" + encodeURIComponent(hash),
    baseUrl + "/player_new/?hash=" + encodeURIComponent(hash),
    baseUrl + "/playerv2/?hash=" + encodeURIComponent(hash),
    "https://www.mplayer.click/driveV4/?token=" + encodeURIComponent(hash),
  ];
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const html = await getText(
        await soraFetch(endpoints[i], {
          headers: {
            Referer: referer || baseUrl + "/",
            Accept: "*/*",
            Origin: baseUrl,
          },
        })
      );
      if (!html || /access denied|just a moment/i.test(html.slice(0, 300)))
        continue;
      const media = collectMedia(html);
      for (let j = 0; j < media.length; j++) {
        streams.push({
          title:
            (label || "Server") +
            " · " +
            (media[j].indexOf("m3u8") !== -1 ? "HLS" : "MP4"),
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
    let html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

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

    // direct
    const direct = collectMedia(html);
    for (let i = 0; i < direct.length; i++) {
      streams.push({
        title: "Direct",
        streamUrl: direct[i],
        headers: { "User-Agent": UA, Referer: pageUrl },
      });
    }

    // servers – IOS first
    const entries = preferIOS(extractServerEntries(html));
    const tried = {};
    for (let i = 0; i < entries.length && streams.length < 8; i++) {
      const e = entries[i];
      // full URL already?
      if (isHttp(e.value) && /\.(m3u8|mp4)/i.test(e.value)) {
        streams.push({
          title: e.label || "Server",
          streamUrl: e.value,
          headers: { "User-Agent": UA, Referer: pageUrl },
        });
        continue;
      }
      if (tried[e.value]) continue;
      tried[e.value] = true;
      const more = await resolveHash(e.value, pageUrl, e.label);
      for (let j = 0; j < more.length; j++) streams.push(more[j]);
    }

    // iframes last
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
