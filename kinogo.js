/**
 * Kinogo.sh – Sora / Luna
 * Russian tracks rus1+ only · no def0 · ordered · full video
 * v2.0.0
 */
const baseUrl = "https://kinogo.sh";
const ALLOHA_API = "https://api.apbugall.org/";
const ALLOHA_TOKEN = "60b252fdcd2f53e8492fca2f44e8c5";
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

function absFromBase(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (isHttp(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") {
    const m = String(base || "").match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] + u : u;
  }
  return String(base || "").replace(/[^/]+$/, "") + u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\bсезон[а]?\s*\d+\b/gi, " ")
    .replace(/\bTV\s*Show\b/gi, " ")
    .replace(/\bMovie\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(query, title) {
  const q = query
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.indexOf(q) !== -1 || q.indexOf(t) !== -1) return 92;
  const qw = q.split(/\s+/).filter(function (w) {
    return w.length > 2;
  });
  if (!qw.length) return 0;
  let hit = 0;
  for (let i = 0; i < qw.length; i++) {
    if (t.indexOf(qw[i]) !== -1) hit++;
  }
  return Math.round((hit / qw.length) * 80);
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function isEnglishDef(name) {
  const n = String(name || "").toLowerCase();
  return /^(def\d*|eng\.?\s*original|eng\.?original|original|english|английск|оригинал)$/i.test(
    n.trim()
  ) || /eng\.?\s*original|eng\.?original|\bdef0\b|английск|оригинал/i.test(n);
}

function isRussianTrack(name, lang) {
  const n = String(name || "").toLowerCase();
  const l = String(lang || "").toLowerCase();
  if (isEnglishDef(n)) return false;
  if (/^(en|eng)$/i.test(l)) return false;
  if (/^rus?\d+$/i.test(n.trim())) return true; // rus1, rus2, ru1…
  if (/^(ru|rus|russian)$/i.test(l)) return true;
  if (
    /дубл|русск|lostfilm|hdrezka|winmedia|tvshows|dragon|кубик|гоблин|кравец|студи/i.test(
      n
    )
  ) {
    return true;
  }
  if (/[а-яё]/i.test(n) && !/субтитр/i.test(n)) return true;
  return false;
}

/** Sort: rus1, rus2, rus3… then other RU names (Дубл. first) */
function trackSortKey(title) {
  const m = String(title).match(/\brus(\d+)\b/i);
  if (m) return { grp: 0, n: +m[1], t: title };
  if (/дубл/i.test(title)) return { grp: 1, n: 0, t: title };
  return { grp: 2, n: 0, t: title };
}

function compareTracks(a, b) {
  const ka = trackSortKey(a.title);
  const kb = trackSortKey(b.title);
  if (ka.grp !== kb.grp) return ka.grp - kb.grp;
  if (ka.n !== kb.n) return ka.n - kb.n;
  return ka.t.localeCompare(kb.t);
}

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);
    const variants = [cleaned];
    const noThe = cleaned.replace(/^the\s+/i, "").trim();
    if (noThe && noThe !== cleaned) variants.push(noThe);
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
          },
          body:
            "do=search&subaction=search&story=" +
            encodeURIComponent(variants[v]),
        })
      );
      if (!html || html.length < 500) continue;
      const arts = html.split(/<article class="short"/i);
      for (let i = 1; i < arts.length; i++) {
        const a = arts[i];
        const tm = a.match(
          /<h2>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i
        );
        if (!tm) continue;
        const href = absUrl(tm[1]);
        if (seen[href]) continue;
        seen[href] = true;
        const title = tm[2].replace(/\s+/g, " ").trim();
        if (title.length < 2) continue;
        let image = "";
        const im = a.match(
          /(?:src|data-src)=["']([^"']*\/uploads\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
        );
        if (im) image = absUrl(im[1]);
        results.push({
          title: title,
          image: image,
          href: href,
          _score: titleScore(cleaned, title),
        });
      }
    }
    results.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
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
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
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

function extractAllohaTokenMovie(html) {
  const m = (html || "").match(/token_movie=([a-f0-9]{20,})/i);
  return m ? m[1] : "";
}

function extractOrtifiedId(html) {
  const m = (html || "").match(/ortified\.ws\/embed\/movie\/(\d+)/i);
  return m ? m[1] : "";
}

