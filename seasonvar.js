/**
 * Seasonvar.ru – Sora / Luna (series)
 * v1.0.0
 */
const baseUrl = "https://seasonvar.ru";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
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
  try {
    if (res && typeof res.json === "function") return await res.json();
    const t = await getText(res);
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

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/[Ss]\d+[Ee]\d+/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/Episode\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function seasonFromTitle(title) {
  const m = String(title || "").match(/(\d+)\s*сезон/i);
  return m ? +m[1] : null;
}

/** Decode seasonvar #2 base64 file links */
function decodeFile(enc) {
  if (!enc) return "";
  let s = String(enc).trim();
  if (s.indexOf("http") === 0) return s;
  if (s.indexOf("#2") === 0) s = s.substring(2);
  s = s.replace(/\/\/b2xvbG8=/g, "").replace(/\\\/\\\/b2xvbG8=/g, "");
  try {
    if (typeof atob !== "function") return "";
    // pad base64
    const pad = s.length % 4;
    if (pad) s += "====".substring(0, 4 - pad);
    const bin = atob(s);
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(bin, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch (e) {
      return bin;
    }
  } catch (e) {
    return "";
  }
}

function posterForId(id) {
  if (!id) return "";
  return "https://cdn.seasonvar.ru/oblojka/" + id + ".jpg";
}

function extractSecureMark(html) {
  if (!html) return null;
  let m =
    html.match(/secureMark'\s*:\s*'([a-f0-9]+)'/i) ||
    html.match(/secureMark"\s*:\s*"([a-f0-9]+)"/i) ||
    html.match(/secureMark['"]?\s*[:=]\s*['"]([a-f0-9]+)/i);
  return m ? m[1] : null;
}

function extractIds(html, fallbackId) {
  const season =
    (html.match(/data-id-season=["'](\d+)["']/i) || [])[1] || fallbackId;
  const serial =
    (html.match(/data-id-serial=["'](\d+)["']/i) || [])[1] || fallbackId;
  return { seasonId: season, serialId: serial };
}

function flattenPlaylist(pl, out) {
  out = out || [];
  if (!pl) return out;
  const list = Array.isArray(pl) ? pl : pl.playlist || [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row) continue;
    if (row.playlist) {
      flattenPlaylist(row.playlist, out);
    } else if (row.file) {
      out.push(row);
    }
  }
  return out;
}

function episodeNumberFromTitle(title, index) {
  const t = String(title || "").replace(/<br\s*\/?>/gi, " ");
  const m =
    t.match(/(\d+)\s*сери/i) ||
    t.match(/[Ee](?:pisode)?\s*(\d+)/) ||
    t.match(/^(\d+)/);
  return m ? +m[1] : index + 1;
}

function translationFromTitle(title) {
  const t = String(title || "").replace(/<br\s*\/?>/gi, " ");
  // "1 серия SD/HD<br>LostFilm" → LostFilm
  const parts = t.split(/\s{2,}|<br\s*\/?>/i);
  if (parts.length > 1) return parts[parts.length - 1].trim();
  const m = t.match(/(LostFilm|NewStudio|Amedia|Baibako|HDRezka|Кураж|TVShows|AlexFilm|ColdFilm|VoiceProject|RuDub|AniDub)[^]*/i);
  return m ? m[0].trim() : "";
}

async function fetchPlaylist(secureMark, id) {
  if (!secureMark || !id) return null;
  const url =
    baseUrl + "/playls2/" + secureMark + "x/trans/" + id + "/list.xml";
  try {
    const res = await soraFetch(url, {
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
        Accept: "application/json,*/*",
      },
    });
    return await getJson(res);
  } catch (e) {
    return null;
  }
}

async function loadSeasonPlaylist(pageUrl) {
  const html = await getText(await soraFetch(pageUrl));
  if (!html) return { html: "", items: [], seasonId: null };

  const idFromUrl = (pageUrl.match(/serial-(\d+)/) || [])[1];
  const ids = extractIds(html, idFromUrl);
  const secure = extractSecureMark(html);
  const plId = ids.seasonId || idFromUrl;

  let items = [];
  if (secure && plId) {
    const pl = await fetchPlaylist(secure, plId);
    items = flattenPlaylist(pl);
  }

  // fallback: try serial id if different
  if (!items.length && secure && ids.serialId && ids.serialId !== plId) {
    const pl = await fetchPlaylist(secure, ids.serialId);
    items = flattenPlaylist(pl);
  }

  return {
    html,
    items,
    seasonId: plId,
    serialId: ids.serialId,
    secure,
  };
}

/* ---- Luna API ---- */

async function searchResults(keyword) {
  try {
    const raw = cleanQuery(keyword);
    if (!raw) return JSON.stringify([]);

    const url =
      baseUrl + "/autocomplete.php?query=" + encodeURIComponent(raw);
    const res = await soraFetch(url, {
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: baseUrl + "/",
        Accept: "application/json,*/*",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    const j = await getJson(res);
    if (!j) return JSON.stringify([]);

    // support both shapes: suggestions.valu[] or suggestions[]
    let titles = [];
    if (j.suggestions && Array.isArray(j.suggestions.valu))
      titles = j.suggestions.valu;
    else if (Array.isArray(j.suggestions)) titles = j.suggestions;

    const data = Array.isArray(j.data) ? j.data : [];
    const ids = Array.isArray(j.id) ? j.id : [];

    const results = [];
    const seen = {};
    for (let i = 0; i < Math.max(titles.length, data.length); i++) {
      const title = String(titles[i] || "").trim();
      const hrefPath = String(data[i] || "").trim();
      const id = String(ids[i] || "").trim();
      if (!title || !hrefPath) continue;
      if (title.indexOf("<span") === 0) break; // tags/actors section
      const href = absUrl(hrefPath);
      if (seen[href]) continue;
      seen[href] = true;
      results.push({
        title: title.replace(/\s+/g, " "),
        image: posterForId(id),
        href: href,
      });
    }
    return JSON.stringify(results.slice(0, 20));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(String(url).split("?")[0]));
    let description = "N/A";
    const dm =
      html.match(/itemprop="description"[^>]*content="([^"]+)"/i) ||
      html.match(/name="description"\s+content="([^"]+)"/i) ||
      html.match(/class="[^"]*pgs-sinfo-info[^"]*"[^>]*>([\s\S]{20,400}?)<\//i);
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
    const seasonHint =
      seasonFromTitle(pageUrl) ||
      (pageUrl.match(/(\d+)-season/i) || [])[1] ||
      1;
    const sn = +seasonHint || 1;

    const loaded = await loadSeasonPlaylist(pageUrl);
    const items = loaded.items || [];
    if (!items.length) {
      return JSON.stringify([
        { href: pageUrl + "?s=" + sn + "&e=1", number: 1, season: sn, title: "S" + sn + "E1" },
      ]);
    }

    const eps = [];
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const en = episodeNumberFromTitle(items[i].title || items[i].comment, i);
      const key = sn + "-" + en;
      // keep first translation variant only for list
      if (seen[key]) continue;
      seen[key] = true;
      eps.push({
        href: pageUrl + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }
    eps.sort((a, b) => a.number - b.number);
    return JSON.stringify(eps.length ? eps : [
      { href: pageUrl + "?s=" + sn + "&e=1", number: 1, season: sn, title: "S" + sn + "E1" },
    ]);
  } catch (e) {
    return JSON.stringify([
      {
        href: String(url).split("?")[0],
        number: 1,
        season: 1,
        title: "S1E1",
      },
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    const clean = String(url).split("#")[0];
    const se = parseSE(clean);
    const pageUrl = clean.split("?")[0];
    const seasonHint =
      se.season ||
      seasonFromTitle(pageUrl) ||
      +(pageUrl.match(/(\d+)-season/i) || [])[1] ||
      1;
    const episode = se.episode || 1;

    const loaded = await loadSeasonPlaylist(pageUrl);
    const items = loaded.items || [];
    if (!items.length)
      return JSON.stringify({ streams: [], subtitles: "" });

    // collect all matching episode translations
    const streams = [];
    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: baseUrl + "/",
    };

    for (let i = 0; i < items.length; i++) {
      const en = episodeNumberFromTitle(items[i].title || items[i].comment, i);
      if (en !== episode) continue;
      let file = items[i].file || "";
      file = decodeFile(file);
      if (!file || file.indexOf("http") !== 0) continue;
      const tr = translationFromTitle(items[i].title || items[i].comment);
      const label =
        "S" +
        seasonHint +
        "E" +
        episode +
        (tr ? " · " + tr : " · Stream");
      streams.push({
        title: label,
        streamUrl: file,
        headers: headers,
      });
    }

    // if nothing matched exact episode, try index episode-1
    if (!streams.length && items[episode - 1]) {
      let file = decodeFile(items[episode - 1].file || "");
      if (file && file.indexOf("http") === 0) {
        const tr = translationFromTitle(
          items[episode - 1].title || items[episode - 1].comment
        );
        streams.push({
          title:
            "S" +
            seasonHint +
            "E" +
            episode +
            (tr ? " · " + tr : " · Stream"),
          streamUrl: file,
          headers: headers,
        });
      }
    }

    // dedupe
    const uniq = [],
      seen = {};
    for (let i = 0; i < streams.length; i++) {
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
