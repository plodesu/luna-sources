/**
 * GidOnline.NET – Sora / Luna
 * v3.6.0 – correct posters + ranking + streams
 */
const baseUrl = "https://gidonline.net";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: baseUrl + "/",
  "Accept-Language": "ru-RU,ru;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const ALIASES = {
  "breaking bad": "Во все тяжкие",
  "better call saul": "Лучше звоните Солу",
  "game of thrones": "Игра престолов",
  "house of the dragon": "Дом дракона",
  "the witcher": "Ведьмак",
  witcher: "Ведьмак",
  "stranger things": "Очень странные дела",
  "the last of us": "Одни из нас",
  "the boys": "Пацаны",
  "the office": "Офис",
  friends: "Друзья",
  "the simpsons": "Симпсоны",
  simpsons: "Симпсоны",
  "spider-man": "Человек-паук",
  "spider man": "Человек-паук",
  spiderman: "Человек-паук",
  "человек паук": "Человек-паук",
  "brand new day": "Новый день",
  "новый день": "Человек-паук: Новый день",
  minions: "Миньоны",
  "minions & monsters": "Миньоны и монстры",
  "despicable me": "Гадкий я",
  reacher: "Ричер",
  mutiny: "Мятеж",
  naruto: "Наруто",
  "naruto shippuden": "Наруто: Ураганные хроники",
  "the rookie": "Новобранец",
  "one piece": "Ван Пис",
  "attack on titan": "Атака титанов",
  "demon slayer": "Клинок, рассекающий демонов",
  "jujutsu kaisen": "Магическая битва",
  "squid game": "Игра в кальмара",
  wednesday: "Уэнсдей",
  "the mandalorian": "Мандалорец",
  "house md": "Доктор Хаус",
  "house m.d.": "Доктор Хаус",
  lanterns: "Фонари",
  "green lantern": "Зелёный фонарь",
};

