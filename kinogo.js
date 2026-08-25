/**
 * Kinogo – Sora / Luna
 * Search + posters + multi-player (Collaps / Alloha) + series
 * Mirrors: kinogo.online, kinogo.sh, …
 * v1.0.0
 */
const MIRRORS = [
  "https://kinogo.online",
  "https://kinogo.sh",
  "https://kinogo.ac",
  "https://kinogo.la",
];

const ALLOHA_API = "https://api.apbugall.org/";
const ALLOHA_TOKEN = "60b252fdcd2f53e8492fca2f44e8c5";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let BASE = MIRRORS[0];

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9",
      Accept: "text/html,application/json,*/*",
      Referer: BASE + "/",
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

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return (base || BASE) + u;
  return u;
}

function cleanQuery(keyword) {
  return String(keyword || "")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\bсезон[а]?\s*\d+\b/gi, " ")
    .replace(/\bсери[яи]\s*\d+/gi, " ")
    .replace(/\bTV\s*Show\b/gi, " ")
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

async function pickMirror() {
  for (let i = 0; i < MIRRORS.length; i++) {
    try {
      const t = await getText(
        await soraFetch(MIRRORS[i] + "/", {
          headers: { Accept: "text/html" },
        })
      );
      if (
        t &&
        t.length > 2000 &&
        !/just a moment|verify you are human|cf-browser-verification/i.test(
          t.slice(0, 800)
        )
      ) {
        BASE = MIRRORS[i];
        return BASE;
      }
    } catch (e) {}
  }
  BASE = MIRRORS[1] || MIRRORS[0];
  return BASE;
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    await pickMirror();
    const cleaned = cleanQuery(keyword);
    if (!cleaned) return JSON.stringify([]);

    const variants = [cleaned];
    const noThe = cleaned.replace(/^the\s+/i, "").trim();
    if (noThe && noThe !== cleaned) variants.push(noThe);
    const parts = cleaned.split(/\s+/).filter(function (w) {
      return w.length > 3;
    });
    if (parts.length > 1) variants.push(parts[parts.length - 1]);

    const results = [];
    const seen = {};

    for (let v = 0; v < variants.length; v++) {
      const q = variants[v];
      const html = await getText(
        await soraFetch(BASE + "/index.php?do=search", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            Referer: BASE + "/",
          },
          body:
            "do=search&subaction=search&story=" + encodeURIComponent(q),
        })
      );
      if (!html) continue;

      const arts = html.split(/<article class="short"/i);
      for (let i = 1; i < arts.length; i++) {
        const a = arts[i];
        const tm = a.match(
          /<h2>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i
        );
        if (!tm) continue;
        const href = absUrl(tm[1], BASE);
        if (seen[href]) continue;
        seen[href] = true;
        const title = tm[2].replace(/\s+/g, " ").trim();
        if (title.length < 2) continue;

        let image = "";
        const im = a.match(
          /(?:src|data-src)=["']([^"']*\/uploads\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
        );
        if (im) image = absUrl(im[1], BASE);

        const score = titleScore(cleaned, title);
        results.push({
          title: title,
          image: image,
          href: href,
          _score: score,
        });
      }
    }

    results.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
    const best = results.length ? results[0]._score : 0;
    const filtered = results.filter(function (r) {
      if (best >= 55) return r._score >= 25;
      return true;
    });

    return JSON.stringify(
      filtered.slice(0, 20).map(function (r) {
        return { title: r.title, image: r.image || "", href: r.href };
      })
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    await pickMirror();
    let pageUrl = String(url).split("?")[0].split("#")[0];
    pageUrl = pageUrl.replace(/^https?:\/\/[^/]+/, BASE);
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

function parsePlayers(html) {
  const list = [];
  const re =
    /data-player=["']([^"']+)["'][^>]*>([^<]*)/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    let src = absUrl(m[1], BASE);
    const name = (m[2] || "").replace(/\s+/g, " ").trim() || "Плеер";
    if (/трейлер|trailer/i.test(name) || /trailer/i.test(src)) continue;
    list.push({ name: name, url: src });
  }
  if (!list.length) {
    const iframe = (html || "").match(
      /<iframe[^>]+src=["']([^"']+)["']/i
    );
    if (iframe) {
      list.push({ name: "Плеер", url: absUrl(iframe[1], BASE) });
    }
  }
  return list;
}

