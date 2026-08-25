/**
 * Kinobadi (no.kinobadi.im) – Sora / Luna
 * Search + posters + multi player (Плеер 1 / 2)
 * v1.0.0
 */
const baseUrl = "https://no.kinobadi.im";

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

function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}x\d{1,3}\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\bсезон[а]?\s*\d+\b/gi, " ")
    .replace(/\bTV\s*Show\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function idFromHref(href) {
  const m =
    String(href).match(/poisk-(\d+)/i) ||
    String(href).match(/file-(\d+)/i) ||
    String(href).match(/[?&]id=(\d+)/i);
  return m ? m[1] : "";
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = cleanQuery(keyword);
    if (!q) return JSON.stringify([]);

    const ajax = await getText(
      await soraFetch(
        baseUrl + "/ajax/poisk/poisk.php?id_ok=" + encodeURIComponent(q)
      )
    );

    const results = [];
    const seen = {};
    const re =
      /href=["'](\/film\/poisk-\d+)["'][^>]*>\s*([^<]+)/gi;
    let m;
    while ((m = re.exec(ajax || ""))) {
      const href = absUrl(m[1]);
      if (seen[href]) continue;
      seen[href] = true;
      const title = m[2].replace(/\s+/g, " ").trim();
      if (title.length < 2) continue;
      const id = idFromHref(href);
      results.push({
        title: title,
        image: "",
        href: href,
        _id: id,
      });
      if (results.length >= 25) break;
    }

    // posters from film pages (first 10)
    for (let i = 0; i < Math.min(results.length, 10); i++) {
      try {
        const html = await getText(await soraFetch(results[i].href));
        const im =
          html.match(
            /(?:src|data-src)=["'](\/img_film\/img\.php\?[^"']+)["']/i
          ) ||
          html.match(
            /(?:src|data-src)=["'](https?:\/\/img\.imgilall\.me\/[^"']+)["']/i
          ) ||
          html.match(
            /(?:src|data-src)=["'](https?:\/\/[^"']*610x900[^"']+)["']/i
          );
        if (im) results[i].image = absUrl(im[1]);
      } catch (e) {}
    }

    return JSON.stringify(
      results.map(function (r) {
        return { title: r.title, image: r.image || "", href: r.href };
      })
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(
      await soraFetch(String(url).split("?")[0].split("#")[0])
    );
    let description = "N/A";
    const dm =
      html.match(/name=["']description["']\s+content=["']([^"']+)/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
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

function isSeriesPage(html, title) {
  if (/Тип:<\/td>\s*<td>\s*Сериал/i.test(html)) return true;
  if (/\(сериал\)/i.test(title || "")) return true;
  if (/pleer_serial_on\.php/i.test(html)) return true;
  return false;
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const titleM = html.match(/<title>([^<]+)/i);
    const title = titleM ? titleM[1] : "";

    if (!isSeriesPage(html, title)) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    // try max season from player iframe (often season=N on player 2)
    let maxSeason = 1;
    const sm = html.match(/[?&]season=(\d+)/i);
    if (sm) maxSeason = Math.max(maxSeason, +sm[1]);

    // load serial player page for more season hints
    const id = idFromHref(pageUrl) || idFromHref(html);
    const kp = (html.match(/[?&]kp=(\d+)/) || [])[1] || "";
    let playerHtml = "";
    if (id) {
      const pUrl =
        baseUrl +
        "/hd_pars/pleer_serial_on.php?url&id_file=" +
        id +
        "&kp=" +
        kp +
        "&source=480&pleer=1";
      playerHtml = await getText(
        await soraFetch(pUrl, { headers: { Referer: pageUrl } })
      );
      const sm2 = playerHtml.match(/[?&]season=(\d+)/i);
      if (sm2) maxSeason = Math.max(maxSeason, +sm2[1]);
    }

    // default episode grid: up to maxSeason, 24 eps each (player handles missing)
    const eps = [];
    for (let s = 1; s <= Math.min(maxSeason, 15); s++) {
      for (let e = 1; e <= 24; e++) {
        eps.push({
          href: pageUrl + "?s=" + s + "&e=" + e,
          number: e,
          season: s,
          title: "S" + s + "E" + e,
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

/* ---- streams ---- */

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

async function resolveEmbedStreams(embedUrl, label) {
  const out = [];
  if (!embedUrl || !isHttp(embedUrl)) return out;
  if (/trailer|ortified\.ws\/embed\/trailer/i.test(embedUrl)) return out;

  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          Referer: baseUrl + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html) return out;
    if (/недоступен в вашем регионе|region|410|content not found/i.test(html)) {
      return out;
    }

    // direct m3u8 / mp4 in page
    const media = html.match(
      /https?:\/\/[^"'\s<>]+(?:\.m3u8|\.mp4)[^"'\s<>]*/gi
    );
    if (media) {
      for (let i = 0; i < media.length; i++) {
        out.push({
          title: label + (media.length > 1 ? " · " + (i + 1) : ""),
          streamUrl: media[i].replace(/&amp;/g, "&"),
          headers: { "User-Agent": UA, Referer: embedUrl },
        });
      }
    }

    // file: "..."
    const fileM = html.match(/["']file["']\s*:\s*["']([^"']+)["']/i);
    if (fileM && isHttp(fileM[1])) {
      out.push({
        title: label,
        streamUrl: fileM[1],
        headers: { "User-Agent": UA, Referer: embedUrl },
      });
    }

    // nested iframe
    if (!out.length) {
      const nested = html.match(
        /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i
      );
      if (nested && nested[1] !== embedUrl) {
        return await resolveEmbedStreams(nested[1], label);
      }
    }
  } catch (e) {}
  return out;
}

async function extractStreamUrl(url) {
  try {
    const raw = String(url);
    const pageUrl = raw.split("?")[0].split("#")[0];
    const se = parseSE(raw);

    const html = await getText(await soraFetch(pageUrl));
    const id =
      idFromHref(pageUrl) ||
      (html.match(/id_file=(\d+)/) || [])[1] ||
      (html.match(/file-(\d+)/) || [])[1];
    const kp = (html.match(/[?&]kp=(\d+)/) || html.match(/kp=(\d+)/) || [])[1] || "";

    if (!id) return JSON.stringify({ streams: [], subtitles: "" });

    const isSerial = isSeriesPage(html, "");
    const playerPath = isSerial
      ? "/hd_pars/pleer_serial_on.php"
      : "/hd_pars/pleer_on.php";

    let playerUrl =
      baseUrl +
      playerPath +
      "?url&id_file=" +
      id +
      "&kp=" +
      kp +
      "&source=480&pleer=1";
    if (se.season) playerUrl += "&season=" + se.season;
    if (se.episode) playerUrl += "&episode=" + se.episode;

    const playerHtml = await getText(
      await soraFetch(playerUrl, { headers: { Referer: pageUrl } })
    );

    const embeds = [];
    // named players
    const iframeRe = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let im;
    let idx = 0;
    while ((im = iframeRe.exec(playerHtml || ""))) {
      const src = absUrl(im[1]);
      if (!src) continue;
      if (/trailer|clips\/iframe/i.test(src)) continue;
      idx++;
      embeds.push({
        label: "Плеер " + idx,
        url: src,
      });
    }

    // also raw https embeds
    const rawHttp = (playerHtml || "").match(
      /https?:\/\/(?:api\.femd\.ws|wonder-as\.stloadi\.live|api\.ortified\.ws)[^"'\s<>]+/gi
    );
    if (rawHttp) {
      for (let i = 0; i < rawHttp.length; i++) {
        const u = rawHttp[i];
        if (/trailer/i.test(u)) continue;
        let found = false;
        for (let j = 0; j < embeds.length; j++) {
          if (embeds[j].url === u) found = true;
        }
        if (!found) embeds.push({ label: "Плеер " + (embeds.length + 1), url: u });
      }
    }

    // inject season/episode into femd embeds
    for (let i = 0; i < embeds.length; i++) {
      if (/api\.femd\.ws/i.test(embeds[i].url) && se.season) {
        let u = embeds[i].url;
        u = u.replace(/([?&])season=[^&]*/i, "$1season=" + se.season);
        u = u.replace(/([?&])episode=[^&]*/i, "$1episode=" + (se.episode || 1));
        if (!/[?&]season=/i.test(u)) {
          u += (u.indexOf("?") >= 0 ? "&" : "?") + "season=" + se.season;
        }
        if (!/[?&]episode=/i.test(u)) {
          u += "&episode=" + (se.episode || 1);
        }
        embeds[i].url = u;
      }
      if (/stloadi\.live/i.test(embeds[i].url) && se.season) {
        let u = embeds[i].url;
        u = u.replace(/([?&])season=\d+/i, "$1season=" + se.season);
        if (!/[?&]season=/i.test(u)) {
          u += (u.indexOf("?") >= 0 ? "&" : "?") + "season=" + se.season;
        }
        if (se.episode && !/[?&]episode=/i.test(u)) {
          u += "&episode=" + se.episode;
        }
        embeds[i].url = u;
      }
    }

    const streams = [];
    for (let i = 0; i < embeds.length; i++) {
      const more = await resolveEmbedStreams(embeds[i].url, embeds[i].label);
      for (let j = 0; j < more.length; j++) streams.push(more[j]);
    }

    // if embed didn't yield direct files, still expose labels as last resort is useless for Luna
    // (needs real stream URL)

    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 120);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