async function soraFetch(url, options) {
  options = options || {};
  const headers = Object.assign({}, defaultHeaders, options.headers || {});
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
  try {
    if (res && typeof res.json === "function") return await res.json();
    return JSON.parse(await getText(res));
  } catch (e) {
    return null;
  }
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
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
    .replace(/[Ss]\d+[Ee]\d+/g, "")
    .replace(/Season\s*\d+/gi, "")
    .replace(/Episode\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadAudio(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.indexOf("eng") !== -1 ||
    n.indexOf("original") !== -1 ||
    n.indexOf("оригинал") !== -1 ||
    n.indexOf("english") !== -1 ||
    n.indexOf("укр") !== -1
  );
}

function parseSE(url) {
  const s = (String(url).match(/[?&#]s=(\d+)/i) || [])[1];
  const e = (String(url).match(/[?&#]e=(\d+)/i) || [])[1];
  return { season: s ? +s : null, episode: e ? +e : null };
}

function buildQueries(keyword) {
  const base = cleanQuery(keyword);
  if (!base) return [];
  const q = [];
  const add = (x) => {
    x = String(x || "").replace(/\s+/g, " ").trim();
    if (x && q.indexOf(x) === -1) q.push(x);
  };
  add(base);
  add(base.replace(/\s+/g, "-"));
  add(base.replace(/-/g, " "));
  const low = base.toLowerCase();
  for (const k in ALIASES) {
    if (low === k || low.indexOf(k) !== -1) add(ALIASES[k]);
  }
  const w = base.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (w.length >= 2) {
    add(w[0] + " " + w[1]);
    add(w[0] + "-" + w[1]);
  }
  if (w.length >= 3) add(w.slice(0, 3).join(" "));
  return q.slice(0, 10);
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/-/g, " ")
    .replace(/[^\wа-я\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(query, title) {
  const q = norm(query);
  const t = norm(title);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.indexOf(q) !== -1) return 95;
  if (q.indexOf(t) !== -1 && t.length > 5) return 88;

  for (const k in ALIASES) {
    const ru = norm(ALIASES[k]);
    if ((q === k || q.indexOf(k) !== -1) && t.indexOf(ru) !== -1) return 96;
  }

  const qw = q.split(" ").filter((w) => w.length > 1);
  if (!qw.length) return 0;
  let hit = 0;
  for (let i = 0; i < qw.length; i++) {
    if (t.indexOf(qw[i]) !== -1) hit++;
  }
  // all words must matter for high score
  const ratio = hit / qw.length;
  if (ratio >= 1) return 92;
  if (ratio >= 0.75) return 75;
  if (ratio >= 0.5) return 55;
  if (ratio >= 0.34) return 35;
  return Math.round(ratio * 30);
}

/**
 * Parse each result card as one block so poster stays with its title.
 */
function parseSearchHtml(html, results, seen) {
  if (!html) return;

  // 1) article.short blocks (best)
  const reArticle =
    /<article[^>]*class="[^"]*short[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = reArticle.exec(html))) {
    const block = m[1];
    const hrefM =
      block.match(
        /href="((?:https?:\/\/gidonline\.net)?\/[a-z0-9\-]+\/\d+-[^"]+\.html)"/i
      ) ||
      block.match(/href="([^"]+\.html)"/i);
    const titleM =
      block.match(/class="[^"]*shortstory[^"]*"[^>]*title="([^"]+)"/i) ||
      block.match(/title="([^"]+)"[^>]*class="[^"]*shortstory/i) ||
      block.match(/title="([^"]+)"/i);
    if (!hrefM || !titleM) continue;
    const href = absUrl(hrefM[1]);
    const title = decodeHtml(titleM[1]);
    if (!href || !title || seen[href]) continue;
    seen[href] = true;
    let image = "";
    const imgM =
      block.match(/(?:data-src|src)="(\/uploads\/[^"]+)"/i) ||
      block.match(/(?:data-src|src)="(https?:\/\/[^"]*\/uploads\/[^"]+)"/i);
    if (imgM) image = absUrl(imgM[1]);
    results.push({ title, image, href });
  }

  // 2) shortstory anchors (if no articles)
  if (results.length < 3) {
    const reA =
      /<a[^>]*class="[^"]*shortstory[^"]*"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
    while ((m = reA.exec(html))) {
      const href = absUrl(m[1]);
      const title = decodeHtml(m[2]);
      if (!href || !title || seen[href] || href.indexOf(".html") === -1)
        continue;
      seen[href] = true;
      let image = "";
      const imgM = m[3].match(/(?:data-src|src)="(\/uploads\/[^"]+)"/i);
      if (imgM) image = absUrl(imgM[1]);
      results.push({ title, image, href });
    }
  }

  // 3) title+href shortstory without nested img — try sibling pattern
  if (results.length < 3) {
    const reB =
      /title="([^"]+)"[^>]*href="((?:https?:\/\/gidonline\.net)?\/[a-z0-9\-]+\/\d+-[^"]+\.html)"[^>]*class="[^"]*shortstory[^"]*"/gi;
    while ((m = reB.exec(html))) {
      const href = absUrl(m[2]);
      const title = decodeHtml(m[1]);
      if (!href || !title || seen[href]) continue;
      seen[href] = true;
      results.push({ title, image: "", href });
    }
  }
}

