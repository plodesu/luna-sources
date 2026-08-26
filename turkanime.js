/**
 * GogoAnimeZ - Sora / Luna
 *
 * Search + series + episodes + stream extraction
 * + Turkish-only soft subtitles.
 *
 * Subtitle pipeline:
 *   Gogo page -> IMDb id -> OpenSubtitles v3 + legacy REST
 *   -> validate S/E from release names -> Turkish only
 *
 * v1.0.0
 */

const baseUrl = "https://gogoanimez.to";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const OS_V3 = "https://opensubtitles-v3.strem.io";
const OS_REST = "https://rest.opensubtitles.org/search";
const IMDB_SUGGEST = "https://v3.sg.media-imdb.com/suggestion/x/";

async function soraFetch(url, options) {
  options = options || {};

  const headers = Object.assign({
    "User-Agent": UA,
    "Accept": "text/html,application/json,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Referer": baseUrl + "/"
  }, options.headers || {});

  const method = options.method || "GET";
  const body = options.body || null;

  try {
    if (typeof fetchv2 === "function") {
      const r = await fetchv2(url, headers, method, body);
      if (r) return r;
    }
  } catch (e) {}

  try {
    return await fetch(url, {
      method: method,
      headers: headers,
      body: body
    });
  } catch (e) {
    return null;
  }
}

async function getText(res) {
  if (res == null) return "";

  try {
    if (typeof res === "string") return res;

    if (typeof res.text === "function") {
      return String((await res.text()) || "");
    }

    if (typeof res.data === "string") {
      return res.data;
    }

    if (typeof res.body === "string") {
      return res.body;
    }

    return String(res);
  } catch (e) {
    return "";
  }
}

async function getJSON(url, headers) {
  const text = await getText(
    await soraFetch(url, {
      headers: headers || {}
    })
  );

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (e) {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");

    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch (e2) {}
    }
  }

  return null;
}

function decodeEntities(s) {
  let x = String(s || "");

  for (let i = 0; i < 3; i++) {
    x = x
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#039;|&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&nbsp;/gi, " ")
      .replace(/&ouml;/gi, "ö")
      .replace(/&Ouml;/g, "Ö")
      .replace(/&uuml;/gi, "ü")
      .replace(/&Uuml;/g, "Ü")
      .replace(/&ccedil;/gi, "ç")
      .replace(/&Ccedil;/g, "Ç")
      .replace(/&scedil;/gi, "ş")
      .replace(/&Scedil;/g, "Ş")
      .replace(/&eacute;/gi, "é")
      .replace(/&Eacute;/g, "É")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
        return String.fromCharCode(parseInt(h, 16));
      })
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(parseInt(n, 10));
      });
  }

  return x;
}

