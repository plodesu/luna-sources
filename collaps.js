/**
 * Collaps (RU) – Sora / Luna
 * TMDB search + posters · Collaps HLS streams
 * v1.0.0
 */
const TMDB_KEY = "9801b6b0548ad57581d111ea690c85c8";
const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const KP_KEY = "4093458a-1bb8-4176-8be3-08c585710656";
const KP_API = "https://kinopoiskapiunofficial.tech/api";
const COLLAPS = "https://api.delivembd.ws/embed/";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
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

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function isRuAudio(names) {
  if (!names || !names.length) return true;
  const s = names.join(" ").toLowerCase();
  if (/eng|english|original|оригинал|укр|ukr|ua\b/.test(s) && !/рус|rus|russian|дуб/.test(s))
    return false;
  return true;
}

/* ---------- search (TMDB ru) ---------- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const url =
      TMDB +
      "/search/multi?api_key=" +
      TMDB_KEY +
      "&language=ru-RU&include_adult=false&query=" +
      encodeURIComponent(q);

    const data = await getJson(await soraFetch(url));
    if (!data || !data.results) return JSON.stringify([]);

    const out = [];
    const seen = {};

    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      const media = r.media_type;
      if (media !== "movie" && media !== "tv") continue;

      const title =
        r.title ||
        r.name ||
        r.original_title ||
        r.original_name ||
        "";
      if (!title) continue;

      const year = ((r.release_date || r.first_air_date || "") + "").slice(0, 4);
      const label = year ? title + " (" + year + ")" : title;
      const href = media + "/" + r.id;
      if (seen[href]) continue;
      seen[href] = true;

      out.push({
        title: label,
        image: r.poster_path ? TMDB_IMG + r.poster_path : "",
        href: href,
      });
      if (out.length >= 20) break;
    }

    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const m = String(url).match(/(movie|tv)\/(\d+)/);
    if (!m) {
      return JSON.stringify([
        { description: "N/A", aliases: "N/A", airdate: "N/A" },
      ]);
    }
    const type = m[1];
    const id = m[2];
    const data = await getJson(
      await soraFetch(
        TMDB +
          "/" +
          type +
          "/" +
          id +
          "?api_key=" +
          TMDB_KEY +
          "&language=ru-RU"
      )
    );
    const description = (data && (data.overview || data.tagline)) || "N/A";
    const airdate =
      (data && (data.release_date || data.first_air_date)) || "N/A";
    return JSON.stringify([
      {
        description: String(description).slice(0, 900),
        aliases: "N/A",
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
    const m = String(url).match(/(movie|tv)\/(\d+)/);
    if (!m) {
      return JSON.stringify([
        { href: String(url), number: 1, season: 1, title: "Смотреть" },
      ]);
    }
    const type = m[1];
    const id = m[2];

    if (type === "movie") {
      return JSON.stringify([
        {
          href: "movie/" + id,
          number: 1,
          season: 1,
          title: "Смотреть",
        },
      ]);
    }

    const data = await getJson(
      await soraFetch(
        TMDB +
          "/tv/" +
          id +
          "?api_key=" +
          TMDB_KEY +
          "&language=ru-RU"
      )
    );
    const seasons = (data && data.seasons) || [];
    const eps = [];

    for (let i = 0; i < seasons.length; i++) {
      const sn = seasons[i].season_number;
      if (sn < 1) continue;
      const count = seasons[i].episode_count || 0;
      const max = Math.min(count, 60);
      for (let e = 1; e <= max; e++) {
        eps.push({
          href: "tv/" + id + "?s=" + sn + "&e=" + e,
          number: e,
          season: sn,
          title: "S" + sn + "E" + e,
        });
      }
    }

    if (!eps.length) {
      eps.push({
        href: "tv/" + id + "?s=1&e=1",
        number: 1,
        season: 1,
        title: "S1E1",
      });
    }

    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0] + "?s=1&e=1",
        number: 1,
        season: 1,
        title: "S1E1",
      },
    ]);
  }
}

/* ---------- KP id resolve ---------- */

async function tmdbExternal(type, id) {
  try {
    return await getJson(
      await soraFetch(
        TMDB +
          "/" +
          type +
          "/" +
          id +
          "/external_ids?api_key=" +
          TMDB_KEY
      )
    );
  } catch (e) {
    return null;
  }
}

async function kpIdFromImdb(imdbId) {
  if (!imdbId) return null;
  try {
    const data = await getJson(
      await soraFetch(
        KP_API + "/v2.2/films?imdbId=" + encodeURIComponent(imdbId),
        { headers: { "X-API-KEY": KP_KEY } }
      )
    );
    if (data && data.items && data.items[0] && data.items[0].kinopoiskId) {
      return data.items[0].kinopoiskId;
    }
    if (data && data.kinopoiskId) return data.kinopoiskId;
  } catch (e) {}
  return null;
}

