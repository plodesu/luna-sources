/**
 * Kinogo.sh – Sora / Luna
 * GidOnline-style Select Server: one row per voice
 * v1.4.0
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
      const q = variants[v];
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
            "do=search&subaction=search&story=" + encodeURIComponent(q),
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

function parsePlayers(html) {
  const list = [];
  const re = /data-player=["']([^"']+)["'][^>]*>([^<]*)/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    const src = absUrl(m[1]);
    const name = (m[2] || "").replace(/\s+/g, " ").trim() || "Плеер";
    if (/трейлер|trailer/i.test(name) || /trailer/i.test(src)) continue;
    list.push({ name: name, url: src });
  }
  return list;
}

function extractAllohaTokenMovie(html) {
  const m = (html || "").match(/token_movie=([a-f0-9]{20,})/i);
  return m ? m[1] : "";
}

function extractKpId(html) {
  const m =
    (html || "").match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i) ||
    (html || "").match(/kp[_-]?id["']?\s*[:=]\s*["']?(\d+)/i) ||
    (html || "").match(/data-kp["']?\s*[:=]\s*["']?(\d+)/i) ||
    (html || "").match(/[?&]kp=(\d+)/i);
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
  return await getJson(
    await soraFetch(url, { headers: { Referer: baseUrl + "/" } })
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

    if (!eps.length) {
      const titleM = html.match(/<title>([^<]+)/i);
      const title = titleM ? titleM[1] : "";
      const sm = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сезон/i);
      const em = title.match(/(\d+)\s*[-–]\s*(\d+)\s*сери/i);
      if (sm) {
        const eMax = em ? +em[2] : 20;
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

/* ---- media from embed HTML ---- */

