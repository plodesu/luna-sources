/**
 * HDRezka – Sora / Luna
 * Fixed titles + posters (no raw img tags)
 * Mirrors: rezka.fi, hdrezka.me, …
 * v2.1.0
 */
const MIRRORS = [
  "https://rezka.fi",
  "https://hdrezka.me",
  "https://hdrezka.ag",
  "https://rezka.ag",
  "https://hdrezka.tv",
];

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let BASE = MIRRORS[0];

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
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

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  // strip accidental HTML
  u = u.replace(/^img\s+src=["']/i, "").replace(/["']$/, "");
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return (base || BASE) + u;
  if (u.indexOf("http") !== 0) return (base || BASE) + "/" + u;
  return u;
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function isImageUrl(u) {
  return isHttp(u) && !/<img/i.test(u) && /\.(jpg|jpeg|png|webp|gif)/i.test(u);
}

async function pickMirror() {
  for (let i = 0; i < MIRRORS.length; i++) {
    try {
      const t = await getText(
        await soraFetch(MIRRORS[i] + "/", {
          headers: { Accept: "text/html" },
        })
      );
      if (t && t.length > 500 && !/ошибка доступа|access denied|just a moment/i.test(t.slice(0, 400))) {
        BASE = MIRRORS[i];
        return BASE;
      }
    } catch (e) {}
  }
  BASE = MIRRORS[0];
  return BASE;
}

/* ---- clearTrash (HDRezka stream decode) ---- */

function clearTrash(data) {
  if (!data) return "";
  try {
    const trashList = [
      "//_//",
      "QCMwc3RyaW5n",
      "QCMwc3RyaW5nXw==",
      "QEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBA",
    ];
    let s = String(data).replace("#h", "").split("//_//").join("");
    s = s.replace(/\\/g, "");
    // base64 pieces
    const parts = s.split(",");
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i];
      for (let j = 0; j < trashList.length; j++) {
        p = p.split(trashList[j]).join("");
      }
      try {
        if (typeof atob === "function") {
          out.push(decodeURIComponent(escape(atob(p))));
        } else {
          out.push(p);
        }
      } catch (e) {
        out.push(p);
      }
    }
    return out.join("");
  } catch (e) {
    return String(data || "");
  }
}

function parseQualityList(file) {
  const streams = [];
  if (!file) return streams;
  // 1080p [url], 720p [url], …
  const re = /(\d{3,4}p)\s*\[([^\]]+)\]/gi;
  let m;
  while ((m = re.exec(file))) {
    const urls = m[2].split(" or ").map(function (x) {
      return x.trim();
    });
    for (let i = 0; i < urls.length; i++) {
      if (isHttp(urls[i])) {
        streams.push({
          title: m[1],
          streamUrl: urls[i],
          headers: { "User-Agent": UA, Referer: BASE + "/" },
        });
      }
    }
  }
  if (!streams.length && isHttp(file)) {
    streams.push({
      title: "Stream",
      streamUrl: file,
      headers: { "User-Agent": UA, Referer: BASE + "/" },
    });
  }
  return streams;
}

/* ---- search ---- */