async function fetchAlloha(tokenMovie) {
  if (!tokenMovie) return null;
  return await getJson(
    await soraFetch(
      ALLOHA_API +
        "?token=" +
        encodeURIComponent(ALLOHA_TOKEN) +
        "&token_movie=" +
        encodeURIComponent(tokenMovie),
      { headers: { Referer: baseUrl + "/" } }
    )
  );
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const tokenMovie = extractAllohaTokenMovie(html);
    const eps = [];
    if (tokenMovie) {
      const j = await fetchAlloha(tokenMovie);
      const data = j && j.data ? j.data : null;
      if (data && data.seasons) {
        const seasons = Object.keys(data.seasons);
        for (let i = 0; i < seasons.length; i++) {
          const sn = +seasons[i];
          const episodes = data.seasons[seasons[i]].episodes || {};
          const ek = Object.keys(episodes);
          for (let j = 0; j < ek.length; j++) {
            const en = +ek[j];
            if (en <= 0) continue;
            eps.push({
              href: pageUrl + "?s=" + sn + "&e=" + en,
              number: en,
              season: sn,
              title: "S" + sn + "E" + en,
            });
          }
        }
      }
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

function parseCollapsMakePlayer(html) {
  const result = { hls: "", names: [] };
  if (!html || /недоступен в вашем регионе/i.test(html)) return result;
  const m = html.match(/makePlayer\(\{([\s\S]*?)\}\)\s*;/);
  if (!m) {
    const hls = (html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i) ||
      [])[0];
    if (hls) result.hls = hls.replace(/&amp;/g, "&");
    return result;
  }
  const body = m[1];
  const hls = (body.match(/["']?hls["']?\s*:\s*["'](https?:\/\/[^"']+)["']/) ||
    [])[1];
  if (hls) result.hls = hls;
  const namesBlock =
    (body.match(/["']?names["']?\s*:\s*\[([^\]]*)\]/) || [])[1] || "";
  const nm = namesBlock.match(/["']([^"']+)["']/g);
  if (nm) {
    for (let i = 0; i < nm.length; i++) {
      result.names.push(nm[i].replace(/["']/g, "").trim());
    }
  }
  return result;
}

async function loadCollaps(htmlPage, season, episode) {
  const ortId = extractOrtifiedId(htmlPage);
  if (!ortId) return { hls: "", names: [] };
  let url = "https://api.ortified.ws/embed/movie/" + ortId;
  if (season) url += "?season=" + season + "&episode=" + (episode || 1);
  let html = await getText(
    await soraFetch(url, {
      headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
    })
  );
  let parsed = parseCollapsMakePlayer(html);
  if (!parsed.hls) {
    html = await getText(
      await soraFetch("https://api.delivembd.ws/embed/movie/" + ortId, {
        headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
      })
    );
    parsed = parseCollapsMakePlayer(html);
  }
  return parsed;
}

/**
 * Read master m3u8 once → list Russian audio tracks (skip def0 / eng).
 * streamUrl stays the MASTER playlist so video always plays.
 */
async function listRussianTracks(hlsUrl, studioNames, headers) {
  const out = [];
  if (!isHttp(hlsUrl)) return out;

  let text = "";
  try {
    text = await getText(
      await soraFetch(hlsUrl, {
        headers: Object.assign(
          {
            "User-Agent": UA,
            Accept: "application/vnd.apple.mpegurl,*/*",
            Referer: "https://api.ortified.ws/",
          },
          headers || {}
        ),
      })
    );
  } catch (e) {
    return out;
  }
  if (!text || text.indexOf("#EXT") !== 0) return out;

  // Map rus index → studio name from makePlayer.names (skip eng at [0] if present)
  const ruStudios = [];
  for (let i = 0; i < (studioNames || []).length; i++) {
    const n = studioNames[i];
    if (!n || isEnglishDef(n)) continue;
    ruStudios.push(n);
  }

  const lines = text.split(/\r?\n/);
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^#EXT-X-MEDIA:/i.test(line)) continue;
    if (!/TYPE=AUDIO/i.test(line)) continue;

    const nameM = line.match(/NAME="([^"]+)"/i);
    const langM = line.match(/LANGUAGE="([^"]+)"/i);
    const name = nameM ? nameM[1].trim() : "";
    const lang = langM ? langM[1] : "";

    if (!isRussianTrack(name, lang)) continue;
    if (isEnglishDef(name)) continue;

    const rusM = name.match(/^rus?(\d+)$/i);
    let order = rusM ? +rusM[1] : 1000;
    let label = name;

    // Prefer human studio name when track is rusN
    if (rusM && ruStudios.length) {
      const idx = +rusM[1] - 1; // rus1 → first Russian studio
      if (idx >= 0 && idx < ruStudios.length) {
        label = ruStudios[idx] + " · rus" + rusM[1];
      } else {
        label = "rus" + rusM[1];
      }
    } else if (rusM) {
      label = "rus" + rusM[1];
    }

    found.push({
      order: order,
      title: "Collaps · " + label,
      streamUrl: hlsUrl, // master = video + all audio (not audio-only)
    });
  }

  // If playlist has no named rus tracks, build from studio names only
  if (!found.length && ruStudios.length) {
    for (let i = 0; i < ruStudios.length; i++) {
      found.push({
        order: i + 1,
        title: "Collaps · " + ruStudios[i] + " · rus" + (i + 1),
        streamUrl: hlsUrl,
      });
    }
  }

  found.sort(function (a, b) {
    return a.order - b.order;
  });

  // unique by title
  const seen = {};
  for (let i = 0; i < found.length; i++) {
    if (seen[found[i].title]) continue;
    seen[found[i].title] = true;
    out.push({
      title: found[i].title,
      streamUrl: found[i].streamUrl,
      headers: {
        "User-Agent": UA,
        Referer: "https://api.ortified.ws/",
      },
    });
  }
  return out;
}

async function resolveAllohaEmbed(iframe, label) {
  const out = [];
  if (!iframe || !isHttp(iframe)) return out;
  try {
    const html = await getText(
      await soraFetch(iframe, {
        headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
      })
    );
    if (!html || /недоступен в вашем регионе/i.test(html)) return out;
    const hls = (html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i) || [])[0];
    if (hls) {
      out.push({
        title: label,
        streamUrl: hls.replace(/&amp;/g, "&"),
        headers: { "User-Agent": UA, Referer: iframe },
      });
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
    const tokenMovie = extractAllohaTokenMovie(html);

    const streams = [];
    const seen = {};

    function add(item) {
      if (!item || !isHttp(item.streamUrl)) return;
      if (isEnglishDef(item.title)) return;
      if (/\bdef0\b/i.test(item.title)) return;
      const key = item.title.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      streams.push({
        title: item.title,
        name: item.title,
        streamUrl: item.streamUrl,
        headers: item.headers || {
          "User-Agent": UA,
          Referer: baseUrl + "/",
        },
      });
    }

    // 1) Alloha Russian translations
    if (tokenMovie) {
      const j = await fetchAlloha(tokenMovie);
      const data = j && j.data ? j.data : null;
      let map = null;
      if (data) {
        if (se.season && data.seasons && data.seasons[String(se.season)]) {
          const ep =
            data.seasons[String(se.season)].episodes &&
            data.seasons[String(se.season)].episodes[String(se.episode || 1)];
          if (ep) map = ep.translation;
        } else {
          map = data.translation_iframe;
        }
      }
      if (map) {
        const ids = Object.keys(map);
        for (let i = 0; i < ids.length; i++) {
          const tr = map[ids[i]];
          const voice = tr.translation || tr.name || "";
          if (isEnglishDef(voice)) continue;
          if (!isRussianTrack(voice, "ru")) continue;
          const label = voice + (tr.quality ? " · " + tr.quality : "");
          if (!tr.iframe) continue;
          const more = await resolveAllohaEmbed(tr.iframe, label);
          for (let k = 0; k < more.length; k++) add(more[k]);
        }
      }
    }

    // 2) Collaps: rus1…rusN ordered, no def0
    const col = await loadCollaps(html, se.season, se.episode);
    if (col.hls) {
      const tracks = await listRussianTracks(col.hls, col.names, {
        Referer: "https://api.ortified.ws/",
      });
      for (let i = 0; i < tracks.length; i++) add(tracks[i]);

      // Fallback if m3u8 had no tags: studio names as rus1…
      if (!tracks.length && col.names && col.names.length) {
        let r = 0;
        for (let i = 0; i < col.names.length; i++) {
          const n = col.names[i];
          if (!n || isEnglishDef(n)) continue;
          if (!isRussianTrack(n, "ru")) continue;
          r++;
          add({
            title: "Collaps · " + n + " · rus" + r,
            streamUrl: col.hls,
            headers: {
              "User-Agent": UA,
              Referer: "https://api.ortified.ws/",
            },
          });
        }
      }
    }

    streams.sort(compareTracks);

    return JSON.stringify({
      streams: streams.slice(0, 12),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