async function kpIdFromKeyword(title, year) {
  try {
    const data = await getJson(
      await soraFetch(
        KP_API +
          "/v2.1/films/search-by-keyword?keyword=" +
          encodeURIComponent(title) +
          "&page=1",
        { headers: { "X-API-KEY": KP_KEY } }
      )
    );
    const films = (data && (data.films || data.items)) || [];
    if (!films.length) return null;
    if (year) {
      for (let i = 0; i < films.length; i++) {
        const y = String(films[i].year || films[i].startYear || "");
        if (y.indexOf(String(year)) !== -1) {
          return films[i].filmId || films[i].kinopoiskId;
        }
      }
    }
    return films[0].filmId || films[0].kinopoiskId || null;
  } catch (e) {
    return null;
  }
}

async function resolveKinopoiskId(type, tmdbId) {
  const ext = await tmdbExternal(type, tmdbId);
  const imdb = ext && ext.imdb_id;

  let kp = await kpIdFromImdb(imdb);
  if (kp) return kp;

  const details = await getJson(
    await soraFetch(
      TMDB +
        "/" +
        type +
        "/" +
        tmdbId +
        "?api_key=" +
        TMDB_KEY +
        "&language=ru-RU"
    )
  );
  const title =
    (details && (details.title || details.name)) ||
    (details && (details.original_title || details.original_name)) ||
    "";
  const year = (
    (details && (details.release_date || details.first_air_date)) ||
    ""
  ).slice(0, 4);

  kp = await kpIdFromKeyword(title, year);
  return kp;
}

/* ---------- Collaps parse ---------- */

function parseCollaps(html) {
  if (!html) return null;
  const cleaned = String(html).replace(/\n/g, " ");
  const find = cleaned.match(/makePlayer\s*\(\s*\{([\s\S]*?)\}\s*\)\s*;/);
  if (!find) return null;
  try {
    return eval("({" + find[1] + "})");
  } catch (e) {
    return null;
  }
}

async function fetchCollaps(kpId) {
  if (!kpId) return null;
  const url = COLLAPS + "kp/" + kpId;
  const html = await getText(
    await soraFetch(url, {
      headers: {
        Referer: "https://api.delivembd.ws/",
        "User-Agent": UA,
      },
    })
  );
  return parseCollaps(html);
}

function streamsFromCollaps(extract, season, episode) {
  const streams = [];
  if (!extract) return streams;

  if (extract.playlist && extract.playlist.seasons) {
    const seasons = extract.playlist.seasons;
    for (let i = 0; i < seasons.length; i++) {
      const sn = seasons[i].season || i + 1;
      if (season && +sn !== +season) continue;
      const eps = seasons[i].episodes || [];
      for (let j = 0; j < eps.length; j++) {
        const ep = eps[j];
        const en = ep.episode || j + 1;
        if (episode && +en !== +episode) continue;
        const hls = ep.hls;
        if (!hls || !isHttp(hls)) continue;
        const names = (ep.audio && ep.audio.names) || [];
        if (!isRuAudio(names)) continue;
        const voice = names.slice(0, 3).join(", ") || "RU";
        streams.push({
          title: "S" + sn + "E" + en + " · " + voice,
          streamUrl: hls,
          headers: {
            "User-Agent": UA,
            Referer: "https://api.delivembd.ws/",
          },
        });
      }
    }
  } else if (extract.source && extract.source.hls) {
    const hls = extract.source.hls;
    if (isHttp(hls)) {
      const names = (extract.source.audio && extract.source.audio.names) || [];
      if (isRuAudio(names)) {
        const voice = names.slice(0, 3).join(", ") || "RU";
        const q = extract.qualityByWidth
          ? Object.keys(extract.qualityByWidth).pop()
          : "";
        streams.push({
          title: (q ? q + "p · " : "") + voice,
          streamUrl: hls,
          headers: {
            "User-Agent": UA,
            Referer: "https://api.delivembd.ws/",
          },
        });
      }
    }
  }

  return streams;
}

async function extractStreamUrl(url) {
  try {
    const m = String(url).match(/(movie|tv)\/(\d+)/);
    if (!m) return JSON.stringify({ streams: [], subtitles: "" });

    const type = m[1];
    const tmdbId = m[2];
    const se = parseSE(url);
    const season = se.season || 1;
    const episode = se.episode || 1;

    const kpId = await resolveKinopoiskId(type, tmdbId);
    if (!kpId) return JSON.stringify({ streams: [], subtitles: "" });

    const extract = await fetchCollaps(kpId);
    let streams = streamsFromCollaps(
      extract,
      type === "tv" ? season : null,
      type === "tv" ? episode : null
    );

    // if series filter empty, try without strict filter once
    if (!streams.length && type === "tv" && extract) {
      streams = streamsFromCollaps(extract, null, null).filter(function (s) {
        return (
          s.title.indexOf("S" + season + "E" + episode) !== -1 ||
          s.title.indexOf("E" + episode) !== -1
        );
      });
      if (!streams.length) streams = streamsFromCollaps(extract, season, null);
    }

    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      const k = streams[i].streamUrl.slice(0, 160);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
