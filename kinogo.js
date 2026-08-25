/**
 * Kinogo.sh – Sora / Luna
 * Fast Collaps (delivembd) · no Alloha hang
 * v2.1.0
 */
const baseUrl = "https://kinogo.sh";
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

function isEnglish(name) {
  return /eng\.?\s*original|eng\.?original|original|оригинал|english|английск|\beng\b/i.test(
    String(name || "")
  );
}

function isRussianName(name) {
  const n = String(name || "");
  if (!n.trim() || isEnglish(n)) return false;
  if (/субтитр|subtitle/i.test(n)) return false;
  return (
    /дубл|русск|lostfilm|hdrezka|winmedia|tvshows|dragon|кубик|гоблин|кравец|студи|money|сериб|гаврилов/i.test(
      n
    ) || /[а-яё]/i.test(n)
  );
}

function voiceRank(name) {
  if (/дубл/i.test(name)) return 0;
  if (/hdrezka|winmedia|tvshows|dragon|lost/i.test(name)) return 1;
  return 2;
}

/* ---- search ---- */

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

/** Parse makePlayer({...}) without eval */
function parseMakePlayer(html) {
  const out = { hls: "", names: [], seasons: null };
  if (!html) return out;
  const m = html.match(/makePlayer\(\{([\s\S]*?)\}\)\s*;/);
  if (!m) {
    const h = html.match(/["']?hls["']?\s*:\s*["'](https?:\/\/[^"']+)["']/);
    if (h) out.hls = h[1];
    return out;
  }
  const body = m[1];
  const hls =
    body.match(/["']?hls["']?\s*:\s*["'](https?:\/\/[^"']+)["']/) ||
    body.match(/source\s*:\s*\{[^}]*["']?hls["']?\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (hls) out.hls = hls[1];

  const nb = body.match(/["']?names["']?\s*:\s*\[([^\]]*)\]/);
  if (nb) {
    const nm = nb[1].match(/["']([^"']+)["']/g);
    if (nm) {
      for (let i = 0; i < nm.length; i++) {
        out.names.push(nm[i].replace(/["']/g, "").trim());
      }
    }
  }

  // series: playlist.seasons – rough extract of episode hls if present
  if (/playlist\s*:/.test(body) && /seasons/.test(body)) {
    out.seasons = true;
  }
  return out;
}

async function loadCollapsEmbed(ortId, kpId, season, episode) {
  const urls = [];
  if (ortId) {
    let u = "https://api.delivembd.ws/embed/movie/" + ortId;
    if (season) u += "?season=" + season + "&episode=" + (episode || 1);
    urls.push(u);
    urls.push("https://api.ortified.ws/embed/movie/" + ortId + (season ? "?season=" + season + "&episode=" + (episode || 1) : ""));
  }
  if (kpId) {
    urls.push("https://api.delivembd.ws/embed/kp/" + kpId);
  }

  for (let i = 0; i < urls.length; i++) {
    try {
      const html = await getText(
        await soraFetch(urls[i], {
          headers: {
            Referer: baseUrl + "/",
            Accept: "text/html,*/*",
          },
        })
      );
      if (!html || html.length < 200) continue;
      if (/недоступен в вашем регионе/i.test(html) && !/makePlayer/i.test(html)) {
        continue;
      }
      const parsed = parseMakePlayer(html);
      if (parsed.hls) return parsed;

      // series: find episode hls in playlist block
      if (season && html.indexOf("playlist") !== -1) {
        const epBlock = html.match(
          new RegExp(
            "episode\\s*:\\s*" + (episode || 1) + "[\\s\\S]{0,400}?hls\\s*:\\s*[\"'](https?:\\/\\/[^\"']+)[\"']",
            "i"
          )
        );
        if (epBlock) {
          parsed.hls = epBlock[1];
          const nb = html.match(/["']?names["']?\s*:\s*\[([^\]]*)\]/);
          if (nb) {
            const nm = nb[1].match(/["']([^"']+)["']/g);
            if (nm) {
              parsed.names = nm.map(function (x) {
                return x.replace(/["']/g, "");
              });
            }
          }
          return parsed;
        }
      }
    } catch (e) {}
  }
  return { hls: "", names: [] };
}

async function extractEpisodes(url) {
  try {
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const ortId = extractOrtifiedId(html);
    const eps = [];

    if (ortId) {
      const col = await loadCollapsEmbed(ortId, "", null, null);
      // if movie-only, single episode
      if (col.hls && !col.seasons) {
        eps.push({
          href: pageUrl,
          number: 1,
          season: 1,
          title: "Смотреть",
        });
      }
    }

    // try parse seasons from page title / links
    if (!eps.length) {
      const titleM = html.match(/<title>([^<]+)/i);
      const title = titleM ? titleM[1] : "";
      const sm = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сезон/i);
      const em = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сери/i);
      if (sm) {
        const eMax = em ? +em[2] : 12;
        for (let s = +sm[1]; s <= +sm[2]; s++) {
          for (let e = 1; e <= eMax; e++) {
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

    const streams = [];
    const seen = {};

    function add(title) {
      const t = String(title).trim();
      if (!t || isEnglish(t)) return;
      const key = t.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      streams.push({
        title: t,
        name: t,
        streamUrl: col.hls,
        headers: headers,
      });
    }

    // Russian studio names from makePlayer
    let any = false;
    for (let i = 0; i < col.names.length; i++) {
      const n = col.names[i];
      if (!isRussianName(n)) continue;
      add("Collaps · " + n);
      any = true;
    }

    if (!any) {
      add("Collaps · Русский");
    }

    streams.sort(function (a, b) {
      return voiceRank(a.title) - voiceRank(b.title);
    });

    // Prefer Дубл. first in list so Luna may auto-pick it
    return JSON.stringify({
      streams: streams.slice(0, 8),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
