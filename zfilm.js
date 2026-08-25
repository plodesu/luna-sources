/**
 * ZFilm-HD – Sora / Luna
 * Prefer Плеер 6 streams
 * v1.0.0
 */
const MIRRORS = [
  "https://zfilm-hd.org",
  "https://ru7.zfilm-hd.com",
];

let baseUrl = MIRRORS[0];

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign(
    {
      "User-Agent": UA,
      "Accept-Language": "ru-RU,ru;q=0.9",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
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

function absUrl(u, base) {
  base = base || baseUrl;
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return base + u;
  if (u.indexOf("http") !== 0) return base + "/" + u;
  return u;
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

/* ---- search ---- */

function parseCards(html, mirror) {
  const out = [];
  const seen = {};
  // shortstory / item cards
  const blocks = html.split(/class=["'][^"']*(?:shortstory|movie-item|item|thumb)[^"']*["']/i);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const hm = b.match(/href=["']([^"']+\.html)["']/i);
    if (!hm) continue;
    const href = absUrl(hm[1], mirror);
    if (seen[href]) continue;
    if (!/\.html/i.test(href)) continue;
    // skip nav
    if (/\/(films|serials|multfilms|cartoons)\/?$/i.test(href.replace(mirror, ""))) continue;
    seen[href] = true;

    let title = "";
    const tm =
      b.match(/class=["'][^"']*(?:title|name|heading)[^"']*["'][^>]*>([^<]+)/i) ||
      b.match(/alt=["']([^"']+)["']/i) ||
      b.match(/title=["']([^"']+)["']/i);
    if (tm) title = tm[1].trim();
    if (!title || title.length < 2) continue;

    let image = "";
    const im = b.match(/(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    if (im) image = absUrl(im[1], mirror);

    out.push({ title: title, image: image, href: href });
    if (out.length >= 20) break;
  }

  // fallback: any film-like links
  if (!out.length) {
    const re = /href=["']([^"']*\/\d+-[^"']+\.html)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const href = absUrl(m[1], mirror);
      if (seen[href]) continue;
      seen[href] = true;
      const slug = href.split("/").pop().replace(/\.html$/, "").replace(/^\d+-/, "").replace(/-/g, " ");
      out.push({ title: slug, image: "", href: href });
      if (out.length >= 20) break;
    }
  }
  return out;
}

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return JSON.stringify([]);

    for (let mi = 0; mi < MIRRORS.length; mi++) {
      const mirror = MIRRORS[mi];
      let html = "";

      // POST search (DLE)
      try {
        const body =
          "do=search&subaction=search&story=" + encodeURIComponent(q);
        html = await getText(
          await soraFetch(mirror + "/", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: mirror + "/",
              Origin: mirror,
            },
            body: body,
          })
        );
      } catch (e) {}

      // GET search
      if (!html || html.length < 500 || /502|503|404/.test(html.slice(0, 200))) {
        try {
          html = await getText(
            await soraFetch(
              mirror +
                "/index.php?do=search&subaction=search&story=" +
                encodeURIComponent(q),
              { headers: { Referer: mirror + "/" } }
            )
          );
        } catch (e) {}
      }

      if (!html || html.length < 500) continue;
      if (/502 Bad Gateway|503 Service/i.test(html.slice(0, 400))) continue;

      const items = parseCards(html, mirror);
      if (items.length) {
        baseUrl = mirror;
        return JSON.stringify(items);
      }
    }
    return JSON.stringify([]);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    for (let i = 0; i < MIRRORS.length; i++) {
      if (pageUrl.indexOf(MIRRORS[i].replace(/^https?:\/\//, "")) !== -1) {
        baseUrl = MIRRORS[i];
        break;
      }
    }
    const html = await getText(await soraFetch(pageUrl));
    let description = "N/A";
    const dm =
      html.match(/class=["'][^"']*full-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i) ||
      html.match(/name=["']description["'][^>]*content=["']([^"']+)/i);
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
    const html = await getText(await soraFetch(pageUrl));
    const eps = [];
    const seen = {};

    const re =
      /data-(?:season|s)=["']?(\d+)["']?[^>]*data-(?:episode|e|seria)=["']?(\d+)["']?/gi;
    let m;
    while ((m = re.exec(html))) {
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

/* ---- players: prefer Плеер 6 ---- */

function extractPlayerEntries(html) {
  const players = [];

  // pattern: tabs / links labeled Плеер N with data-src or nearby iframe
  const tabRe =
    /(?:data-(?:src|url|iframe|file)=["']([^"']+)["'][^>]*>[\s\S]{0,80}?плеер\s*(\d+)|плеер\s*(\d+)[\s\S]{0,120}?data-(?:src|url|iframe|file)=["']([^"']+)["']|плеер\s*(\d+)[\s\S]{0,200}?<iframe[^>]+src=["']([^"']+)["'])/gi;
  let m;
  while ((m = tabRe.exec(html))) {
    const num = m[2] || m[3] || m[5];
    const src = m[1] || m[4] || m[6];
    if (src && isHttp(absUrl(src))) {
      players.push({ num: parseInt(num, 10) || 0, url: absUrl(src), label: "Плеер " + num });
    }
  }

  // li / button with плеер N
  const liRe =
    /<(?:li|div|a|span|button)[^>]*(?:data-(?:id|n|num)=["']?(\d+)["']?)?[^>]*>[\s\S]*?плеер\s*(\d+)[\s\S]*?<\/(?:li|div|a|span|button)>/gi;
  while ((m = liRe.exec(html))) {
    const num = parseInt(m[2] || m[1], 10);
    const block = m[0];
    const sm =
      block.match(/data-(?:src|url|iframe|file)=["']([^"']+)["']/i) ||
      block.match(/href=["'](https?:\/\/[^"']+)["']/i);
    if (sm) {
      players.push({ num: num, url: absUrl(sm[1]), label: "Плеер " + num });
    }
  }

  // all iframes as numbered fallback
  const iframes = [];
  const ifr = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = ifr.exec(html))) {
    const u = absUrl(m[1]);
    if (isHttp(u) && iframes.indexOf(u) === -1) iframes.push(u);
  }
  for (let i = 0; i < iframes.length; i++) {
    const exists = players.some(function (p) {
      return p.url === iframes[i];
    });
    if (!exists) {
      players.push({ num: i + 1, url: iframes[i], label: "Плеер " + (i + 1) });
    }
  }

  // data-src embeds without label
  const ds = /data-(?:src|url)=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = ds.exec(html))) {
    const u = absUrl(m[1]);
    if (!isHttp(u)) continue;
    const exists = players.some(function (p) {
      return p.url === u;
    });
    if (!exists) {
      players.push({ num: players.length + 1, url: u, label: "Embed " + (players.length + 1) });
    }
  }

  return players;
}

function pickPlayer6(players) {
  // exact num 6
  for (let i = 0; i < players.length; i++) {
    if (players[i].num === 6) return [players[i]];
  }
  // label contains 6
  for (let i = 0; i < players.length; i++) {
    if (/плеер\s*6\b/i.test(players[i].label)) return [players[i]];
  }
  // 6th in list (index 5)
  if (players.length >= 6) return [players[5]];
  // fallback: all (so something plays)
  return players;
}

function collectDirect(html) {
  const out = [];
  const re = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1].replace(/[),;]+$/, "");
    if (out.indexOf(u) === -1) out.push(u);
  }
  const re2 = /file\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = re2.exec(html))) {
    if (out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  // playerjs / apl JSON
  const re3 = /["']file["']\s*:\s*["']([^"']+)["']/gi;
  while ((m = re3.exec(html))) {
    if (isHttp(m[1]) && out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  return out;
}

async function resolveEmbed(embedUrl, label) {
  const streams = [];
  try {
    const html = await getText(
      await soraFetch(embedUrl, {
        headers: { Referer: baseUrl + "/", Accept: "*/*" },
      })
    );
    if (!html) return streams;
    const directs = collectDirect(html);
    for (let i = 0; i < directs.length; i++) {
      streams.push({
        title: label + " · " + (directs[i].indexOf("m3u8") !== -1 ? "HLS" : "MP4"),
        streamUrl: directs[i],
        headers: { "User-Agent": UA, Referer: embedUrl },
      });
    }
    // one level nested iframe
    const nested = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (nested && !streams.length) {
      const nurl = absUrl(nested[1]);
      if (isHttp(nurl) && nurl !== embedUrl) {
        const more = await resolveEmbed(nurl, label);
        for (let j = 0; j < more.length; j++) streams.push(more[j]);
      }
    }
  } catch (e) {}
  return streams;
}

async function extractStreamUrl(url) {
  try {
    const pageUrl = String(url).split("?")[0];
    for (let i = 0; i < MIRRORS.length; i++) {
      if (pageUrl.indexOf(MIRRORS[i].replace(/^https?:\/\//, "")) !== -1) {
        baseUrl = MIRRORS[i];
        break;
      }
    }

    const html = await getText(
      await soraFetch(pageUrl, { headers: { Referer: baseUrl + "/" } })
    );
    if (!html || html.length < 300 || /502 Bad Gateway/i.test(html.slice(0, 300))) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    let players = extractPlayerEntries(html);
    let chosen = pickPlayer6(players);

    // if only fallback empty, try all
    if (!chosen.length) chosen = players;

    const streams = [];
    for (let i = 0; i < chosen.length; i++) {
      const p = chosen[i];
      const more = await resolveEmbed(p.url, p.label || "Плеер 6");
      for (let j = 0; j < more.length; j++) streams.push(more[j]);
    }

    // last resort: any direct on page
    if (!streams.length) {
      const d = collectDirect(html);
      for (let i = 0; i < d.length; i++) {
        streams.push({
          title: "Direct",
          streamUrl: d[i],
          headers: { "User-Agent": UA, Referer: pageUrl },
        });
      }
    }

    const uniq = [];
    const seen = {};
    for (let i = 0; i < streams.length; i++) {
      if (!isHttp(streams[i].streamUrl)) continue;
      const k = streams[i].streamUrl.slice(0, 140);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(streams[i]);
    }

    return JSON.stringify({ streams: uniq.slice(0, 12), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
