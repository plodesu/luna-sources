/**
 * Seasonvar.ru – Sora / Luna (series)
 * v1.1.0 – multi-translation streams (like GidOnline)
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

function decodeFile(enc) {
  if (!enc) return "";
  let s = String(enc).trim();
  if (s.indexOf("http") === 0) return s;
  if (s.indexOf("#2") === 0) s = s.substring(2);
  s = s.replace(/\/\/b2xvbG8=/g, "").replace(/\\\/\\\/b2xvbG8=/g, "");
  try {
    if (typeof atob !== "function") return "";
    const pad = s.length % 4;
    if (pad) s += "====".substring(0, 4 - pad);
    const bin = atob(s);
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(bin, function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
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

function extractPoster(html, id) {
  if (!html) return posterForId(id);
  const m =
    html.match(
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    ) ||
    html.match(
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i
    ) ||
    html.match(
      /(?:src|data-src)=["']((?:https?:)?\/\/[^"']*oblojka[^"']+)["']/i
    ) ||
    html.match(
      /(?:src|data-src)=["']((?:https?:)?\/\/cdn\.seasonvar\.ru\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
    ) ||
    html.match(/(?:src|data-src)=["'](\/[^"']*oblojka[^"']+)["']/i);
  if (m && m[1]) return absUrl(m[1].replace(/&amp;/g, "&"));
  return posterForId(id);
}

function extractSecureMark(html) {
  if (!html) return null;
  const m =
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
  if (Array.isArray(pl)) {
    for (let i = 0; i < pl.length; i++) flattenPlaylist(pl[i], out);
    return out;
  }
  if (pl.playlist) return flattenPlaylist(pl.playlist, out);
  if (pl.file) out.push(pl);
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
  const parts = t.split(/<br\s*\/?>/i);
  if (parts.length > 1) return parts[parts.length - 1].replace(/\s+/g, " ").trim();
  const m = t.match(
    /(LostFilm|NewStudio|Amedia|Baibako|HDRezka|Кураж|TVShows|AlexFilm|ColdFilm|VoiceProject|RuDub|AniDub|Гоблин|кубик|Субтитры|Стандартный)[^]*/i
  );
  return m ? m[0].trim() : "";
}

