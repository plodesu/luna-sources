/**
 * RuNetflix – Sora / Luna
 * Multi-player (Плеер 1 / 2 / 3) + posters + search
 * v1.0.0
 */
const baseUrl = "https://runetflix.cc";
const PLAYER1 = "https://tarantino.factorios.live";
const PLAYER2 = "https://api.domem.ws";
const PLAYER3 = "https://franko.uacdn.online";

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

function absUrl(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return baseUrl + u;
  return u;
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    const url =
      baseUrl +
      "/index.php?do=search&subaction=search&story=" +
      encodeURIComponent(q);
    const html = await getText(await soraFetch(url));
    if (!html) return JSON.stringify([]);

    const results = [];
    const seen = {};
    const blocks = html.split(/<article class="grid-item/i);

    for (let i = 1; i < blocks.length && results.length < 25; i++) {
      const b = blocks[i];
      const hm = b.match(
        /href=["'](https?:\/\/[^"']+\/(?:movies|series|cartoon)\/[^"']+\.html)["']/i
      );
      if (!hm) continue;
      const href = hm[1].split("#")[0];
      if (seen[href]) continue;
      seen[href] = true;

      let title = "";
      const tm =
        b.match(/\btitle=["']([^"']+)["']/i) ||
        b.match(/class=["']item-title[^"']*["'][^>]*>([^<]+)/i) ||
        b.match(/alt=["']([^"']+)["']/i);
      if (tm) title = tm[1].replace(/\s+/g, " ").trim();
      if (!title || title.length < 2) continue;

      let image = "";
      const im =
        b.match(
          /(?:src|srcset)=["'](https?:\/\/(?:picasso\.factorios\.live|image\.tmdb\.org)[^"'\s]+)/i
        ) ||
        b.match(/(?:src|srcset)=["'](https?:\/\/[^"'\s]+@(?:300|400)[^"']*)/i);
      if (im) {
        image = im[1].split(/\s/)[0];
        // prefer larger
        image = image.replace(/@300\b/, "@400");
      }

      results.push({ title: title, image: image, href: href });
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(String(url).split("?")[0].split("#")[0]));
    let description = "N/A";
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
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

function parseIds(html) {
  const ids = { pid: "", cdHId: "", kpId: "", imId: "" };
  const m1 = html.match(/const\s+pid\s*=\s*['"]([^'"]*)['"]/);
  const m2 = html.match(/const\s+cdHId\s*=\s*['"]([^'"]*)['"]/);
  const m3 = html.match(/const\s+kpId\s*=\s*['"]([^'"]*)['"]/);
  const m4 = html.match(/const\s+imId\s*=\s*['"]([^'"]*)['"]/);
  if (m1) ids.pid = m1[1];
  if (m2) ids.cdHId = m2[1];
  if (m3) ids.kpId = m3[1];
  if (m4) ids.imId = m4[1];
  return ids;
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const ids = parseIds(html);

    // movie
    if (/\/movies\//i.test(pageUrl) || !ids.cdHId) {
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    }

    // load player payload for seasons/episodes
    const showUrl =
      PLAYER1 +
      "/show/" +
      ids.cdHId +
      "?extrans=1&unfseason=1";
    const ph = await getText(
      await soraFetch(showUrl, {
        headers: { Referer: baseUrl + "/" },
      })
    );
    const pm = ph.match(/window\.__PLAYER_PAYLOAD__\s*=\s*(\{[\s\S]*?\});/);
    const eps = [];
    if (pm) {
      try {
        const payload = JSON.parse(pm[1]);
        const se = payload.seasons_episodes || {};
        const seasons = Object.keys(se);
        for (let i = 0; i < seasons.length; i++) {
          const sn = +seasons[i];
          const list = se[seasons[i]] || [];
          for (let j = 0; j < list.length; j++) {
            const en = +list[j];
            eps.push({
              href: pageUrl + "?s=" + sn + "&e=" + en,
              number: en,
              season: sn,
              title: "S" + sn + "E" + en,
            });
          }
        }
      } catch (e) {}
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

/* ---- streams / multi-player ---- */

function cleanHls(u) {
  if (!u) return "";
  u = String(u).replace(/:hls:manifest\.m3u8$/i, "");
  // if still ends with quality path, append manifest form used by CDN
  if (/\.(mp4|m3u8)(\?|$)/i.test(u)) return u;
  if (/\/\d{3,4}(\?|$)/.test(u)) return u + ".mp4:hls:manifest.m3u8";
  return u;
}

function parseFileList(file, prefix) {
  const out = [];
  if (!file) return out;
  // [720]url,[1080]url  OR single url
  if (file.indexOf("[") === -1) {
    let u = file;
    // fallback base64 in query
    const fb = u.match(/fallback=([A-Za-z0-9+/=]+)/);
    if (fb) {
      try {
        const dec =
          typeof atob === "function"
            ? decodeURIComponent(escape(atob(fb[1])))
            : null;
        if (dec && isHttp(dec)) u = dec;
      } catch (e) {}
    }
    u = cleanHls(u.split(",")[0]);
    if (isHttp(u)) {
      out.push({
        title: (prefix || "Плеер") + " · Auto",
        streamUrl: u,
        headers: { "User-Agent": UA, Referer: baseUrl + "/" },
      });
    }
    return out;
  }
  const re = /\[(\d{3,4})\]([^,\[]+)/g;
  let m;
  while ((m = re.exec(file))) {
    let u = m[2].trim();
    // keep full hls manifest path the CDN expects
    if (u.indexOf(":hls:manifest.m3u8") === -1 && /\.mp4$/i.test(u)) {
      u = u + ":hls:manifest.m3u8";
    }
    if (!isHttp(u)) continue;
    out.push({
      title: (prefix || "Плеер") + " · " + m[1] + "p",
      streamUrl: u,
      headers: { "User-Agent": UA, Referer: baseUrl + "/" },
    });
  }
  return out;
}

async function fetchFiles(host, body, label) {
  const streams = [];
  try {
    const data = await getJson(
      await soraFetch(host + "/api/player/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: host,
          Referer: host + "/",
        },
        body: JSON.stringify(body),
      })
    );
    if (!data || !data.file) return streams;
    return parseFileList(data.file, label);
  } catch (e) {
    return streams;
  }
}

async function loadPayload(host, showPath) {
  try {
    const html = await getText(
      await soraFetch(host + "/show/" + showPath, {
        headers: { Referer: baseUrl + "/" },
      })
    );
    const m = html.match(/window\.__PLAYER_PAYLOAD__\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

async function extractStreamUrl(url) {
  try {
    const raw = String(url);
    const pageUrl = raw.split("?")[0].split("#")[0];
    const qs = raw.indexOf("?") >= 0 ? raw.split("?")[1] : "";
    const sM = qs.match(/(?:^|&)s=(\d+)/);
    const eM = qs.match(/(?:^|&)e=(\d+)/);
    const season = sM ? +sM[1] : null;
    const episode = eM ? +eM[1] : null;

    const html = await getText(await soraFetch(pageUrl));
    const ids = parseIds(html);
    if (!ids.cdHId && !ids.kpId) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const streams = [];

    // --- Плеер 1 (factorios) ---
    if (ids.cdHId) {
      const path =
        ids.cdHId +
        (season
          ? "?extrans=1&unfseason=1&season=" + season + "&episode=" + (episode || 1)
          : "?extrans=1&unfseason=1");
      const payload = await loadPayload(PLAYER1, path);
      const translations =
        payload && payload.translations && payload.translations.length
          ? payload.translations
          : [{ id: 0, title: "Default" }];

      // Russian-ish first
      translations.sort(function (a, b) {
        const ar = /рус|дубляж|проф|мосфильм|lost|hdrezka|многоголосый/i.test(
          a.title || ""
        )
          ? 0
          : 1;
        const br = /рус|дубляж|проф|мосфильм|lost|hdrezka|многоголосый/i.test(
          b.title || ""
        )
          ? 0
          : 1;
        return ar - br;
      });

      for (let i = 0; i < Math.min(translations.length, 4); i++) {
        const tr = translations[i];
        const body = { id: +ids.cdHId, translate: +tr.id || 0 };
        if (season) {
          body.season = season;
          body.episode = episode || 1;
        }
        const more = await fetchFiles(
          PLAYER1,
          body,
          "Плеер 1 · " + (tr.title || "Stream")
        );
        for (let j = 0; j < more.length; j++) streams.push(more[j]);
        if (streams.length >= 6) break;
      }
    }

    // --- Плеер 3 (uacdn / UA + often RU dub) ---
    if (ids.kpId) {
      const uaPath = "kinopoisk/" + ids.kpId;
      const payload3 = await loadPayload(PLAYER3, uaPath);
      const id3 =
        payload3 && payload3.id
          ? payload3.id
          : null;
      const trs =
        payload3 && payload3.translations && payload3.translations.length
          ? payload3.translations
          : [{ id: 0, title: "Дубляж" }];
      trs.sort(function (a, b) {
        const ar = /дубляж|рус|проф/i.test(a.title || "") ? 0 : 1;
        const br = /дубляж|рус|проф/i.test(b.title || "") ? 0 : 1;
        return ar - br;
      });
      if (id3) {
        for (let i = 0; i < Math.min(trs.length, 3); i++) {
          const tr = trs[i];
          const body = { id: +id3, translate: +tr.id || 0 };
          if (season) {
            body.season = season;
            body.episode = episode || 1;
          }
          const more = await fetchFiles(
            PLAYER3,
            body,
            "Плеер 3 · " + (tr.title || "UA")
          );
          for (let j = 0; j < more.length; j++) streams.push(more[j]);
        }
      }
    }

    // dedupe
    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 120);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 15), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
