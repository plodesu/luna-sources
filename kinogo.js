/**
 * Kinogo.sh – Sora / Luna
 * Russian audio only · expand HLS audio tracks · no Eng.Original
 * v1.8.0
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

function absFromBase(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (isHttp(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") {
    const m = String(base || "").match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] + u : u;
  }
  // relative to playlist directory
  const dir = String(base || "").replace(/[^/]+$/, "");
  return dir + u;
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

function isEnglishOrOriginal(name) {
  const n = String(name || "").toLowerCase();
  return /eng\.?\s*original|eng\.?original|original|оригинал|english|английск|\beng\b|\ben\b|eng dub|eng sub/i.test(
    n
  );
}

function isRussianVoice(name) {
  const n = String(name || "").toLowerCase();
  if (!n.trim()) return false;
  if (isEnglishOrOriginal(n)) return false;
  if (/субтитр|subtitle|subs only|только субтитр|raw\b/i.test(n)) return false;
  if (/^украинск|українськ|ukrainian/i.test(n) && !/дубл|рус/i.test(n))
    return false;

  if (
    /дубл|русск|lost\s*film|lostfilm|кубик|гоблин|кравец|сериб|гаврилов|живов|hdrezka|winmedia|tvshows|dragon|money|студи|профессион|многоголос|закадр|плее?р|alloha|collaps/i.test(
      n
    )
  ) {
    return true;
  }
  if (/[а-яё]/i.test(n)) return true;
  return false;
}

function voiceRank(name) {
  if (/дубл|lost|кубик|гоблин|кравец|hdrezka|winmedia|tvshows|dragon|проф/i.test(name))
    return 0;
  return 1;
}

/* ---- search / details / episodes (unchanged structure) ---- */

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

function extractAllohaTokenMovie(html) {
  const m = (html || "").match(/token_movie=([a-f0-9]{20,})/i);
  return m ? m[1] : "";
}