function push(out, title, url, headers) {
  if (!url) return;
  url = String(url).replace(/\\u0026/g, "&").replace(/\\\//g, "/").trim();
  if (!/^https?:\/\//i.test(url)) return;
  if (url.indexOf(".m3u8") === -1 && url.indexOf(".mp4") === -1) return;
  out.push({
    title: title || "Смотреть",
    streamUrl: url,
    headers: headers || {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://gidonline.net/",
    },
  });
}

function findEmbeds(html, host) {
  const out = [],
    seen = {};
  if (!html) return out;
  const re = new RegExp(
    "(?:data-src|src)=[\"']((?:https?:)?//" + host + "[^\"']+)[\"']",
    "gi"
  );
  let m;
  while ((m = re.exec(html))) {
    const s = absUrl(m[1].replace(/&amp;/g, "&"));
    if (s && !seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  }
  return out;
}

function parseOrtMovie(html, out) {
  if (!html || html.indexOf("seasons:") !== -1) return;
  let names = [];
  const am = html.match(/audio\s*:\s*\{\s*"names"\s*:\s*(\[[^\]]+\])/);
  if (am) {
    try {
      names = JSON.parse(am[1]);
    } catch (e) {}
  }
  let hls = null;
  const urls = html.match(/https?:\/\/[^"'\\\s]+master\.m3u8[^"'\\\s]*/g);
  if (urls) {
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i].replace(/\\u0026/g, "&");
      if (u.indexOf("interkh") !== -1 || u.indexOf("showvid") !== -1) {
        hls = u;
        break;
      }
    }
    if (!hls) hls = urls[0].replace(/\\u0026/g, "&");
  }
  if (!hls) {
    const hm = html.match(/hls\s*:\s*"([^"]+\.m3u8[^"]*)"/);
    if (hm) hls = hm[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }
  if (!hls) return;
  const ru = names.filter((n) => !isBadAudio(n));
  push(out, "Смотреть · " + (ru[0] || "Рус. дубляж"), hls, {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: "https://gidonline.net/",
  });
}

function parseOrtSeries(html, season, episode, out) {
  if (!html || html.indexOf("seasons:") === -1) return;
  const en = episode || 1;
  const re = new RegExp(
    '"episode"\\s*:\\s*"?' + en + '"?[\\s\\S]{0,2500}?"hls"\\s*:\\s*"([^"]+)"'
  );
  const m = String(html).match(re);
  if (!m) return;
  const hls = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  let names = [];
  const block = String(html).substring(m.index, m.index + 2500);
  const am = block.match(/"names"\s*:\s*(\[[^\]]*\])/);
  if (am) {
    try {
      names = JSON.parse(am[1]);
    } catch (e) {}
  }
  const ru = names.filter((n) => !isBadAudio(n));
  push(
    out,
    "Смотреть S" + (season || 1) + "E" + en + " · " + (ru[0] || "Рус. дубляж"),
    hls,
    {
      "User-Agent": defaultHeaders["User-Agent"],
      Referer: "https://gidonline.net/",
    }
  );
}

function listEps(html, pageUrl) {
  const eps = [],
    seen = {};
  if (!html || html.indexOf("seasons:") === -1) return eps;
  const parts = String(html).split(/"season"\s*:\s*/);
  for (let p = 1; p < parts.length; p++) {
    const sn = parseInt(parts[p], 10);
    if (!sn) continue;
    const re = /"episode"\s*:\s*"?(\d+)"?/g;
    let m;
    while ((m = re.exec(parts[p]))) {
      const en = +m[1];
      const key = sn + "-" + en;
      if (!en || seen[key]) continue;
      seen[key] = true;
      eps.push({
        href: pageUrl.split("?")[0] + "?s=" + sn + "&e=" + en,
        number: en,
        season: sn,
        title: "S" + sn + "E" + en,
      });
    }
  }
  eps.sort((a, b) => a.season - b.season || a.number - b.number);
  return eps;
}

function decodeCinemarFile(fileStr) {
  if (!fileStr || String(fileStr).indexOf("#2") !== 0) return null;
  try {
    let e = String(fileStr).substring(2);
    const dm = e.substring(0, 2);
    e = e.substring(2);
    const sep = String.fromCharCode(parseInt(dm, 10) || dm.charCodeAt(0));
    const parts = e.split(sep);
    let joined = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      const t = parseInt(p.slice(-1), 10);
      if (p.length > 32 && !isNaN(t))
        joined += p.substr(2 * t, p.length - 3 * t - 1) + p.substr(0, t);
      else joined += p;
    }
    const pad = joined.length % 4;
    if (pad) joined += "====".substr(0, 4 - pad);
    if (typeof atob !== "function") return null;
    const binary = atob(joined);
    let decoded = binary;
    try {
      decoded = decodeURIComponent(
        Array.prototype.map
          .call(binary, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch (err) {
      try {
        decoded = decodeURIComponent(escape(binary));
      } catch (e2) {}
    }
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

function extractCinemarOpts(html) {
  const idx = html.indexOf("Cinemar(");
  if (idx < 0) return null;
  let i = html.indexOf("{", idx),
    depth = 0,
    end = -1;
  for (let j = i; j < html.length && j < i + 200000; j++) {
    if (html[j] === "{") depth++;
    else if (html[j] === "}") {
      depth--;
      if (!depth) {
        end = j + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(html.substring(i, end));
  } catch (e) {
    return null;
  }
}

function collectLeaves(items, season, episode, out) {
  out = out || [];
  if (!items) return out;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.folder && it.folder.length) {
      const title = String(it.title || "");
      const num = (title.match(/(\d+)/) || [])[1];
      let ns = season,
        ne = episode;
      if (/сезон|season/i.test(title) && num) ns = +num;
      if (/сери|episode/i.test(title) && num) ne = +num;
      const idm = String(it.id || "").match(/s(\d+)e(\d+)/i);
      if (idm) {
        ns = +idm[1];
        ne = +idm[2];
      }
      collectLeaves(it.folder, ns, ne, out);
    } else if (it.data) {
      out.push({
        title: it.title || "Студия",
        data: it.data,
        season: season || 1,
        episode: episode || 1,
      });
    }
  }
  return out;
}

async function loadCinemar(dataStr) {
  try {
    const res = await soraFetch("https://cinemar.cc/api/playlist/load", {
      method: "POST",
      headers: {
        "User-Agent": defaultHeaders["User-Agent"],
        Referer: "https://cinemar.cc/",
        Origin: "https://cinemar.cc",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataStr),
    });
    const j = await getJson(res);
    if (!j) return null;
    const p = j.data && j.data.file ? j.data : j;
    return p && p.file ? String(p.file).replace(/\\u0026/g, "&") : null;
  } catch (e) {
    return null;
  }
}

async function extractCinemarStreams(embedHtml, season, episode, out) {
  const opts = extractCinemarOpts(embedHtml);
  if (!opts || !opts.file) return;
  const pl = decodeCinemarFile(opts.file);
  if (!pl) return;
  const leaves = collectLeaves(pl, null, null, []);
  const ts = season || 1,
    te = episode || 1;
  const hasSeries = leaves.some((x) => x.season > 1 || x.episode > 1);
  let cand = leaves.filter((L) => {
    if (!hasSeries && !season) return true;
    return L.season === ts && L.episode === te;
  });
  if (!cand.length) cand = leaves.slice(0, 5);
  cand = cand.filter((c) => !isBadAudio(c.title));
  const headers = {
    "User-Agent": defaultHeaders["User-Agent"],
    Referer: "https://cinemar.cc/",
    Origin: "https://cinemar.cc",
  };
  for (let i = 0; i < Math.min(cand.length, 5); i++) {
    const file = await loadCinemar(cand[i].data);
    if (!file) continue;
    const label = String(cand[i].title || "Студия")
      .replace(/<[^>]+>/g, "")
      .trim();
    push(out, "Плеер 2 · " + label, file, headers);
  }
}

async function searchResults(keyword) {
  try {
    const raw = String(keyword || "").trim();
    const queries = buildQueries(raw);
    if (!queries.length) return JSON.stringify([]);
    const results = [],
      seen = {};

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      try {
        const url =
          baseUrl +
          "/index.php?do=search&subaction=search&story=" +
          encodeURIComponent(q);
        parseSearchHtml(await getText(await soraFetch(url)), results, seen);
      } catch (e) {}
      if (results.length < 5) {
        try {
          const body =
            "do=search&subaction=search&story=" +
            encodeURIComponent(q) +
            "&titleonly=3";
          const r2 = await soraFetch(baseUrl + "/index.php?do=search", {
            method: "POST",
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: baseUrl + "/",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          });
          parseSearchHtml(await getText(r2), results, seen);
        } catch (e) {}
      }
      if (results.length >= 20) break;
    }

    const scored = results.map((r) => {
      let best = matchScore(raw, r.title);
      for (let i = 0; i < queries.length; i++)
        best = Math.max(best, matchScore(queries[i], r.title));
      return { r, score: best };
    });

    let filtered = scored.filter((x) => x.score >= 50);
    if (filtered.length < 3) filtered = scored.filter((x) => x.score >= 30);
    if (!filtered.length) filtered = scored;
    filtered.sort((a, b) => b.score - a.score);

    const out = filtered.slice(0, 15).map((x) => {
      let title = x.r.title;
      if (
        x.score >= 90 &&
        /[a-zA-Z]/.test(raw) &&
        !/[a-zA-Z]{3,}/.test(title)
      ) {
        title = cleanQuery(raw) + " — " + title;
      }
      return {
        title,
        image: x.r.image || "",
        href: x.r.href,
      };
    });

    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const html = await getText(await soraFetch(String(url).split("?")[0]));
    let description = "N/A";
    const dm = html.match(/name="description"\s+content="([^"]+)"/i);
    if (dm) description = decodeHtml(dm[1]).slice(0, 900);
    return JSON.stringify([{ description, aliases: "N/A", airdate: "N/A" }]);
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
    if (!html)
      return JSON.stringify([
        { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
      ]);
    const embeds = findEmbeds(html, "api\\.ortified\\.ws").concat(
      findEmbeds(html, "cinemar\\.cc")
    );
    for (let i = 0; i < embeds.length; i++) {
      try {
        const eh = await getText(
          await soraFetch(embeds[i], {
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: pageUrl,
            },
          })
        );
        if (/ortified/i.test(embeds[i])) {
          const eps = listEps(eh, pageUrl);
          if (eps.length > 1) return JSON.stringify(eps);
        } else {
          const opts = extractCinemarOpts(eh);
          if (opts && opts.file) {
            const pl = decodeCinemarFile(opts.file);
            if (pl) {
              const leaves = collectLeaves(pl, null, null, []);
              const seen = {},
                eps = [];
              for (let j = 0; j < leaves.length; j++) {
                const L = leaves[j];
                const key = L.season + "-" + L.episode;
                if (seen[key]) continue;
                seen[key] = true;
                eps.push({
                  href: pageUrl + "?s=" + L.season + "&e=" + L.episode,
                  number: L.episode,
                  season: L.season,
                  title: "S" + L.season + "E" + L.episode,
                });
              }
              if (eps.length > 1) {
                eps.sort((a, b) => a.season - b.season || a.number - b.number);
                return JSON.stringify(eps);
              }
            }
          }
        }
      } catch (e) {}
    }
    return JSON.stringify([
      { href: pageUrl, number: 1, season: 1, title: "Смотреть" },
    ]);
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
    const clean = String(url).split("#")[0];
    const se = parseSE(clean);
    const pageUrl = clean.split("?")[0];
    const html = await getText(await soraFetch(pageUrl));
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });
    const streams = [];

    const ort = findEmbeds(html, "api\\.ortified\\.ws");
    for (let i = 0; i < ort.length; i++) {
      try {
        const eh = await getText(
          await soraFetch(ort[i], {
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: pageUrl,
            },
          })
        );
        if (!eh || eh.length < 40) continue;
        const before = streams.length;
        parseOrtSeries(eh, se.season || 1, se.episode || 1, streams);
        if (streams.length === before) parseOrtMovie(eh, streams);
      } catch (e) {}
    }

    const cin = findEmbeds(html, "cinemar\\.cc");
    for (let i = 0; i < cin.length; i++) {
      try {
        const eh = await getText(
          await soraFetch(cin[i], {
            headers: {
              "User-Agent": defaultHeaders["User-Agent"],
              Referer: pageUrl,
            },
          })
        );
        if (!eh || eh.length < 40) continue;
        await extractCinemarStreams(
          eh,
          se.season || 1,
          se.episode || 1,
          streams
        );
      } catch (e) {}
    }

    const uniq = [],
      seen = {};
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!s || !s.streamUrl || isBadAudio(s.title)) continue;
      const k = s.streamUrl.slice(0, 100);
      if (seen[k]) continue;
      seen[k] = true;
      uniq.push(s);
    }
    return JSON.stringify({ streams: uniq.slice(0, 10), subtitles: "" });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