async function searchResults(keyword) {
  try {
    await pickMirror();
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    // live ajax search (titles + links)
    const ajax = await getText(
      await soraFetch(BASE + "/engine/ajax/search.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "text/html, */*",
          Referer: BASE + "/",
        },
        body: "q=" + encodeURIComponent(q),
      })
    );

    const results = [];
    const seen = {};

    // <a href="...html"><span class="enty">TITLE</span>
    const re =
      /<a[^>]+href=["']([^"']+\.html)["'][^>]*>[\s\S]*?<span class=["']enty["']>([^<]+)<\/span>/gi;
    let m;
    while ((m = re.exec(ajax || ""))) {
      const href = absUrl(m[1], BASE);
      if (seen[href]) continue;
      seen[href] = true;
      const title = m[2].replace(/\s+/g, " ").trim();
      if (title.length < 2) continue;
      results.push({ title: title, image: "", href: href });
      if (results.length >= 20) break;
    }

    // fallback: any film/series link with text
    if (!results.length && ajax) {
      const re2 =
        /href=["']((?:https?:\/\/[^"']+)?\/(?:films|series|cartoons|animation)\/[^"']+\.html)["'][^>]*>[\s\S]{0,200}?<span[^>]*class=["']enty["'][^>]*>([^<]+)/gi;
      while ((m = re2.exec(ajax))) {
        const href = absUrl(m[1], BASE);
        if (seen[href]) continue;
        seen[href] = true;
        results.push({
          title: m[2].replace(/\s+/g, " ").trim(),
          image: "",
          href: href,
        });
        if (results.length >= 20) break;
      }
    }

    // fill posters from detail pages (first 8)
    for (let i = 0; i < Math.min(results.length, 8); i++) {
      try {
        const html = await getText(await soraFetch(results[i].href));
        if (!html || /Вход|ошибка доступа/i.test(html.slice(0, 300))) continue;
        const og =
          html.match(
            /property=["']og:image["'][^>]*content=["']([^"']+)["']/i
          ) ||
          html.match(
            /content=["']([^"']+)["'][^>]*property=["']og:image["']/i
          ) ||
          html.match(
            /(?:src|data-src)=["'](https?:\/\/static\.[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
          );
        if (og && isImageUrl(og[1])) {
          results[i].image = og[1];
        }
      } catch (e) {}
    }

    // never return raw HTML as image/title
    for (let i = 0; i < results.length; i++) {
      if (!isImageUrl(results[i].image)) results[i].image = "";
      results[i].title = String(results[i].title || "")
        .replace(/<[^>]+>/g, "")
        .replace(/img\s+src=.*/i, "")
        .trim();
    }

    return JSON.stringify(results.filter(function (r) {
      return r.title && r.href;
    }));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    await pickMirror();
    let pageUrl = String(url).split("?")[0];
    // rewrite host to current BASE
    pageUrl = pageUrl.replace(/^https?:\/\/[^/]+/, BASE);
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/class=["']b-post__description_text["'][^>]*>([\s\S]*?)<\//i);
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
    await pickMirror();
    let pageUrl = String(url).split("?")[0].replace(/^https?:\/\/[^/]+/, BASE);
    const html = await getText(await soraFetch(pageUrl));

    // series: seasons / episodes from player init
    const eps = [];
    const seen = {};

    // data-id / seasons in select
    const seasonBlocks =
      html.match(/b-simple_episodes__list[\s\S]*?<\/ul>/gi) || [];
    if (seasonBlocks.length) {
      for (let s = 0; s < seasonBlocks.length; s++) {
        const block = seasonBlocks[s];
        const re = /data-id=["'](\d+)["'][^>]*data-season_id=["'](\d+)["'][^>]*data-episode_id=["'](\d+)["']/gi;
        let m;
        while ((m = re.exec(block))) {
          const sn = +m[2];
          const en = +m[3];
          const k = sn + "-" + en;
          if (seen[k]) continue;
          seen[k] = true;
          eps.push({
            href: pageUrl + "?s=" + sn + "&e=" + en,
            number: en,
            season: sn,
            title: "S" + sn + "E" + en,
          });
        }
      }
    }

    // alternate pattern
    if (!eps.length) {
      const re2 =
        /data-season_id=["'](\d+)["'][^>]*data-episode_id=["'](\d+)["']/gi;
      let m;
      while ((m = re2.exec(html))) {
        const sn = +m[1];
        const en = +m[2];
        const k = sn + "-" + en;
        if (seen[k]) continue;
        seen[k] = true;
        eps.push({
          href: pageUrl + "?s=" + sn + "&e=" + en,
          number: en,
          season: sn,
          title: "S" + sn + "E" + en,
        });
      }
    }

    eps.sort(function (a, b) {
      return a.season - b.season || a.number - b.number;
    });

    if (!eps.length) {
      eps.push({
        href: pageUrl,
        number: 1,
        season: 1,
        title: "Смотреть",
      });
    }
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

async function extractStreamUrl(url) {
  try {
    await pickMirror();
    let pageUrl = String(url).split("?")[0].replace(/^https?:\/\/[^/]+/, BASE);
    const qs = String(url).indexOf("?") >= 0 ? String(url).split("?")[1] : "";
    const sMatch = qs.match(/(?:^|&)s=(\d+)/);
    const eMatch = qs.match(/(?:^|&)e=(\d+)/);
    const season = sMatch ? sMatch[1] : null;
    const episode = eMatch ? eMatch[1] : null;

    const html = await getText(await soraFetch(pageUrl));
    if (!html || /Вход|ошибка доступа|access denied/i.test(html.slice(0, 400))) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    // post id
    const idM =
      html.match(/data-id=["'](\d+)["']/) ||
      html.match(/\/(?:films|series|cartoons)\/[^\/]+\/(\d+)-/);
    const postId = idM ? idM[1] : null;

    // translators (prefer Russian)
    const translators = [];
    const trRe =
      /data-translator_id=["'](\d+)["'][^>]*>([^<]{2,80})</gi;
    let tm;
    while ((tm = trRe.exec(html))) {
      translators.push({
        id: tm[1],
        name: tm[2].replace(/\s+/g, " ").trim(),
      });
    }
    // sort: russian names first
    translators.sort(function (a, b) {
      const ar = /рус|дубляж|lostfilm|hdrezka|профессиональн/i.test(a.name)
        ? 0
        : 1;
      const br = /рус|дубляж|lostfilm|hdrezka|профессиональн/i.test(b.name)
        ? 0
        : 1;
      return ar - br;
    });

    const streams = [];
    const tried = {};

    async function fetchCdn(translatorId) {
      const bodyParts = [
        "id=" + encodeURIComponent(postId),
        "translator_id=" + encodeURIComponent(translatorId),
      ];
      if (season && episode) {
        bodyParts.push("season=" + season);
        bodyParts.push("episode=" + episode);
      } else {
        bodyParts.push("is_camrip=0");
        bodyParts.push("is_ads=0");
        bodyParts.push("is_director=0");
      }
      bodyParts.push("favs=");
      bodyParts.push("action=" + (season ? "get_stream" : "get_movie"));

      const resp = await getText(
        await soraFetch(BASE + "/ajax/get_cdn_series/?t=" + Date.now(), {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json, text/javascript, */*",
            Referer: pageUrl,
            Origin: BASE,
          },
          body: bodyParts.join("&"),
        })
      );
      if (!resp) return;
      let json = null;
      try {
        json = JSON.parse(resp);
      } catch (e) {
        return;
      }
      if (!json) return;
      let file = json.url || json.file || "";
      if (json.url && typeof json.url === "string" && json.url.indexOf("#") === 0) {
        file = clearTrash(json.url);
      } else if (typeof file === "string" && file.indexOf("#h") === 0) {
        file = clearTrash(file);
      }
      const list = parseQualityList(file);
      for (let i = 0; i < list.length; i++) {
        list[i].title =
          (translators.find(function (t) {
            return t.id === translatorId;
          }) || { name: "Player" }).name +
          " · " +
          list[i].title;
        streams.push(list[i]);
      }
    }

    if (postId) {
      const list =
        translators.length > 0
          ? translators.slice(0, 5)
          : [{ id: "1", name: "Default" }];
      for (let i = 0; i < list.length; i++) {
        if (tried[list[i].id]) continue;
        tried[list[i].id] = true;
        await fetchCdn(list[i].id);
        if (streams.length) break;
      }
    }

    // also try initCDNSeriesEvents / movie encoded urls on page
    if (!streams.length) {
      const fileM = html.match(/file:\s*["']([^"']+)["']/);
      if (fileM) {
        let f = fileM[1];
        if (f.indexOf("#") === 0 || f.indexOf("#h") === 0) f = clearTrash(f);
        const list = parseQualityList(f);
        for (let i = 0; i < list.length; i++) streams.push(list[i]);
      }
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

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