function collectMediaFromHtml(html, label, referer) {
  const out = [];
  if (!html) return out;
  if (/недоступен в вашем регионе|region not available/i.test(html)) {
    return out;
  }

  const headers = {
    "User-Agent": UA,
    Referer: referer || baseUrl + "/",
  };

  function push(title, url) {
    if (!isHttp(url)) return;
    url = url.replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
    out.push({ title: title, streamUrl: url, headers: headers });
  }

  // makePlayer → ONE hls + MANY audio names → one row per voice (GidOnline style)
  const mp = html.match(/makePlayer\(\{([\s\S]*?)\}\)\s*;/);
  if (mp) {
    const body = mp[1];
    const hls = (body.match(/["']?hls["']?\s*:\s*["'](https?:\/\/[^"']+)["']/) ||
      [])[1];
    const namesBlock =
      (body.match(/["']?names["']?\s*:\s*\[([^\]]*)\]/) || [])[1] || "";
    const names = [];
    const nm = namesBlock.match(/["']([^"']+)["']/g);
    if (nm) {
      for (let i = 0; i < nm.length; i++) {
        names.push(nm[i].replace(/["']/g, ""));
      }
    }

    if (hls && names.length > 0) {
      // Prefer Russian / studio dubs first in list order (keep API order, filter junk later)
      for (let i = 0; i < names.length; i++) {
        const n = names[i].trim();
        if (!n) continue;
        // GidOnline-like label
        push(label + " · " + n, hls);
      }
    } else if (hls) {
      push(label, hls);
    }

    // quality variants (different URLs)
    const qRe =
      /["'](\d{3,4})["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g;
    let qm;
    while ((qm = qRe.exec(body))) {
      if (hls && qm[2] === hls) continue;
      push(label + " · " + qm[1] + "p", qm[2]);
    }
  }

  // extra unique m3u8/mp4 not already covered
  const media = html.match(
    /https?:\/\/[^"'\s<>\\]+(?:\.m3u8|\.mp4)[^"'\s<>\\]*/gi
  );
  if (media) {
    const have = {};
    for (let i = 0; i < out.length; i++) have[out[i].streamUrl] = true;
    let n = 0;
    for (let i = 0; i < media.length; i++) {
      let u = media[i].replace(/\\u0026/g, "&").replace(/\\/g, "");
      if (/\.(jpg|png|gif|webp)/i.test(u)) continue;
      if (/preview|thumb|poster|sprite/i.test(u)) continue;
      if (have[u]) continue;
      have[u] = true;
      n++;
      push(label + " · stream " + n, u);
    }
  }

  const fileM =
    html.match(/["']file["']\s*:\s*["']([^"']+)["']/i) ||
    html.match(/file:\s*["']([^"']+)["']/i);
  if (fileM) {
    const f = fileM[1];
    if (f.indexOf("[") >= 0) {
      const re = /\[(\d{3,4}[^\]]*)\]([^,\[]+)/g;
      let m;
      while ((m = re.exec(f))) {
        const u = m[2].trim().split(/\s+or\s+/i)[0].trim();
        if (isHttp(u)) push(label + " · " + m[1], u);
      }
    } else if (isHttp(f)) {
      push(label, f);
    }
  }

  return out;
}

async function resolveEmbed(embedUrl, label) {
  if (!embedUrl || !isHttp(embedUrl)) return [];
  if (/trailer/i.test(embedUrl)) return [];
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
      })
    );
    return collectMediaFromHtml(html, label || "Stream", embedUrl);
  } catch (e) {
    return [];
  }
}

async function resolveCollaps(htmlPage, season, episode) {
  const out = [];
  const kp = extractKpId(htmlPage);
  const ortId = (
    (htmlPage || "").match(/ortified\.ws\/embed\/movie\/(\d+)/i) || []
  )[1];

  const urls = [];
  if (ortId) {
    let u = "https://api.ortified.ws/embed/movie/" + ortId;
    if (season) {
      u += "?season=" + season + "&episode=" + (episode || 1);
    }
    urls.push(u);
    urls.push("https://api.delivembd.ws/embed/movie/" + ortId);
  }
  if (kp) {
    urls.push("https://api.delivembd.ws/embed/kp/" + kp);
    urls.push("https://api.ortified.ws/embed/kp/" + kp);
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
      const got = collectMediaFromHtml(html, "Collaps", urls[i]);
      for (let j = 0; j < got.length; j++) out.push(got[j]);
      // stop once we have named voices
      if (out.length >= 2) break;
    } catch (e) {}
  }
  return out;
}

/* ---- streams ---- */

async function extractStreamUrl(url) {
  try {
    const raw = String(url);
    const pageUrl = raw.split("?")[0].split("#")[0];
    const se = parseSE(raw);
    const html = await getText(await soraFetch(pageUrl));
    const players = parsePlayers(html);
    const tokenMovie = extractAllohaTokenMovie(html);

    const streams = [];
    // Dedupe by TITLE+URL so same HLS can appear once per voice name
    const seen = {};

    function add(item) {
      if (!item || !isHttp(item.streamUrl)) return;
      const title = String(item.title || "Stream").trim();
      const key = title + "||" + item.streamUrl.slice(0, 120);
      if (seen[key]) return;
      seen[key] = true;
      streams.push({
        title: title,
        name: title,
        streamUrl: item.streamUrl,
        headers: item.headers || {
          "User-Agent": UA,
          Referer: baseUrl + "/",
        },
      });
    }

    // 1) Alloha – one row per translation (real separate streams when available)
    if (tokenMovie) {
      const j = await fetchAlloha(tokenMovie);
      const data = j && j.data ? j.data : null;

      async function fromMap(map) {
        const ids = Object.keys(map);
        ids.sort(function (a, b) {
          const an = map[a].translation || map[a].name || "";
          const bn = map[b].translation || map[b].name || "";
          const sc = function (n) {
            if (/дубл|lost|кубик|гоблин|кравец|hdrezka|проф/i.test(n))
              return 0;
            if (/субтитр|оригинал/i.test(n)) return 2;
            return 1;
          };
          return sc(an) - sc(bn);
        });
        for (let i = 0; i < ids.length && streams.length < 14; i++) {
          const tr = map[ids[i]];
          const voice = tr.translation || tr.name || "Alloha";
          const label = voice + (tr.quality ? " · " + tr.quality : "");
          if (!tr.iframe) continue;
          const more = await resolveEmbed(tr.iframe, label);
          for (let k = 0; k < more.length; k++) add(more[k]);
        }
      }

      if (data) {
        if (se.season && data.seasons && data.seasons[String(se.season)]) {
          const season = data.seasons[String(se.season)];
          const ep =
            season.episodes && season.episodes[String(se.episode || 1)];
          if (ep && ep.translation) await fromMap(ep.translation);
        } else if (data.translation_iframe) {
          await fromMap(data.translation_iframe);
        }
      }
    }

    // 2) Collaps – one Select Server row per voice name
    const collaps = await resolveCollaps(html, se.season, se.episode);
    for (let i = 0; i < collaps.length; i++) add(collaps[i]);

    // 3) Page players
    for (let i = 0; i < players.length; i++) {
      let u = players[i].url;
      if (se.season && /ortified|delivembd/i.test(u)) {
        u +=
          (u.indexOf("?") >= 0 ? "&" : "?") +
          "season=" +
          se.season +
          "&episode=" +
          (se.episode || 1);
      }
      const more = await resolveEmbed(
        u,
        players[i].name || "Плеер"
      );
      for (let k = 0; k < more.length; k++) add(more[k]);
    }

    // Sort: dubs first
    streams.sort(function (a, b) {
      const rank = function (t) {
        if (/дубл|hdrezka|winmedia|tvshows|dragon|lost|кубик|гоблин/i.test(t))
          return 0;
        if (/субтитр|оригинал/i.test(t)) return 2;
        return 1;
      };
      return rank(a.title) - rank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 15),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
