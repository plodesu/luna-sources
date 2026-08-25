/**
 * ZonaFilm.ru – Sora / Luna
 * API: /api/getSearch + /api/getStream
 * v1.0.0
 */
const baseUrl = "https://zonafilm.ru";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9",
      Accept: "application/json, text/html, */*",
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

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const data = await getJson(
      await soraFetch(
        baseUrl +
          "/api/getSearch?query=" +
          encodeURIComponent(q) +
          "&limit=20",
        { headers: { Accept: "application/json" } }
      )
    );
    if (!data || !data.data || !data.data.length) return JSON.stringify([]);

    const results = [];
    for (let i = 0; i < data.data.length; i++) {
      const it = data.data[i];
      if (!it.slug) continue;
      if (it.is_abused) continue;
      const isSeries = it.type === "series" || it.type === "tvseries";
      const href =
        baseUrl +
        (isSeries ? "/tvseries/" : "/movies/") +
        it.slug;
      const title =
        (it.title || it.title_original || "") +
        (it.year ? " (" + it.year + ")" : "");
      results.push({
        title: title,
        image: it.cover_url || "",
        href: href,
      });
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
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    if (dm) {
      description = String(dm[1])
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
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

    // already episode
    const em = pageUrl.match(/\/season-(\d+)\/episode-(\d+)/i);
    if (em) {
      return JSON.stringify([
        {
          href: pageUrl,
          number: +em[2],
          season: +em[1],
          title: "S" + em[1] + "E" + em[2],
        },
      ]);
    }

    // movie
    if (/\/movies\//i.test(pageUrl)) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};
    const re = /\/season-(\d+)\/episode-(\d+)/gi;
    let m;
    while ((m = re.exec(html))) {
      const sn = +m[1];
      const en = +m[2];
      const k = sn + "-" + en;
      if (seen[k]) continue;
      seen[k] = true;
      const base = pageUrl.replace(/\/$/, "");
      eps.push({
        href: base + "/season-" + sn + "/episode-" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }
    eps.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });
    if (!eps.length) {
      eps.push({
        href: pageUrl,
        number: 1,
        season: 1,
        title: "Смотреть",
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

function extractMediaId(html) {
  // frame path: imgX.zonafilm.ru/2806/2806476/
  const m = html.match(
    /(?:img\d*\.zonafilm\.ru|img-vibio\.imgzona\.video)\/(\d+)\/(\d+)\//i
  );
  if (m) return m[2];
  // vibio path
  const m2 = html.match(/vibio\.tv\/[a-f0-9]+\/(\d+)\/(\d+)\//i);
  if (m2) return m2[2];
  return null;
}

async function fetchStream(mediaId) {
  const streams = [];
  try {
    const data = await getJson(
      await soraFetch(baseUrl + "/api/getStream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: baseUrl,
          Referer: baseUrl + "/",
        },
        body: JSON.stringify({ mediaId: +mediaId, time: 0 }),
      })
    );
    if (!data || data.error) return streams;

    const order = [
      ["mqHlsUrl", "MQ HLS"],
      ["lqHlsUrl", "LQ HLS"],
      ["url", "HD MP4"],
      ["mqUrl", "MQ MP4"],
      ["lqUrl", "LQ MP4"],
    ];
    for (let i = 0; i < order.length; i++) {
      const key = order[i][0];
      const label = order[i][1];
      if (data[key] && isHttp(data[key])) {
        streams.push({
          title: label,
          streamUrl: data[key],
          headers: {
            "User-Agent": UA,
            Referer: baseUrl + "/",
          },
        });
      }
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
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });

    const mediaId = extractMediaId(html);
    if (!mediaId) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const streams = await fetchStream(mediaId);
    return JSON.stringify({ streams: streams, subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
