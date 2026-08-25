/**
 * Kinogo.sh – Sora / Luna
 * Collaps (delivembd / ortified) · Russian audio first · series episodes
 * v3.0.0
 */
const baseUrl = "https://kinogo.sh";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const EMBED_HOSTS = [
  "https://api.delivembd.ws",
  "https://api.ortified.ws",
];

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
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
    return await fetch(url, { method: method, headers: headers, body: body });
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

function forceHttps(u) {
  return String(u || "").replace(/^http:\/\//i, "https://");
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\bсезон[а]?\s*\d+\b/gi, " ")
    .replace(/\bсери[яи]\s*\d+\b/gi, " ")
    .replace(/\bTV\s*Show\b/gi, " ")
    .replace(/\bMovie\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(query, title) {
  const q = String(query)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.indexOf(q) === 0) return 96;
  if (t.indexOf(q) !== -1 || q.indexOf(t) !== -1) return 90;
  const qw = q.split(/\s+/).filter(function (w) {
    return w.length > 2;
  });
  if (!qw.length) return 0;
  let hit = 0;
  for (let i = 0; i < qw.length; i++) {
    if (t.indexOf(qw[i]) !== -1) hit++;
  }
  return Math.round((hit / qw.length) * 82);
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return {
    season: s ? parseInt(s, 10) : null,
    episode: e ? parseInt(e, 10) : null,
  };
}

function isEnglish(name) {
  return /eng\.?\s*original|eng\.?original|\boriginal\b|оригинал|english|английск|\beng\b|eng3/i.test(
    String(name || "")
  );
}

function isUkrainianOnly(name) {
  return /укр|ukr|україн|багатоголосий|ictv/i.test(String(name || "")) &&
    !/рус|дубл|hdrezka|lostfilm/i.test(String(name || ""));
}

function isRussianName(name) {
  const n = String(name || "");
  if (!n.trim() || isEnglish(n)) return false;
  if (/субтитр|subtitle|^sub$/i.test(n)) return false;
  if (isUkrainianOnly(n)) return false;
  return (
    /дубл|русск|lostfilm|hdrezka|winmedia|tvshows|dragon|кубик|гоблин|кравец|студи|сериб|гаврилов|пифагор|money|redhead|newstudio|ideafilm|баибако|baibako|ultradox/i.test(
      n
    ) || /[а-яё]/i.test(n)
  );
}

function voiceRank(name) {
  const n = String(name || "");
  if (/дубл/i.test(n) && /hdrezka/i.test(n)) return 0;
  if (/hdrezka/i.test(n)) return 1;
  if (/дубл/i.test(n)) return 2;
  if (/lostfilm|winmedia|tvshows|dragon/i.test(n)) return 3;
  return 4;
}

function heightToLabel(h) {
  h = parseInt(h, 10) || 0;
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  return "";
}

function absFrom(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (isHttp(u)) return u;
  if (u.charAt(0) === "/") {
    const m = String(base).match(/^(https?:\/\/[^/]+)/i);
    return (m ? m[1] : "") + u;
  }
  return String(base).replace(/\/[^/]*$/, "/") + u.replace(/^\.\//, "");
}

/* ---------------- search ---------------- */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const variants = [cleaned];
    const noThe = cleaned.replace(/^the\s+/i, "").trim();
    if (noThe && noThe !== cleaned) variants.push(noThe);
    const first = cleaned.split(/\s+/)[0];
    if (first && first.length > 3 && first !== cleaned) variants.push(first);

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
      if (!html || html.length < 400) continue;

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
      if (results.length >= 8) break;
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
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) {
      description = String(dm[1])
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
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

function extractOrtifiedId(html) {
  const m =
    (html || "").match(/ortified\.ws\/embed\/movie\/(\d+)/i) ||
    (html || "").match(/delivembd\.ws\/embed\/movie\/(\d+)/i);
  return m ? m[1] : "";
}

function extractKpId(html) {
  const m =
    (html || "").match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i) ||
    (html || "").match(/kp[_-]?id["']?\s*[:=]\s*["']?(\d+)/i);
  return m ? m[1] : "";
}

function unescapeJs(s) {
  try {
    return String(s)
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"');
  } catch (e) {
    return s;
  }
}

/**
 * Parse makePlayer payload: hls, names, seasons[]
 */
function parseMakePlayer(html) {
  const out = {
    hls: "",
    names: [],
    seasons: [],
    isSeries: false,
  };
  if (!html) return out;

  const block = html.match(/makePlayer\(\{([\s\S]*?)\}\)\s*;/);
  const body = block ? block[1] : html;

  // top-level hls (movies)
  let hm = body.match(/["']?hls["']?\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (hm) out.hls = unescapeJs(hm[1]);

  // top-level names (movies)
  let nm = body.match(/["']?names["']?\s*:\s*\[([^\]]*)\]/);
  if (nm) {
    const parts = nm[1].match(/["']([^"']+)["']/g);
    if (parts) {
      for (let i = 0; i < parts.length; i++) {
        out.names.push(parts[i].replace(/["']/g, "").trim());
      }
    }
  }

  // series seasons – extract each episode object
  if (/["']?seasons["']?\s*:/.test(body) || /"season":\d+/.test(body)) {
    out.isSeries = true;
    const epRe =
      /\{"episode":"(\d+)","id":\d+,"videoKey":\d+,"dash":"[^"]*","hls":"(https:[^"]+)"[\s\S]*?"audio":\{"names":\[([^\]]*)\]/g;
    let m;
    // also need season number – scan with season context
    const seasonChunks = body.split(/\{"season":/);
    for (let c = 1; c < seasonChunks.length; c++) {
      const chunk = seasonChunks[c];
      const sm = chunk.match(/^(\d+)/);
      if (!sm) continue;
      const seasonNum = parseInt(sm[1], 10);
      const episodes = [];
      const localRe =
        /\{"episode":"(\d+)","id":\d+,"videoKey":\d+,"dash":"[^"]*","hls":"(https:[^"]+)"[\s\S]*?"audio":\{"names":\[([^\]]*)\]/g;
      let em;
      while ((em = localRe.exec(chunk))) {
        const names = [];
        const nparts = em[3].match(/["']([^"']+)["']/g);
        if (nparts) {
          for (let i = 0; i < nparts.length; i++) {
            names.push(nparts[i].replace(/["']/g, "").trim());
          }
        }
        episodes.push({
          episode: parseInt(em[1], 10),
          hls: unescapeJs(em[2]),
          names: names,
        });
      }
      if (episodes.length) {
        out.seasons.push({ season: seasonNum, episodes: episodes });
      }
    }
  }

  return out;
}

async function loadCollapsEmbed(ortId, kpId, season, episode) {
  const urls = [];
  const seQuery =
    season != null
      ? "?season=" + season + "&episode=" + (episode || 1)
      : "";

  for (let h = 0; h < EMBED_HOSTS.length; h++) {
    const host = EMBED_HOSTS[h];
    if (ortId) {
      urls.push(host + "/embed/movie/" + ortId + seQuery);
      urls.push(host + "/embed/movie/" + ortId);
    }
    if (kpId) {
      urls.push(host + "/embed/kp/" + kpId + seQuery);
      urls.push(host + "/embed/kp/" + kpId);
    }
  }

  for (let i = 0; i < urls.length; i++) {
    try {
      const html = await getText(
        await soraFetch(urls[i], {
          headers: {
            Referer: baseUrl + "/",
            Accept: "text/html,*/*",
            "User-Agent": UA,
          },
        })
      );
      if (!html || html.length < 300) continue;
      if (/недоступен в вашем регионе/i.test(html) && !/makePlayer/i.test(html)) {
        continue;
      }
      if (!/makePlayer/i.test(html) && !/"hls"\s*:/.test(html)) continue;

      const parsed = parseMakePlayer(html);

      // series: pick requested episode hls
      if (parsed.seasons.length && season != null) {
        for (let s = 0; s < parsed.seasons.length; s++) {
          if (parsed.seasons[s].season !== season) continue;
          const eps = parsed.seasons[s].episodes;
          for (let e = 0; e < eps.length; e++) {
            if (eps[e].episode === (episode || 1)) {
              parsed.hls = eps[e].hls;
              parsed.names = eps[e].names || parsed.names;
              return parsed;
            }
          }
          // fallback first ep of season
          if (eps.length) {
            parsed.hls = eps[0].hls;
            parsed.names = eps[0].names || parsed.names;
            return parsed;
          }
        }
      }

      if (parsed.hls) return parsed;
    } catch (e) {}
  }
  return { hls: "", names: [], seasons: [], isSeries: false };
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const ortId = extractOrtifiedId(html);
    const kpId = extractKpId(html);
    const eps = [];

    if (ortId || kpId) {
      const col = await loadCollapsEmbed(ortId, kpId, null, null);

      if (col.seasons && col.seasons.length) {
        for (let s = 0; s < col.seasons.length; s++) {
          const season = col.seasons[s];
          for (let e = 0; e < season.episodes.length; e++) {
            const ep = season.episodes[e];
            eps.push({
              href: pageUrl + "?s=" + season.season + "&e=" + ep.episode,
              number: ep.episode,
              season: season.season,
              title: "S" + season.season + "E" + ep.episode,
            });
          }
        }
      } else if (col.hls) {
        // movie
        eps.push({
          href: pageUrl,
          number: 1,
          season: 1,
          title: "Смотреть",
        });
      }
    }

    // fallback: title "1-4 сезон 1-8 серия"
    if (!eps.length) {
      const titleM = html.match(/<title>([^<]+)/i);
      const title = titleM ? titleM[1] : "";
      const sm = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сезон/i);
      const em = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сери/i);
      if (sm) {
        const eMax = em ? parseInt(em[2], 10) : 12;
        const eMin = em ? parseInt(em[1], 10) : 1;
        for (let s = parseInt(sm[1], 10); s <= parseInt(sm[2], 10); s++) {
          for (let e = eMin; e <= eMax; e++) {
            eps.push({
              href: pageUrl + "?s=" + s + "&e=" + e,
              number: e,
              season: s,
              title: "S" + s + "E" + e,
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
    // safety cap
    return JSON.stringify(eps.slice(0, 400));
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

/**
 * Expand HLS master → Auto + 1080/720/480 (master kept for audio tracks)
 * Collaps uses separate AUDIO groups – always prefer master for sound.
 */
async function expandHls(masterUrl) {
  const out = [];
  if (!isHttp(masterUrl)) return out;
  const master = forceHttps(masterUrl);

  // Auto = full master (all Russian audio tracks selectable by player)
  out.push({ quality: "Auto", url: master });

  try {
    const text = await getText(
      await soraFetch(master, {
        headers: {
          "User-Agent": UA,
          Accept: "application/vnd.apple.mpegurl,*/*",
          Referer: "https://api.delivembd.ws/",
        },
      })
    );
    if (!text || text.indexOf("#EXT") !== 0) return out;

    // Only list qualities that exist; still point to MASTER so audio works
    const lines = text.split(/\r?\n/);
    const found = {};
    for (let i = 0; i < lines.length; i++) {
      if (!/^#EXT-X-STREAM-INF:/i.test(lines[i])) continue;
      if (/failover/i.test(lines[i])) continue;
      const resM = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
      const q = heightToLabel(resM ? resM[1] : 0);
      if (q) found[q] = true;
    }
    ["1080p", "720p", "480p"].forEach(function (q) {
      if (found[q]) out.push({ quality: q, url: master });
    });
  } catch (e) {}

  return out;
}

async function extractStreamUrl(url) {
  try {
    const raw = String(url);
    const pageUrl = raw.split("?")[0].split("#")[0];
    const se = parseSE(raw);

    const html = await getText(await soraFetch(pageUrl));
    const ortId = extractOrtifiedId(html);
    const kpId = extractKpId(html);

    if (!ortId && !kpId) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const col = await loadCollapsEmbed(
      ortId,
      kpId,
      se.season,
      se.episode
    );

    if (!col.hls || !isHttp(col.hls)) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const headers = {
      "User-Agent": UA,
      Referer: "https://api.delivembd.ws/",
      Origin: "https://api.delivembd.ws",
    };

    // Russian voice labels only
    let voices = [];
    for (let i = 0; i < (col.names || []).length; i++) {
      const n = col.names[i];
      if (isRussianName(n)) voices.push(n);
    }
    if (!voices.length) voices = ["Русский"];

    voices.sort(function (a, b) {
      return voiceRank(a) - voiceRank(b);
    });

    const quals = await expandHls(col.hls);
    const streams = [];
    const seen = {};

    // GidOnline-style: each voice × quality (master URL keeps all audio; default = first Russian)
    for (let v = 0; v < voices.length; v++) {
      const voice = voices[v];
      for (let q = 0; q < quals.length; q++) {
        const title =
          "Collaps · " +
          voice +
          (quals[q].quality !== "Auto" ? " · " + quals[q].quality : "");
        if (seen[title]) continue;
        seen[title] = true;
        streams.push({
          title: title,
          name: title,
          streamUrl: forceHttps(quals[q].url),
          headers: headers,
        });
      }
    }

    // Prefer HDRezka / Дубляж + higher quality first
    streams.sort(function (a, b) {
      const ra = voiceRank(a.title);
      const rb = voiceRank(b.title);
      if (ra !== rb) return ra - rb;
      const order = { "1080p": 0, "720p": 1, "480p": 2, Auto: 3 };
      const qa = (a.title.match(/(1080|720|480)p|Auto/) || ["Auto"])[0];
      const qb = (b.title.match(/(1080|720|480)p|Auto/) || ["Auto"])[0];
      return (order[qa] != null ? order[qa] : 9) -
        (order[qb] != null ? order[qb] : 9);
    });

    return JSON.stringify({
      streams: streams.slice(0, 20),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