/** Parse all translation tabs + playlist paths from page HTML */
function extractTranslations(html, secure, seasonId) {
  const list = [];
  if (!html) return list;

  // paths embedded next to each translate option
  const pathRe =
    /playls2\/([a-f0-9]+)\/trans([^"'\\\s]*?)\/(\d+)\/plist\.txt/gi;
  let m;
  const paths = [];
  while ((m = pathRe.exec(html))) {
    paths.push({
      secure: m[1],
      transRaw: m[2], // may be empty or URL-encoded name
      id: m[3],
      path:
        "/playls2/" +
        m[1] +
        "/trans" +
        m[2] +
        "/" +
        m[3] +
        "/plist.txt",
    });
  }

  // names from <li data-translate>
  const names = [];
  const nameRe =
    /<li[^>]*data-translate=["'](\d+)["'][^>]*>\s*([^<]+)/gi;
  while ((m = nameRe.exec(html))) {
    const name = m[2].replace(/\s+/g, " ").trim();
    if (/трейлер/i.test(name)) continue;
    names.push({ id: m[1], name: name });
  }

  // default list.xml (стандартный / LostFilm etc.)
  if (secure && seasonId) {
    list.push({
      name: names[0] ? names[0].name : "Стандартный",
      url:
        baseUrl +
        "/playls2/" +
        secure +
        "x/trans/" +
        seasonId +
        "/list.xml",
    });
  }

  // alternate named translations
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (!p.transRaw) continue; // default already added
    let label = decodeURIComponent(p.transRaw.replace(/\+/g, " "));
    label = label.replace(/^\s+|\s+$/g, "");
    if (/трейлер/i.test(label)) continue;
    // match nicer name from li if possible
    for (let j = 0; j < names.length; j++) {
      if (
        names[j].name.toLowerCase().indexOf(label.toLowerCase()) !== -1 ||
        label.toLowerCase().indexOf(names[j].name.toLowerCase()) !== -1
      ) {
        label = names[j].name;
        break;
      }
    }
    list.push({
      name: label || "Перевод",
      url: baseUrl + p.path,
    });
  }

  // dedupe by url
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (seen[list[i].url]) continue;
    seen[list[i].url] = true;
    out.push(list[i]);
  }
  return out;
}

async function fetchPlaylistUrl(url) {
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
  if (!html) return { html: "", items: [], seasonId: null, translations: [] };

  const idFromUrl = (pageUrl.match(/serial-(\d+)/) || [])[1];
  const ids = extractIds(html, idFromUrl);
  const secure = extractSecureMark(html);
  const plId = ids.seasonId || idFromUrl;

  const translations = extractTranslations(html, secure, plId);

  // default playlist for episode list
  let items = [];
  if (secure && plId) {
    const pl = await fetchPlaylistUrl(
      baseUrl + "/playls2/" + secure + "x/trans/" + plId + "/list.xml"
    );
    items = flattenPlaylist(pl);
  }

  return {
    html,
    items,
    seasonId: plId,
    serialId: ids.serialId,
    secure,
    translations,
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
      let id = String(ids[i] || "").trim();
      if (!title || !hrefPath) continue;
      if (title.indexOf("<span") === 0) break;
      const href = absUrl(hrefPath);
      if (seen[href]) continue;
      seen[href] = true;
      if (!id) {
        const mm = hrefPath.match(/serial-(\d+)/);
        if (mm) id = mm[1];
      }
      results.push({
        title: title.replace(/\s+/g, " "),
        image: posterForId(id),
        href: href,
        _id: id,
      });
    }

    const limit = Math.min(results.length, 12);
    for (let i = 0; i < limit; i++) {
      try {
        const pageHtml = await getText(
          await soraFetch(results[i].href, {
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: baseUrl + "/",
            },
          })
        );
        const img = extractPoster(pageHtml, results[i]._id);
        if (img) results[i].image = img;
      } catch (e) {}
    }

    return JSON.stringify(
      results.slice(0, 20).map(function (r) {
        return { title: r.title, image: r.image || "", href: r.href };
      })
    );
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
      html.match(
        /class="[^"]*pgs-sinfo-info[^"]*"[^>]*>([\s\S]{20,400}?)<\//i
      );
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
      seasonFromTitle(
        (await getText(await soraFetch(pageUrl))).match(
          /<title>([^<]+)/
        )?.[1] || ""
      ) ||
      1;
    const sn = +seasonHint || 1;

    const loaded = await loadSeasonPlaylist(pageUrl);
    const items = loaded.items || [];
    if (!items.length) {
      return JSON.stringify([
        {
          href: pageUrl + "?s=" + sn + "&e=1",
          number: 1,
          season: sn,
          title: "S" + sn + "E1",
        },
      ]);
    }

    const eps = [];
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const en = episodeNumberFromTitle(
        items[i].title || items[i].comment,
        i
      );
      const key = sn + "-" + en;
      if (seen[key]) continue;
      seen[key] = true;
      eps.push({
        href: pageUrl + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }
    eps.sort(function (a, b) {
      return a.number - b.number;
    });
    return JSON.stringify(
      eps.length
        ? eps
        : [
            {
              href: pageUrl + "?s=" + sn + "&e=1",
              number: 1,
              season: sn,
              title: "S" + sn + "E1",
            },
          ]
    );
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
    const translations = loaded.translations || [];
    const headers = {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: baseUrl + "/",
    };

    const streams = [];
    const seen = {};

    async function addFromPlaylist(pl, label) {
      const items = flattenPlaylist(pl);
      for (let i = 0; i < items.length; i++) {
        const en = episodeNumberFromTitle(
          items[i].title || items[i].comment,
          i
        );
        if (en !== episode) continue;
        let file = items[i].file || "";
        if (file.indexOf("#2") === 0 || (file && file.indexOf("http") !== 0)) {
          file = decodeFile(file);
        }
        if (!file || file.indexOf("http") !== 0) continue;
        const tr =
          label ||
          translationFromTitle(items[i].title || items[i].comment) ||
          "Stream";
        const key = file.slice(0, 100) + "|" + tr;
        if (seen[key]) continue;
        seen[key] = true;
        streams.push({
          title: tr + " · S" + seasonHint + "E" + episode,
          streamUrl: file,
          headers: headers,
        });
      }
    }

    // all translation playlists
    if (translations.length) {
      for (let i = 0; i < translations.length; i++) {
        const tr = translations[i];
        if (/трейлер/i.test(tr.name || "")) continue;
        const pl = await fetchPlaylistUrl(tr.url);
        await addFromPlaylist(pl, tr.name);
      }
    } else if (loaded.items && loaded.items.length) {
      await addFromPlaylist({ playlist: loaded.items }, null);
    }

    // sort: prefer non-subtitle first
    streams.sort(function (a, b) {
      const as = /субтитр/i.test(a.title) ? 1 : 0;
      const bs = /субтитр/i.test(b.title) ? 1 : 0;
      return as - bs;
    });

    return JSON.stringify({ streams: streams.slice(0, 15), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
