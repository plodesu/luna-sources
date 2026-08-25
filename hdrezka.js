/**
 * HDRezka.film – Sora / Luna
 * Site-specific (not classic rezka.ag API)
 * v2.0.0
 */
const baseUrl = "https://hdrezka.film";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
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

async function getJson(res) {
  const t = await getText(res);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
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

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const url =
      baseUrl +
      "/search/?do=search&subaction=search&q=" +
      encodeURIComponent(q);
    const html = await getText(await soraFetch(url));
    if (!html) return JSON.stringify([]);

    const results = [];
    const seen = {};

    // hdrezka.film: <div class="search-result"> <h3><a href="...">Title</a></h3>
    const re =
      /<div[^>]*class=["'][^"']*search-result[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>[\s\S]*?(?:<p>([^<]*)<\/p>)?/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      if (seen[href]) continue;
      if (!/\/(filmy|serialy|multfilmy|multserial|anime)\//i.test(href)) continue;
      seen[href] = true;
      const title = m[2].trim();
      const info = (m[3] || "").trim();
      results.push({
        title: info ? title + " (" + info.split(",")[0].trim() + ")" : title,
        image: "",
        href: href,
      });
      if (results.length >= 20) break;
    }

    // fallback link pattern
    if (!results.length) {
      const re2 =
        /href=["']((?:https?:\/\/[^"']+)?\/(?:filmy|serialy|multfilmy|multserial)\/\d+-[^"']+\.html)["'][^>]*>([^<]{2,80})</gi;
      while ((m = re2.exec(html))) {
        const href = absUrl(m[1]);
        if (seen[href]) continue;
        seen[href] = true;
        results.push({ title: m[2].trim(), image: "", href: href });
        if (results.length >= 20) break;
      }
    }

    // fill posters from detail pages (top 10)
    for (let i = 0; i < Math.min(results.length, 10); i++) {
      try {
        const ph = await getText(
          await soraFetch(results[i].href, {
            headers: { Referer: baseUrl + "/" },
          })
        );
        const og =
          ph.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
          ph.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
          ph.match(
            /<img[^>]+(?:class=["'][^"']*poster[^"']*["'][^>]+src|src=["']([^"']+)["'][^>]+class=["'][^"']*poster)/i
          ) ||
          ph.match(
            /<img[^>]+src=["']([^"']+(?:poster|cover|upload)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
          );
        if (og) {
          results[i].image = absUrl(og[1] || og[0]);
          if (!isHttp(results[i].image) && og[1]) {
            results[i].image = absUrl(og[1]);
          }
        }
        // better: first large image near title
        if (!results[i].image) {
          const im = ph.match(
            /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*(?:width|height|alt)=/i
          );
          if (im) results[i].image = absUrl(im[1]);
        }
      } catch (e) {}
    }

    return JSON.stringify(results);
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
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\//i);
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
    const isSeries = /\/(serialy|multserial)\//i.test(pageUrl);
    if (!isSeries) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    const re =
      /data-(?:season|s)=["']?(\d+)["']?[^>]*data-(?:episode|e)=["']?(\d+)["']?/gi;
    let m;
    while ((m = re.exec(html))) {
      const sn = +m[1];
      const en = +m[2];
      const k = sn + "-" + en;
      if (seen[k]) continue;
      seen[k] = true;
      eps.push({
        href: pageUrl + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }

    // links like ?season=1&episode=2
    if (!eps.length) {
      const re2 = /[?&](?:season|s)=(\d+)[^"']*[?&](?:episode|e)=(\d+)/gi;
      while ((m = re2.exec(html))) {
        const sn = +m[1];
        const en = +m[2];
        const k = sn + "-" + en;
        if (seen[k]) continue;
        seen[k] = true;
        eps.push({
          href: pageUrl + "?s=" + sn + "&e=" + en,
          number: en,
          season: sn,
          title: "S" + sn + "E" + en,
        });
      }
    }

    if (!eps.length) {
      eps.push({
        href: pageUrl + "?s=1&e=1",
        number: 1,
        season: 1,
        title: "S1E1",
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

/* ---- streams: iframes + file/pl + classic rezka ajax fallback ---- */

function collectIframes(html) {
  const out = [];
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = absUrl(m[1]);
    if (isHttp(u) && out.indexOf(u) === -1) out.push(u);
  }
  // data-src players
  const re2 = /data-(?:src|url|file)=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = re2.exec(html))) {
    if (out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  return out;
}

function collectDirect(html) {
  const out = [];
  const re =
    /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1].replace(/[),;]+$/, "");
    if (out.indexOf(u) === -1) out.push(u);
  }
  // playerjs file:"..."
  const re2 = /file\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = re2.exec(html))) {
    if (out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  return out;
}

async function resolveIframe(iframeUrl) {
  const streams = [];
  try {
    const html = await getText(
      await soraFetch(iframeUrl, {
        headers: { Referer: baseUrl + "/", Accept: "*/*" },
      })
    );
    if (!html) return streams;
    const directs = collectDirect(html);
    for (let i = 0; i < directs.length; i++) {
      streams.push({
        title: "Player · " + (directs[i].indexOf("m3u8") !== -1 ? "HLS" : "MP4"),
        streamUrl: directs[i],
        headers: { "User-Agent": UA, Referer: iframeUrl },
      });
    }
    // nested iframe
    const nested = collectIframes(html);
    for (let i = 0; i < Math.min(nested.length, 3); i++) {
      if (nested[i] === iframeUrl) continue;
      const more = await resolveIframe(nested[i]);
      for (let j = 0; j < more.length; j++) streams.push(more[j]);
    }
  } catch (e) {}
  return streams;
}

async function tryClassicCdn(pageUrl, html) {
  const streams = [];
  try {
    let id = null;
    let tr = null;
    const init = html.match(
      /sof\.tv\.initCDN(?:Movies|Series)Events\s*\(\s*(\d+)\s*,\s*(\d+)/i
    );
    if (init) {
      id = init[1];
      tr = init[2];
    }
    if (!id) {
      const m = pageUrl.match(/\/(\d+)-/);
      if (m) id = m[1];
    }
    if (!id) return streams;

    const translators = [];
    const re = /data-translator_id=["'](\d+)["'][^>]*>([\s\S]*?)<\//gi;
    let m;
    while ((m = re.exec(html))) {
      translators.push({
        id: m[1],
        name: String(m[2])
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
    if (!translators.length && tr) {
      translators.push({ id: tr, name: "Default" });
    }
    if (!translators.length) return streams;

    const isSeries = /\/(serialy|multserial)\//i.test(pageUrl);
    const se = parseSE(pageUrl);

    for (let i = 0; i < Math.min(translators.length, 5); i++) {
      const t = translators[i];
      const params = new URLSearchParams();
      params.append("id", id);
      params.append("translator_id", t.id);
      params.append("favs", "abcdef12");
      if (isSeries) {
        params.append("season", String(se.season || 1));
        params.append("episode", String(se.episode || 1));
        params.append("action", "get_stream");
      } else {
        params.append("action", "get_movie");
      }
      try {
        const data = await getJson(
          await soraFetch(baseUrl + "/ajax/get_cdn_series/", {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              Referer: pageUrl,
              Origin: baseUrl,
            },
            body: params.toString(),
          })
        );
        if (data && data.url) {
          let urlField = String(data.url);
          // light clearTrash
          if (urlField.indexOf("//_//") !== -1 || urlField.indexOf("#h") === 0) {
            urlField = urlField.replace("#h", "").split("//_//").join("");
            try {
              while (urlField.length % 4) urlField += "=";
              urlField = atob(urlField);
            } catch (e) {}
          }
          const parts = urlField.split(",");
          for (let j = 0; j < parts.length; j++) {
            const pm = parts[j].match(/\[([^\]]+)\]\s*(https?:\/\/\S+)/i);
            if (pm) {
              streams.push({
                title: pm[1].replace(/<[^>]+>/g, "") + " · " + (t.name || "CDN"),
                streamUrl: pm[2],
                headers: { "User-Agent": UA, Referer: baseUrl + "/" },
              });
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return streams;
}

async function extractStreamUrl(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    const html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html || html.length < 200) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    let streams = [];

    // 1) direct links on page
    const directs = collectDirect(html);
    for (let i = 0; i < directs.length; i++) {
      streams.push({
        title: "Direct · " + (directs[i].indexOf("m3u8") !== -1 ? "HLS" : "MP4"),
        streamUrl: directs[i],
        headers: { "User-Agent": UA, Referer: pageUrl },
      });
    }

    // 2) iframes
    const iframes = collectIframes(html);
    for (let i = 0; i < Math.min(iframes.length, 5); i++) {
      const more = await resolveIframe(iframes[i]);
      for (let j = 0; j < more.length; j++) streams.push(more[j]);
    }

    // 3) classic rezka CDN if present
    if (!streams.length) {
      const cdn = await tryClassicCdn(pageUrl, html);
      for (let i = 0; i < cdn.length; i++) streams.push(cdn[i]);
    }

    // dedupe
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 140);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 15), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
