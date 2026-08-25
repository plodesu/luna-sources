/**
 * 1Films (ru.1films.xyz) – Sora / Luna
 * Kinobadi player · multi-voice · multi-quality picker
 * Catalog ~114k titles · no hard Cloudflare
 * v1.0.0
 */
const baseUrl = "https://ru.1films.xyz";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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

function forceHttps(u) {
  return String(u || "").replace(/^http:\/\//i, "https://");
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
    .replace(/&/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\bсезон[а]?\s*\d+\b/gi, " ")
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
  return /eng\.?\s*original|\boriginal\b|оригинал|english|английск|\beng\b/i.test(
    String(name || "")
  );
}

function isRussianVoice(name) {
  const n = String(name || "");
  if (!n.trim() || isEnglish(n)) return false;
  if (/субтитр|subtitle|^sub\b/i.test(n)) return false;
  return true;
}

function voiceRank(name) {
  const n = String(name || "");
  if (/rezka|hdrezka/i.test(n) && /дубл/i.test(n)) return 0;
  if (/rezka|hdrezka/i.test(n)) return 1;
  if (/дубл|dubля/i.test(n)) return 2;
  if (/lostfilm|coldfilm|baibako|ideafilm|tvshows|ultradox|rudub|kerobtv|dragon|winmedia/i.test(n))
    return 3;
  return 4;
}

function qualityRank(q) {
  const m = String(q || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function preferredQualities(qualities) {
  if (!qualities || typeof qualities !== "object") return [];
  const order = ["1080p", "720p", "480p"];
  const out = [];
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    if (qualities[k] && isHttp(qualities[k])) {
      out.push({ quality: k, url: forceHttps(qualities[k]) });
    }
  }
  if (!out.length) {
    const keys = Object.keys(qualities);
    keys.sort(function (a, b) {
      return qualityRank(b) - qualityRank(a);
    });
    for (let i = 0; i < keys.length; i++) {
      if (isHttp(qualities[keys[i]])) {
        out.push({
          quality: keys[i],
          url: forceHttps(qualities[keys[i]]),
        });
      }
    }
  }
  return out;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    });
}