function cleanText(s) {
  return decodeEntities(String(s || ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHttp(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function absUrl(u, parent) {
  u = decodeEntities(String(u || "").trim())
    .replace(/\\\//g, "/")
    .replace(/\\u0026/g, "&");

  if (!u) return "";

  if (u.indexOf("//") === 0) {
    return "https:" + u;
  }

  if (isHttp(u)) {
    return u;
  }

  try {
    return new URL(u, parent || baseUrl).toString();
  } catch (e) {}

  return u.charAt(0) === "/"
    ? baseUrl + u
    : u;
}

function unique(a) {
  const s = {};

  return a.filter(function (x) {
    x = String(x || "");

    if (!x || s[x]) {
      return false;
    }

    s[x] = true;
    return true;
  });
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* =========================================================
 * HTML
 * ========================================================= */

function extractTitle(html) {
  let m = html.match(
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
  );

  if (m) {
    return cleanText(m[1]);
  }

  m = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return m
    ? cleanText(m[1])
        .replace(/\s*[-|]\s*Gogoanime.*$/i, "")
    : "";
}

function meta(html, key) {
  let m = html.match(
    new RegExp(
      '<meta[^>]+(?:name|property)=["\\\']' +
        key +
        '["\\\'][^>]+content=["\\\']([^"\\\']*)',
      "i"
    )
  );

  if (!m) {
    m = html.match(
      new RegExp(
        '<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:name|property)=["\\\']' +
          key +
          '["\\\']',
        "i"
      )
    );
  }

  return m ? cleanText(m[1]) : "";
}

function images(html, parent) {
  const out = [];
  let m;

  const rs = [
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/gi
  ];

  rs.forEach(function (re) {
    while ((m = re.exec(html))) {
      const u = absUrl(m[1], parent);

      if (
        u &&
        !/^data:/i.test(u) &&
        !/logo|avatar|banner|advert/i.test(u)
      ) {
        out.push(u);
      }
    }
  });

  return unique(out);
}

function links(html, parent) {
  const out = [];
  let m;

  const re =
    /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  while ((m = re.exec(html))) {
    out.push({
      href: absUrl(m[2], parent),
      text: cleanText(m[4]),
      attrs: (m[1] || "") + " " + (m[3] || "")
    });
  }

  return out;
}

function iframes(html, parent) {
  const out = [];
  let m;

  const re =
    /<(?:iframe|embed)[^>]+(?:src|data-src)=["']([^"']+)["']/gi;

  while ((m = re.exec(html))) {
    const u = absUrl(m[1], parent);

    if (isHttp(u)) {
      out.push(u);
    }
  }

  return unique(out);
}

/* =========================================================
 * MEDIA
 * ========================================================= */

function mediaUrls(text, parent) {
  const out = [];
  let m;

  if (!text) return out;

  const patterns = [
    /(?:["'](?:file|src|source|url|videoUrl|hls)["']?\s*[:=]\s*["'])([^"']+)(?:["'])/gi,

    /<source[^>]+(?:src|data-src)=["']([^"']+)["']/gi,

    /https?:\/\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/gi,

    /https?:\/\/[^"'\\\s<>]+?\.mp4(?:\?[^"'\\\s<>]*)?/gi
  ];

  patterns.forEach(function (re, idx) {
    while ((m = re.exec(text))) {
      const raw = idx >= 2 ? m[0] : m[1];

      const u = absUrl(raw, parent);

      if (
        /\.m3u8(?:$|[?#])|\.mp4(?:$|[?#])|\.m4v(?:$|[?#])|\.webm(?:$|[?#])/i.test(
          u
        )
      ) {
        out.push(u);
      }
    }
  });

  return unique(out);
}

/* =========================================================
 * EPISODE PARSING
 * ========================================================= */

function episodeNumber(s, fallback) {
  s = decodeEntities(String(s || ""));

  let m =
    s.match(
      /(?:episode|ep|e)[\s._-]*(\d{1,4})/i
    ) ||
    s.match(/-episode-(\d+)/i) ||
    s.match(
      /(?:^|[-_. ])(\d{1,4})(?:[-_. ]|$)/
    );

  return m
    ? parseInt(m[1], 10)
    : fallback;
}

function seasonNumber(s) {
  const m = String(s || "").match(
    /season[\s._-]*(\d{1,2})/i
  );

  return m
    ? parseInt(m[1], 10)
    : 1;
}

function parseSubEpisode(name) {
  const n = String(name || "");

  let m = n.match(
    /\bS(\d{1,2})[.\-_ ]?E(\d{1,3})\b/i
  );

  if (m) {
    return {
      s: +m[1],
      e: +m[2]
    };
  }

  m = n.match(
    /\b(\d{1,2})x(\d{1,3})\b/i
  );

  if (m) {
    return {
      s: +m[1],
      e: +m[2]
    };
  }

  m = n.match(
    /\[(\d{1,2})\.(\d{1,3})\]/
  );

  if (m) {
    return {
      s: +m[1],
      e: +m[2]
    };
  }

  m = n.match(
    /(?:^|[\s\-_.])(\d)(\d{2})(?:[\s\-_.]|$)/
  );

  if (m) {
    return {
      s: +m[1],
      e: +m[2]
    };
  }

  return null;
}

function animeSlugFromEpisode(url) {
  const p =
    String(url || "")
      .replace(/\/+$/, "")
      .split("/")
      .pop() || "";

  const m = p.match(
    /^(.*?)-episode-\d+(?:-english-subbed|-dubbed)?$/i
  );

  return m
    ? m[1]
    : p.replace(
        /-episode-\d+.*$/i,
        ""
      );
}

function seriesUrlFromEpisode(url) {
  const slug = animeSlugFromEpisode(url);

  return slug
    ? baseUrl + "/series/" + slug + "/"
    : "";
}

/* =========================================================
 * SEARCH
 * ========================================================= */

async function searchResults(keyword) {
  try {
    const q = cleanText(keyword);

    if (!q) {
      return JSON.stringify([]);
    }

    const results = [];
    const seen = {};

    function push(href, title, image) {
      href = absUrl(
        String(href || "").split("?")[0]
      );

      if (
        !href ||
        seen[href] ||
        !/\/series\/[^/]+\/?$/i.test(
          new URL(href).pathname
        )
      ) {
        return;
      }

      seen[href] = true;

      results.push({
        title: cleanText(title) || "Anime",
        image: absUrl(image || ""),
        href: href
      });
    }

    const urls = [
      baseUrl +
        "/search.html?keyword=" +
        encodeURIComponent(q),

      baseUrl +
        "/search?keyword=" +
        encodeURIComponent(q),

      baseUrl +
        "/?s=" +
        encodeURIComponent(q)
    ];

    let html = "";

    for (let i = 0; i < urls.length; i++) {
      html = await getText(
        await soraFetch(urls[i])
      );

      if (
        html &&
        html.length > 1000 &&
        !/Just a moment|cf-chl-/i.test(html)
      ) {
        break;
      }
    }

    if (html) {
      const ls = links(
        html,
        baseUrl
      );

      ls.forEach(function (l) {
        if (/\/series\//i.test(l.href)) {
          push(
            l.href,
            l.text ||
              (
                l.attrs.match(
                  /title=["']([^"']+)/i
                ) || []
              )[1] ||
              "",
            ""
          );
        }
      });
    }

    /*
     * Direct slug fallback.
     */
    if (!results.length) {
      const candidate =
        baseUrl +
        "/series/" +
        slugify(q) +
        "/";

      const h = await getText(
        await soraFetch(candidate)
      );

      if (
        h &&
        /<h1|Episode|Synopsis/i.test(h)
      ) {
        push(
          candidate,
          extractTitle(h) || q,
          images(h, candidate)[0] || ""
        );
      }
    }

    const norm = slugify(q);

    results.sort(function (a, b) {
      const sa = slugify(a.title);
      const sb = slugify(b.title);

      const scoreA =
        sa === norm
          ? 100
          : sa.includes(norm)
          ? 50
          : 0;

      const scoreB =
        sb === norm
          ? 100
          : sb.includes(norm)
          ? 50
          : 0;

      return scoreB - scoreA;
    });

    return JSON.stringify(
      results.slice(0, 30)
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * SERIES
 * ========================================================= */

async function getSeriesHtml(url) {
  let u = String(url || "");

  if (/\/episode-\d+/i.test(u)) {
    u =
      seriesUrlFromEpisode(u) ||
      u;
  }

  const html = await getText(
    await soraFetch(u)
  );

  return {
    url: u,
    html: html
  };
}

async function extractDetails(url) {
  try {
    const p =
      await getSeriesHtml(url);

    const h = p.html || "";

    const description =
      meta(h, "description") ||
      meta(h, "og:description") ||
      "N/A";

    const title =
      extractTitle(h) ||
      "Anime";

    const imdb =
      (
        h.match(
          /imdb\.com\/title\/(tt\d+)/i
        ) || []
      )[1] || "";

    return JSON.stringify([
      {
        description:
          description.slice(0, 1500),

        aliases:
          imdb
            ? title + " | " + imdb
            : title,

        airdate: "N/A"
      }
    ]);
  } catch (e) {
    return JSON.stringify([
      {
        description: "N/A",
        aliases: "N/A",
        airdate: "N/A"
      }
    ]);
  }
}

/* =========================================================
 * EPISODES
 * ========================================================= */

async function extractEpisodes(url) {
  try {
    const p =
      await getSeriesHtml(url);

    const h = p.html || "";

    const eps = [];
    const seen = {};

    links(h, p.url).forEach(function (l) {
      if (!/\/episode-\d+/i.test(l.href)) {
        return;
      }

      const n = episodeNumber(
        l.text + " " + l.href,
        eps.length + 1
      );

      if (!n || seen[l.href]) {
        return;
      }

      seen[l.href] = true;

      eps.push({
        href: l.href,
        number: n,
        title: "Episode " + n
      });
    });

    /*
     * Generic fallback.
     */
    if (!eps.length) {
      let m;

      const re =
        /href=["']([^"']*-episode-(\d+)[^"']*)["']/gi;

      while ((m = re.exec(h))) {
        const href =
          absUrl(m[1], p.url);

        if (seen[href]) {
          continue;
        }

        seen[href] = true;

        eps.push({
          href: href,
          number: +m[2],
          title:
            "Episode " + m[2]
        });
      }
    }

    eps.sort(function (a, b) {
      return a.number - b.number;
    });

    return JSON.stringify(
      eps.slice(0, 1000)
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * IMDb
 * ========================================================= */

async function findImdbId(title, year) {
  const clean =
    cleanText(title)
      .replace(
        /\s*\(\d{4}\)\s*$/,
        ""
      );

  const first =
    (clean.charAt(0) || "x")
      .toLowerCase();

  const urls = [
    IMDB_SUGGEST +
      encodeURIComponent(clean) +
      ".json",

    "https://v2.sg.media-imdb.com/suggestion/" +
      encodeURIComponent(first) +
      "/" +
      encodeURIComponent(clean) +
      ".json"
  ];

  for (let i = 0; i < urls.length; i++) {
    try {
      const d = await getJSON(
        urls[i],
        {
          Accept:
            "application/json"
        }
      );

      const list =
        d &&
        Array.isArray(d.d)
          ? d.d
          : [];

      const candidates =
        list.filter(function (x) {
          return (
            x &&
            /^tt\d+$/.test(x.id)
          );
        });

      candidates.sort(
        function (a, b) {
          const na =
            slugify(
              a.l ||
              a.title ||
              ""
            );

          const nb =
            slugify(
              b.l ||
              b.title ||
              ""
            );

          const q =
            slugify(clean);

          const sa =
            na === q
              ? 100
              : na.includes(q) ||
                q.includes(na)
              ? 50
              : 0;

          const sb =
            nb === q
              ? 100
              : nb.includes(q) ||
                q.includes(nb)
              ? 50
              : 0;

          const ya =
            year && a.y
              ? Math.abs(
                  +a.y - +year
                )
              : 99;

          const yb =
            year && b.y
              ? Math.abs(
                  +b.y - +year
                )
              : 99;

          return (
            sb - sa ||
            ya - yb
          );
        }
      );

      if (candidates[0]) {
        return candidates[0].id;
      }
    } catch (e) {}
  }

  return "";
}

async function imdbForEpisode(
  episodeUrl,
  episodeHtml
) {
  let m =
    episodeHtml.match(
      /imdb\.com\/title\/(tt\d+)/i
    );

  if (m) {
    return m[1];
  }

  const seriesUrl =
    seriesUrlFromEpisode(
      episodeUrl
    );

  if (seriesUrl) {
    const h = await getText(
      await soraFetch(seriesUrl)
    );

    m =
      h.match(
        /imdb\.com\/title\/(tt\d+)/i
      );

    if (m) {
      return m[1];
    }

    const title =
      extractTitle(h);

    const ym =
      h.match(
        /(?:Released|Release(?:d)?|Year)\s*[:\-]?\s*(20\d{2}|19\d{2})/i
      );

    return await findImdbId(
      title,
      ym ? ym[1] : ""
    );
  }

  return "";
}

/* =========================================================
 * TURKISH SUBTITLES
 * ========================================================= */

function subtitleRank(
  x,
  s,
  e
) {
  const parsed =
    parseSubEpisode(
      x.filename ||
      x.name ||
      ""
    );

  /*
   * Wrong S/E = completely rejected.
   */
  if (
    parsed &&
    (
      parsed.s !== s ||
      parsed.e !== e
    )
  ) {
    return -100000;
  }

  let score =
    parsed
      ? 1000
      : 100;

  const n =
    String(
      x.filename ||
      x.name ||
      ""
    ).toLowerCase();

  if (
    /forced|signs|sdh|hearing/i.test(n)
  ) {
    score -= 30;
  }

  if (
    /utf8|utf-8/i.test(
      String(x.url || "")
    )
  ) {
    score += 10;
  }

  return score;
}

async function turkishSubtitles(
  imdbId,
  season,
  episode
) {
  if (!imdbId) {
    return [];
  }

  const out = [];

  /*
   * Provider A:
   * Stremio OpenSubtitles v3
   *
   * IMPORTANT:
   * IMDb:S:E format is required.
   */
  try {
    const id =
      encodeURIComponent(
        imdbId +
          ":" +
          season +
          ":" +
          episode
      );

    const d =
      await getJSON(
        OS_V3 +
          "/subtitles/series/" +
          id +
          ".json",
        {
          Accept:
            "application/json",

          Referer:
            "https://app.strem.io/",

          "Accept-Encoding":
            "identity"
        }
      );

    const arr =
      d &&
      Array.isArray(d.subtitles)
        ? d.subtitles
        : [];

    arr.forEach(function (x) {
      if (
        x &&
        x.url &&
        String(
          x.lang || ""
        ).toLowerCase() === "tur"
      ) {
        out.push({
          url: x.url,
          label: "Türkçe",
          lang: "tur",
          filename:
            x.filename ||
            x.name ||
            ""
        });
      }
    });
  } catch (e) {}

  /*
   * Provider B:
   * OpenSubtitles legacy REST
   *
   * Gives release names so we can
   * validate S/E.
   */
  try {
    const id =
      imdbId.replace(
        /^tt/i,
        ""
      );

    const url =
      OS_REST +
      "/episode-" +
      episode +
      "/imdbid-" +
      id +
      "/season-" +
      season +
      "/sublanguageid-tur";

    const d =
      await getJSON(
        url,
        {
          "X-User-Agent":
            "trailers.to-UA",

          Accept:
            "application/json",

          "Accept-Encoding":
            "identity"
        }
      );

    const arr =
      Array.isArray(d)
        ? d
        : [];

    arr.forEach(function (x) {
      if (!x) {
        return;
      }

      if (
        String(
          x.SubLanguageID ||
          ""
        ).toLowerCase() !==
        "tur"
      ) {
        return;
      }

      const name =
        x.SubFileName ||
        x.MovieReleaseName ||
        "";

      const parsed =
        parseSubEpisode(name);

      /*
       * Reject subtitles belonging
       * to another season/episode.
       */
      if (
        parsed &&
        (
          parsed.s !== season ||
          parsed.e !== episode
        )
      ) {
        return;
      }

      const idf =
        x.IDSubtitleFile;

      if (!idf) {
        return;
      }

      const u =
        "https://dl.opensubtitles.org/en/download/filead/" +
        encodeURIComponent(idf);

      out.push({
        url: u,
        label: "Türkçe",
        lang: "tur",
        filename: name
      });
    });
  } catch (e) {}

  const dedup = {};
  const valid = [];

  out.sort(
    function (a, b) {
      return (
        subtitleRank(
          b,
          season,
          episode
        ) -
        subtitleRank(
          a,
          season,
          episode
        )
      );
    }
  );

  out.forEach(function (x) {
    if (
      x.url &&
      !dedup[x.url]
    ) {
      dedup[x.url] = true;
      valid.push(x);
    }
  });

  return valid.slice(0, 8);
}

/* =========================================================
 * STREAM PLAYER
 * ========================================================= */

async function resolvePlayer(
  url,
  referer,
  depth
) {
  if (depth > 2) {
    return [];
  }

  const h =
    await getText(
      await soraFetch(
        url,
        {
          headers: {
            Referer:
              referer ||
              baseUrl + "/",

            Accept:
              "text/html,*/*",

            "User-Agent":
              UA
          }
        }
      )
    );

  if (!h) {
    return [];
  }

  let out =
    mediaUrls(
      h,
      url
    );

  /*
   * Some players contain another
   * iframe.
   */
  if (!out.length) {
    const nested =
      iframes(
        h,
        url
      );

    for (
      let i = 0;
      i <
        Math.min(
          nested.length,
          5
        );
      i++
    ) {
      out =
        out.concat(
          await resolvePlayer(
            nested[i],
            url,
            depth + 1
          )
        );
    }
  }

  return unique(out);
}

function playerLabel(url) {
  const u =
    String(url || "")
      .toLowerCase();

  if (
    /megacloud|rapid-cloud/.test(u)
  ) {
    return "MegaCloud";
  }

  if (
    /vidcloud|vidstream/.test(u)
  ) {
    return "VidCloud";
  }

  if (
    /rabbitstream|dokicloud/.test(u)
  ) {
    return "RabbitStream";
  }

  if (
    /streamwish/.test(u)
  ) {
    return "StreamWish";
  }

  if (
    /vidhide/.test(u)
  ) {
    return "VidHide";
  }

  try {
    return new URL(url).hostname;
  } catch (e) {
    return "Player";
  }
}

/* =========================================================
 * MAIN STREAM FUNCTION
 * ========================================================= */

async function extractStreamUrl(url) {
  try {
    const episodeUrl =
      String(url || "");

    const epHtml =
      await getText(
        await soraFetch(
          episodeUrl,
          {
            headers: {
              Referer:
                baseUrl + "/",

              "User-Agent":
                UA
            }
          }
        )
      );

    if (!epHtml) {
      return JSON.stringify({
        streams: [],
        subtitles: ""
      });
    }

    /*
     * Direct media.
     */
    let found =
      mediaUrls(
        epHtml,
        episodeUrl
      ).map(function (u) {
        return {
          url: u,
          label: "GogoAnime",
          player: episodeUrl
        };
      });

    /*
     * External players.
     */
    const players =
      iframes(
        epHtml,
        episodeUrl
      ).filter(function (u) {
        return !/youtube|facebook|twitter|google/i.test(u);
      });

    for (
      let i = 0;
      i <
        Math.min(
          players.length,
          8
        );
      i++
    ) {
      const us =
        await resolvePlayer(
          players[i],
          episodeUrl,
          0
        );

      us.forEach(
        function (u) {
          found.push({
            url: u,
            label:
              playerLabel(
                players[i]
              ),
            player:
              players[i]
          });
        }
      );
    }

    /*
     * Deduplicate.
     */
    found =
      found.filter(
        function (x, i, a) {
          return (
            a.findIndex(
              function (y) {
                return (
                  y.url ===
                  x.url
                );
              }
            ) === i
          );
        }
      );

    /*
     * HLS first.
     */
    found.sort(
      function (a, b) {
        return (
          (/\.m3u8/i.test(
            a.url
          )
            ? 0
            : 1) -
          (/\.m3u8/i.test(
            b.url
          )
            ? 0
            : 1)
        );
      }
    );

    /*
     * Determine S/E.
     */
    const title =
      extractTitle(
        epHtml
      );

    const season =
      seasonNumber(
        title +
          " " +
          episodeUrl
      );

    const episode =
      episodeNumber(
        title +
          " " +
          episodeUrl,
        1
      );

    /*
     * Subtitle extraction is OPTIONAL.
     * A subtitle failure must NEVER
     * remove a working stream.
     */
    const imdbId =
      await imdbForEpisode(
        episodeUrl,
        epHtml
      );

    const subs =
      await turkishSubtitles(
        imdbId,
        season,
        episode
      );

    const subPairs = [];
    const allSubs = [];

    for (
      let i = 0;
      i < subs.length;
      i++
    ) {
      const headers = {
        Referer:
          "https://app.strem.io/",

        "User-Agent":
          UA,

        Accept:
          "text/plain,text/vtt,application/x-subrip,*/*"
      };

      /*
       * Only Turkish is exposed.
       */
      subPairs.push(
        "Türkçe",
        subs[i].url
      );

      allSubs.push({
        url: subs[i].url,
        label: "Türkçe",
        headers: headers
      });
    }

    const streams = [];

    found
      .slice(0, 10)
      .forEach(function (x) {
        const t =
          "GogoAnime · " +
          x.label +
          (
            /\.m3u8/i.test(
              x.url
            )
              ? " · HLS"
              : " · MP4"
          );

        const item = {
          title: t,
          name: t,

          streamUrl:
            x.url,

          headers: {
            "User-Agent":
              UA,

            Referer:
              x.player ||
              episodeUrl,

            Accept:
              "application/vnd.apple.mpegurl,video/*,*/*"
          }
        };

        /*
         * Turkish subtitle only.
         */
        if (allSubs.length) {
          item.subtitle =
            allSubs[0].url;

          item.subtitleHeaders =
            allSubs[0].headers;

          item.subtitles =
            subPairs;

          item.allSubtitles =
            allSubs;
        } else {
          item.subtitles = [];
          item.allSubtitles = [];
        }

        streams.push(item);
      });

    return JSON.stringify({
      streams: streams,

      subtitles:
        allSubs.length
          ? allSubs[0].url
          : ""
    });
  } catch (e) {
    /*
     * Never crash Sora/Luna.
     */
    return JSON.stringify({
      streams: [],
      subtitles: ""
    });
  }
}