function extractAllohaTokenMovie(html) {
  const m =
    html.match(/token_movie=([a-f0-9]+)/i) ||
    html.match(/token_movie["']?\s*[:=]\s*["']([a-f0-9]+)/i);
  return m ? m[1] : "";
}

function extractOrtifiedId(html) {
  const m = html.match(/api\.ortified\.ws\/embed\/movie\/(\d+)/i);
  return m ? m[1] : "";
}

async function fetchAlloha(tokenMovie) {
  if (!tokenMovie) return null;
  const url =
    ALLOHA_API +
    "?token=" +
    encodeURIComponent(ALLOHA_TOKEN) +
    "&token_movie=" +
    encodeURIComponent(tokenMovie);
  return await getJson(await soraFetch(url, { headers: { Referer: BASE + "/" } }));
}

async function extractEpisodes(url) {
  try {
    await pickMirror();
    let pageUrl = String(url).split("?")[0].split("#")[0];
    pageUrl = pageUrl.replace(/^https?:\/\/[^/]+/, BASE);
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
          const season = data.seasons[seasons[i]];
          const episodes = season.episodes || {};
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

    // title fallback: "1-5 сезон 1-16 серия"
    if (!eps.length) {
      const titleM = html.match(/<title>([^<]+)/i);
      const title = titleM ? titleM[1] : "";
      const sm = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сезон/i);
      const em = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сери/i);
      if (sm) {
        const s1 = +sm[1];
        const s2 = +sm[2];
        const eMax = em ? +em[2] : 20;
        for (let s = s1; s <= s2; s++) {
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

/* ---- streams ---- */

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

async function resolveEmbed(embedUrl, label) {
  const out = [];
  if (!embedUrl || !isHttp(embedUrl)) return out;
  if (/trailer/i.test(embedUrl)) return out;
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: {
          Referer: BASE + "/",
          Accept: "text/html,*/*",
        },
      })
    );
    if (!html) return out;
    if (
      /недоступен в вашем регионе|region not available|just a moment/i.test(
        html
      )
    ) {
      return out;
    }

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

    const fileM =
      html.match(/["']file["']\s*:\s*["']([^"']+)["']/i) ||
      html.match(/file:\s*["']([^"']+)["']/i);
    if (fileM) {
      let f = fileM[1];
      // quality list [720]url
      if (f.indexOf("[") >= 0) {
        const re = /\[(\d{3,4})\]([^,\[]+)/g;
        let m;
        while ((m = re.exec(f))) {
          const u = m[2].trim().split(/\s+or\s+/i)[0];
          if (isHttp(u)) {
            out.push({
              title: label + " · " + m[1] + "p",
              streamUrl: u,
              headers: { "User-Agent": UA, Referer: embedUrl },
            });
          }
        }
      } else if (isHttp(f)) {
        out.push({
          title: label,
          streamUrl: f,
          headers: { "User-Agent": UA, Referer: embedUrl },
        });
      }
    }

    // hls source
    const hls = html.match(
      /(?:hls|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i
    );
    if (hls) {
      out.push({
        title: label + " · HLS",
        streamUrl: hls[1],
        headers: { "User-Agent": UA, Referer: embedUrl },
      });
    }
  } catch (e) {}
  return out;
}

async function extractStreamUrl(url) {
  try {
    await pickMirror();
    const raw = String(url);
    let pageUrl = raw.split("?")[0].split("#")[0];
    pageUrl = pageUrl.replace(/^https?:\/\/[^/]+/, BASE);
    const se = parseSE(raw);

    const html = await getText(await soraFetch(pageUrl));
    const players = parsePlayers(html);
    const tokenMovie = extractAllohaTokenMovie(html);
    const streams = [];

    // Alloha: all translations for this episode
    if (tokenMovie) {
      const j = await fetchAlloha(tokenMovie);
      const data = j && j.data ? j.data : null;
      if (data) {
        // series path
        if (se.season && data.seasons && data.seasons[String(se.season)]) {
          const season = data.seasons[String(se.season)];
          const ep =
            season.episodes && season.episodes[String(se.episode || 1)];
          if (ep && ep.translation) {
            const ids = Object.keys(ep.translation);
            // prefer RU
            ids.sort(function (a, b) {
              const an = ep.translation[a].translation || "";
              const bn = ep.translation[b].translation || "";
              const ar = /дубл|lost|кубик|гоблин|кравец|проф|сериб/i.test(an)
                ? 0
                : 1;
              const br = /дубл|lost|кубик|гоблин|кравец|проф|сериб/i.test(bn)
                ? 0
                : 1;
              return ar - br;
            });
            for (let i = 0; i < Math.min(ids.length, 8); i++) {
              const tr = ep.translation[ids[i]];
              const label =
                "Alloha · " +
                (tr.translation || "Player") +
                (tr.quality ? " · " + tr.quality : "");
              const more = await resolveEmbed(tr.iframe, label);
              for (let k = 0; k < more.length; k++) streams.push(more[k]);
            }
          }
        } else if (data.translation_iframe) {
          // movie
          const ids = Object.keys(data.translation_iframe);
          ids.sort(function (a, b) {
            const an = data.translation_iframe[a].name || "";
            const bn = data.translation_iframe[b].name || "";
            const ar = /дубл|lost|кубик|гоблин|кравец|проф/i.test(an) ? 0 : 1;
            const br = /дубл|lost|кубик|гоблин|кравец|проф/i.test(bn) ? 0 : 1;
            return ar - br;
          });
          for (let i = 0; i < Math.min(ids.length, 8); i++) {
            const tr = data.translation_iframe[ids[i]];
            const label =
              "Alloha · " +
              (tr.name || "Player") +
              (tr.quality ? " · " + tr.quality : "");
            const more = await resolveEmbed(tr.iframe, label);
            for (let k = 0; k < more.length; k++) streams.push(more[k]);
          }
        }
      }
    }

    // Collaps + other page players
    for (let i = 0; i < players.length; i++) {
      let u = players[i].url;
      if (se.season && /ortified\.ws/i.test(u)) {
        u +=
          (u.indexOf("?") >= 0 ? "&" : "?") +
          "season=" +
          se.season +
          "&episode=" +
          (se.episode || 1);
      }
      const more = await resolveEmbed(
        u,
        players[i].name || "Плеер " + (i + 1)
      );
      for (let k = 0; k < more.length; k++) streams.push(more[k]);
    }

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