/** Extract data-sources JSON from kinobadi player HTML */
function parseDataSources(html) {
  if (!html) return null;
  const m = html.match(/data-sources="(\{[\s\S]*?)"\s*>/);
  if (!m) return null;
  try {
    const raw = decodeEntities(m[1]);
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function extractPlayerUrl(pageHtml) {
  if (!pageHtml) return "";
  let m =
    pageHtml.match(
      /<iframe[^>]+src=["'](https?:\/\/[^"']*kinobadi[^"']*player\.php[^"']*)["']/i
    ) ||
    pageHtml.match(
      /(https?:\/\/[^"'\s]*kinobadi[^"'\s]*player\.php\?[^"'\s]+)/i
    ) ||
    pageHtml.match(
      /(https?:\/\/[^"'\s]+\/player\/player\.php\?kp_id=\d+)/i
    );
  if (m) return absUrl(m[1] || m[0]);
  return "";
}

function extractKpId(html) {
  const m =
    (html || "").match(/kp_id=(\d+)/i) ||
    (html || "").match(/kinopoisk[^0-9]*(\d{4,})/i);
  return m ? m[1] : "";
}

async function loadPlayerData(pageHtml) {
  let playerUrl = extractPlayerUrl(pageHtml);
  if (!playerUrl) {
    const kp = extractKpId(pageHtml);
    if (kp) {
      playerUrl = "https://kinobadi.in/player/player.php?kp_id=" + kp;
    }
  }
  if (!playerUrl) return null;

  const html = await getText(
    await soraFetch(playerUrl, {
      headers: {
        Referer: baseUrl + "/",
        Accept: "text/html,*/*",
        "User-Agent": UA,
      },
    })
  );
  return parseDataSources(html);
}

/* ===================== search ===================== */

async function searchResults(keyword) {
  try {
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const html = await getText(
      await soraFetch(
        baseUrl + "/?s=" + encodeURIComponent(cleaned),
        {
          headers: {
            Referer: baseUrl + "/",
            Accept: "text/html,*/*",
          },
        }
      )
    );
    if (!html || html.length < 400) return JSON.stringify([]);

    const results = [];
    const seen = {};

    // WordPress entry-title links (often subdomain URLs)
    const re =
      /entry-title[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1]);
      const title = m[2].replace(/\s+/g, " ").trim();
      if (!href || !title || title.length < 2) continue;
      if (seen[href]) continue;
      seen[href] = true;

      let image = "";
      // look backwards in a window for poster
      const start = Math.max(0, m.index - 1200);
      const chunk = html.slice(start, m.index + 200);
      const im = chunk.match(
        /<img[^>]+(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
      );
      if (im) image = absUrl(im[1]);

      results.push({
        title: title,
        image: image,
        href: href,
        _score: titleScore(cleaned, title),
      });
    }

    // fallback: article cards
    if (!results.length) {
      const arts = html.split(/<article/i);
      for (let i = 1; i < arts.length; i++) {
        const a = arts[i];
        const tm = a.match(
          /<a[^>]+href=["']([^"']+)["'][^>]*>\s*<img[^>]+alt=["']([^"']+)["']/i
        );
        if (!tm) continue;
        const href = absUrl(tm[1]);
        if (seen[href]) continue;
        seen[href] = true;
        const title = tm[2].replace(/\s+/g, " ").trim();
        let image = "";
        const im = a.match(
          /(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
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
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)/i
      );
    if (dm) {
      description = decodeEntities(dm[1])
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
    const pageUrl = String(url).split("?")[0].split("#")[0];
    const html = await getText(await soraFetch(pageUrl));
    const data = await loadPlayerData(html);
    const eps = [];

    if (data && data.kind === "series" && data.seasons) {
      const seen = {};
      for (let s = 0; s < data.seasons.length; s++) {
        const season = data.seasons[s];
        const sid = parseInt(season.num, 10) || s + 1;
        const voices = season.voices || [];
        // collect unique episode numbers across voices
        for (let v = 0; v < voices.length; v++) {
          const episodes = voices[v].episodes || [];
          for (let e = 0; e < episodes.length; e++) {
            const eid = parseInt(episodes[e].num, 10) || e + 1;
            const key = sid + ":" + eid;
            if (seen[key]) continue;
            seen[key] = true;
            eps.push({
              href: pageUrl + "?s=" + sid + "&e=" + eid,
              number: eid,
              season: sid,
              title: "S" + sid + "E" + eid,
            });
          }
        }
      }
    }

    if (!eps.length) {
      // movie or failed parse
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
    return JSON.stringify(eps.slice(0, 500));
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
    const data = await loadPlayerData(html);
    if (!data) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    const streams = [];
    const seen = {};

    function add(title, streamUrl) {
      streamUrl = forceHttps(streamUrl);
      if (!isHttp(streamUrl)) return;
      title = String(title || "").trim();
      if (!title) return;
      const key = title.toLowerCase();
      if (seen[key] || seen[streamUrl]) return;
      seen[key] = true;
      seen[streamUrl] = true;
      streams.push({
        title: title,
        name: title,
        streamUrl: streamUrl,
        headers: {
          "User-Agent": UA,
          Referer: "https://kinobadi.in/",
        },
      });
    }

    if (data.kind === "movie" && data.voices) {
      const voices = data.voices.slice().filter(function (v) {
        return v && isRussianVoice(v.name);
      });
      voices.sort(function (a, b) {
        return voiceRank(a.name) - voiceRank(b.name);
      });

      for (let i = 0; i < voices.length; i++) {
        const voice = voices[i];
        const quals = preferredQualities(voice.qualities);
        for (let q = 0; q < quals.length; q++) {
          add(voice.name + " · " + quals[q].quality, quals[q].url);
        }
      }
    } else if (data.kind === "series" && data.seasons) {
      const seasonNum = se.season || 1;
      const episodeNum = se.episode || 1;
      let season = null;
      for (let s = 0; s < data.seasons.length; s++) {
        if (parseInt(data.seasons[s].num, 10) === seasonNum) {
          season = data.seasons[s];
          break;
        }
      }
      if (!season && data.seasons.length) season = data.seasons[0];

      if (season && season.voices) {
        const voices = season.voices.slice().filter(function (v) {
          return v && isRussianVoice(v.name);
        });
        voices.sort(function (a, b) {
          return voiceRank(a.name) - voiceRank(b.name);
        });

        for (let i = 0; i < voices.length; i++) {
          const voice = voices[i];
          const episodes = voice.episodes || [];
          let ep = null;
          for (let e = 0; e < episodes.length; e++) {
            if (parseInt(episodes[e].num, 10) === episodeNum) {
              ep = episodes[e];
              break;
            }
          }
          if (!ep && episodes.length) ep = episodes[0];
          if (!ep) continue;

          const quals = preferredQualities(ep.qualities);
          for (let q = 0; q < quals.length; q++) {
            add(
              voice.name + " · " + quals[q].quality,
              quals[q].url
            );
          }
        }
      }
    }

    // Prefer Rezka / higher quality first
    streams.sort(function (a, b) {
      const ra = voiceRank(a.title);
      const rb = voiceRank(b.title);
      if (ra !== rb) return ra - rb;
      const qa = qualityRank(a.title);
      const qb = qualityRank(b.title);
      return qb - qa;
    });

    return JSON.stringify({
      streams: streams.slice(0, 24),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