function extractKpId(html) {
  const m =
    (html || "").match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i) ||
    (html || "").match(/kp[_-]?id["']?\s*[:=]\s*["']?(\d+)/i) ||
    (html || "").match(/data-kp["']?\s*[:=]\s*["']?(\d+)/i);
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

/**
 * Fetch master/media playlist and extract Russian AUDIO tracks with URI.
 * If tracks are muxed (no URI), returns [] — cannot force RU in Luna.
 */
async function expandRussianAudioFromHls(hlsUrl, prefix, headers) {
  const out = [];
  if (!isHttp(hlsUrl)) return out;
  try {
    const text = await getText(
      await soraFetch(hlsUrl, {
        headers: Object.assign(
          {
            "User-Agent": UA,
            Accept: "application/vnd.apple.mpegurl,*/*",
          },
          headers || {}
        ),
      })
    );
    if (!text || text.indexOf("#EXT") !== 0) return out;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^#EXT-X-MEDIA:/i.test(line)) continue;
      if (!/TYPE=AUDIO/i.test(line)) continue;

      const nameM = line.match(/NAME="([^"]+)"/i);
      const langM = line.match(/LANGUAGE="([^"]+)"/i);
      const uriM = line.match(/URI="([^"]+)"/i);
      const name = nameM ? nameM[1] : "";
      const lang = langM ? langM[1].toLowerCase() : "";

      if (isEnglishOrOriginal(name) || lang === "en" || lang === "eng") {
        continue;
      }
      const isRuLang = /^(ru|rus|rusian|russian)$/i.test(lang);
      if (!isRuLang && !isRussianVoice(name)) continue;
      if (!uriM) continue; // muxed into video — Luna can't switch

      const audioUrl = absFromBase(uriM[1], hlsUrl);
      if (!isHttp(audioUrl)) continue;

      // Prefer full media playlist if it's still a playlist pointing at video+audio;
      // many CDNs use URI as alternate audio only — then we still need video HLS.
      // Strategy: keep master HLS but only expose RU-labeled entries when URI exists
      // as a complete variant is rare; if URI ends with m3u8 use it as stream when
      // it looks like a full playlist (has EXT-X-STREAM-INF or EXTINF).
      out.push({
        title: (prefix ? prefix + " · " : "") + (name || "Русский"),
        streamUrl: hlsUrl, // video master
        // store preferred audio name in title; player may still default eng
        // if no separate full stream — try audio URI if it contains video
        _audioUri: audioUrl,
        headers: headers,
      });
    }

    // If we found RU audio URIs that are full playlists, prefer those as streamUrl
    for (let i = 0; i < out.length; i++) {
      const aurl = out[i]._audioUri;
      if (!aurl) continue;
      try {
        const at = await getText(
          await soraFetch(aurl, {
            headers: Object.assign(
              { "User-Agent": UA, Accept: "*/*" },
              headers || {}
            ),
          })
        );
        if (at && (/#EXT-X-STREAM-INF|#EXTINF/i.test(at) && /#EXTM3U/i.test(at))) {
          // if playlist has video segments or stream-inf, use it
          if (
            /#EXT-X-STREAM-INF|#EXT-X-MAP|TYPE=VIDEO|\.ts/i.test(at) ||
            at.split("\n").length > 5
          ) {
            out[i].streamUrl = aurl;
          }
        }
      } catch (e) {}
      delete out[i]._audioUri;
    }
  } catch (e) {}
  return out;
}

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
    if (isEnglishOrOriginal(title)) return;
    if (!isRussianVoice(title) && !/collaps|alloha|stream|плеер/i.test(title))
      return;
    url = url.replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
    out.push({ title: title, streamUrl: url, headers: headers, _expand: true });
  }

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
    if (hls) {
      // Only Russian names — do NOT add Eng.Original
      let added = 0;
      for (let i = 0; i < names.length; i++) {
        const n = names[i].trim();
        if (!n || isEnglishOrOriginal(n) || !isRussianVoice(n)) continue;
        push(label + " · " + n, hls);
        added++;
      }
      // if no named RU tracks, still queue HLS for expandRussianAudioFromHls
      if (!added) {
        out.push({
          title: label + " · Русский",
          streamUrl: hls,
          headers: headers,
          _expand: true,
        });
      }
    }
  }

  const media = html.match(
    /https?:\/\/[^"'\s<>\\]+(?:\.m3u8|\.mp4)[^"'\s<>\\]*/gi
  );
  if (media) {
    const have = {};
    for (let i = 0; i < out.length; i++) have[out[i].streamUrl] = true;
    for (let i = 0; i < media.length; i++) {
      let u = media[i].replace(/\\u0026/g, "&").replace(/\\/g, "");
      if (/\.(jpg|png|gif|webp)/i.test(u)) continue;
      if (/preview|thumb|poster|sprite/i.test(u)) continue;
      if (have[u]) continue;
      have[u] = true;
      if (!isRussianVoice(label) && !/collaps|alloha/i.test(label)) continue;
      push(label, u);
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
        headers: {
          Referer: baseUrl + "/",
          Origin: baseUrl,
          Accept: "text/html,*/*",
        },
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
          headers: { Referer: baseUrl + "/", Accept: "text/html,*/*" },
        })
      );
      const got = collectMediaFromHtml(html, "Collaps", urls[i]);
      for (let j = 0; j < got.length; j++) out.push(got[j]);
      if (out.length) break;
    } catch (e) {}
  }
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
      const title = String(item.title || "Stream").trim();
      if (isEnglishOrOriginal(title)) return;
      const key = title + "||" + item.streamUrl.slice(0, 140);
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

    // 1) Alloha Russian translations only
    if (tokenMovie) {
      const j = await fetchAlloha(tokenMovie);
      const data = j && j.data ? j.data : null;

      async function fromMap(map) {
        const ids = Object.keys(map);
        for (let i = 0; i < ids.length; i++) {
          const tr = map[ids[i]];
          const voice = tr.translation || tr.name || "";
          if (!isRussianVoice(voice) || isEnglishOrOriginal(voice)) continue;
          const label =
            "Alloha · " + voice + (tr.quality ? " · " + tr.quality : "");
          if (!tr.iframe) continue;
          const more = await resolveEmbed(tr.iframe, label);
          for (let k = 0; k < more.length; k++) {
            if (more[k]._expand) {
              const exp = await expandRussianAudioFromHls(
                more[k].streamUrl,
                label,
                more[k].headers
              );
              if (exp.length) {
                for (let e = 0; e < exp.length; e++) add(exp[e]);
              } else {
                add(more[k]);
              }
            } else {
              add(more[k]);
            }
          }
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

    // 2) Collaps fallback + HLS audio expand
    if (!streams.length) {
      const collaps = await resolveCollaps(html, se.season, se.episode);
      for (let i = 0; i < collaps.length; i++) {
        const c = collaps[i];
        if (isEnglishOrOriginal(c.title)) continue;
        const exp = await expandRussianAudioFromHls(
          c.streamUrl,
          c.title.replace(/\s*·\s*stream.*$/i, ""),
          c.headers
        );
        if (exp.length) {
          for (let e = 0; e < exp.length; e++) add(exp[e]);
        } else if (isRussianVoice(c.title)) {
          // same URL as Eng — skip listing fake choices
          // only add once under best RU title if we have no streams yet
          if (!streams.length) add(c);
        }
      }
    }

    streams.sort(function (a, b) {
      return voiceRank(a.title) - voiceRank(b.title);
    });

    return JSON.stringify({
      streams: streams.slice(0, 15),
      subtitles: "",
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
