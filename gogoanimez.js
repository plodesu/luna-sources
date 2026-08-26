/**
 * GogoAnimeZ / Anitaku
 * Sora + Luna
 *
 * Search
 * Series
 * Episodes
 * Stream extraction
 * Turkish subtitles only
 *
 * Current site structure:
 *   /series/<slug>/
 *   /<anime>-episode-<number>-english-subbed/
 *
 * v2.0.0
 */

const baseUrl = "https://gogoanimez.to";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const KITSU =
  "https://kitsu.io/api/edge/anime";

const OS_V3 =
  "https://opensubtitles-v3.strem.io";

const OS_REST =
  "https://rest.opensubtitles.org/search";

async function soraFetch(url, options) {
  options = options || {};

  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "text/html,application/json,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      Referer: baseUrl + "/"
    },
    options.headers || {}
  );

  const method =
    options.method || "GET";

  const body =
    options.body || null;

  try {
    if (typeof fetchv2 === "function") {
      const r = await fetchv2(
        url,
        headers,
        method,
        body
      );

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
  if (!res) return "";

  try {
    if (typeof res === "string") {
      return res;
    }

    if (
      typeof res.text ===
      "function"
    ) {
      return String(
        (await res.text()) || ""
      );
    }

    if (
      typeof res.data ===
      "string"
    ) {
      return res.data;
    }

    if (
      typeof res.body ===
      "string"
    ) {
      return res.body;
    }

    return String(res);
  } catch (e) {
    return "";
  }
}

async function getJSON(
  url,
  options
) {
  const text =
    await getText(
      await soraFetch(
        url,
        options || {}
      )
    );

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (e) {
    const a =
      text.indexOf("{");

    const b =
      text.lastIndexOf("}");

    if (
      a >= 0 &&
      b > a
    ) {
      try {
        return JSON.parse(
          text.slice(a, b + 1)
        );
      } catch (e2) {}
    }
  }

  return null;
}

/* =========================================================
 * HELPERS
 * ========================================================= */

function decodeEntities(s) {
  return String(s || "")
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#039;|&#39;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      function (_, h) {
        return String.fromCharCode(
          parseInt(h, 16)
        );
      }
    )
    .replace(
      /&#(\d+);/g,
      function (_, n) {
        return String.fromCharCode(
          parseInt(n, 10)
        );
      }
    );
}

function cleanText(s) {
  return decodeEntities(
    String(s || "")
  )
    .replace(
      /<[^>]*>/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function unique(arr) {
  const seen = {};

  return arr.filter(
    function (x) {
      const k =
        String(x || "");

      if (!k || seen[k]) {
        return false;
      }

      seen[k] = true;
      return true;
    }
  );
}

function absUrl(
  value,
  parent
) {
  let u =
    decodeEntities(
      String(value || "")
    )
      .replace(
        /\\\//g,
        "/"
      )
      .replace(
        /\\u0026/g,
        "&"
      )
      .trim();

  if (!u) return "";

  if (
    u.indexOf("//") ===
    0
  ) {
    return "https:" + u;
  }

  if (
    /^https?:\/\//i.test(u)
  ) {
    return u;
  }

  try {
    return new URL(
      u,
      parent || baseUrl
    ).toString();
  } catch (e) {}

  if (
    u.charAt(0) === "/"
  ) {
    return (
      baseUrl + u
    );
  }

  return u;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /&/g,
      " and "
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      "");
}

function getTitleFromHtml(
  html
) {
  let m =
    html.match(
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    );

  if (m) {
    return cleanText(m[1]);
  }

  m =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  if (m) {
    return cleanText(
      m[1]
    ).replace(
      /\s*[-|]\s*(Gogoanime|Anitaku).*$/i,
      ""
    );
  }

  return "";
}

function getLinks(
  html,
  parent
) {
  const result = [];
  let m;

  const re =
    /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  while (
    (m = re.exec(html))
  ) {
    result.push({
      href: absUrl(
        m[2],
        parent
      ),
      text: cleanText(
        m[4]
      ),
      attrs:
        (m[1] || "") +
        " " +
        (m[3] || "")
    });
  }

  return result;
}

function getIframes(
  html,
  parent
) {
  const result = [];
  let m;

  const re =
    /<(?:iframe|embed)[^>]+(?:src|data-src|data-video)=["']([^"']+)["']/gi;

  while (
    (m = re.exec(html))
  ) {
    const u =
      absUrl(
        m[1],
        parent
      );

    if (
      /^https?:\/\//i.test(u)
    ) {
      result.push(u);
    }
  }

  return unique(result);
}

/* =========================================================
 * EPISODE PARSING
 * ========================================================= */

function getEpisodeNumber(
  text,
  fallback
) {
  const s =
    decodeEntities(
      String(text || "")
    );

  let m =
    s.match(
      /episode[\s._-]*(\d{1,4})/i
    );

  if (!m) {
    m =
      s.match(
        /ep[\s._-]*(\d{1,4})/i
      );
  }

  if (!m) {
    m =
      s.match(
        /-episode-(\d{1,4})/i
      );
  }

  if (!m) {
    m =
      s.match(
        /\bE(\d{1,4})\b/i
      );
  }

  if (!m) {
    m =
      s.match(
        /(?:^|[-_.\s])(\d{1,4})(?:[-_.\s]|$)/
      );
  }

  return m
    ? parseInt(
        m[1],
        10
      )
    : fallback;
}

function getSeasonNumber(
  text
) {
  const m =
    String(text || "")
      .match(
        /\bseason[\s._-]*(\d{1,2})\b/i
      );

  return m
    ? parseInt(
        m[1],
        10
      )
    : 1;
}

function episodeUrlLooksValid(
  url
) {
  return (
    /episode[-_.]/i.test(
      url
    ) ||
    /\/watch\//i.test(
      url
    ) ||
    /\/episode\//i.test(
      url
    )
  );
}

/* =========================================================
 * SEARCH
 * ========================================================= */

async function siteSearch(
  keyword
) {
  const q =
    String(keyword || "")
      .trim();

  if (!q) {
    return [];
  }

  const urls = [
    baseUrl +
      "/search.html?keyword=" +
      encodeURIComponent(q),

    baseUrl +
      "/search?keyword=" +
      encodeURIComponent(q),

    baseUrl +
      "/search/?keyword=" +
      encodeURIComponent(q),

    baseUrl +
      "/search/?q=" +
      encodeURIComponent(q),

    baseUrl +
      "/index.php?s=" +
      encodeURIComponent(q),

    baseUrl +
      "/?s=" +
      encodeURIComponent(q)
  ];

  for (
    let i = 0;
    i < urls.length;
    i++
  ) {
    const html =
      await getText(
        await soraFetch(
          urls[i],
          {
            headers: {
              Referer:
                baseUrl + "/",
              Accept:
                "text/html,*/*"
            }
          }
        )
      );

    if (
      !html ||
      html.length < 500
    ) {
      continue;
    }

    if (
      /Just a moment|cf-chl-/i.test(
        html
      )
    ) {
      continue;
    }

    const results = [];
    const seen = {};

    const links =
      getLinks(
        html,
        baseUrl
      );

    links.forEach(
      function (l) {
        const path =
          String(l.href || "");

        if (
          !/\/series\/[^/]+\/?$/i.test(
            path
          )
        ) {
          return;
        }

        if (
          seen[path]
        ) {
          return;
        }

        seen[path] = true;

        results.push({
          title:
            l.text ||
            l.attrs.match(
              /title=["']([^"']+)["']/i
            )?.[1] ||
            "Anime",

          image: "",

          href: path
        });
      }
    );

    if (
      results.length
    ) {
      return results;
    }
  }

  return [];
}

/* =========================================================
 * KITSU FALLBACK
 *
 * Used because the site's own search can be broken.
 * ========================================================= */

async function kitsuSearch(
  keyword
) {
  try {
    const url =
      KITSU +
      "?filter[text]=" +
      encodeURIComponent(
        keyword
      ) +
      "&page[limit]=12";

    const d =
      await getJSON(
        url,
        {
          headers: {
            Accept:
              "application/vnd.api+json"
          }
        }
      );

    if (
      !d ||
      !Array.isArray(
        d.data
      )
    ) {
      return [];
    }

    const results = [];

    for (
      let i = 0;
      i < d.data.length;
      i++
    ) {
      const x =
        d.data[i];

      if (
        !x ||
        !x.attributes
      ) {
        continue;
      }

      const a =
        x.attributes;

      const titles =
        a.titles || {};

      const title =
        titles.en ||
        titles.en_jp ||
        titles.ja_jp ||
        titles.romaji ||
        a.canonicalTitle ||
        "";

      if (!title) {
        continue;
      }

      const slug =
        slugify(title);

      results.push({
        title: title,

        image:
          a.posterImage &&
          (
            a.posterImage.medium ||
            a.posterImage.original
          )
            ? (
                a.posterImage.medium ||
                a.posterImage.original
              )
            : "",

        href:
          baseUrl +
          "/series/" +
          slug +
          "/"
      });
    }

    return results;
  } catch (e) {
    return [];
  }
}

async function searchResults(
  keyword
) {
  try {
    const q =
      String(keyword || "")
        .trim();

    if (!q) {
      return JSON.stringify([]);
    }

    let results =
      await siteSearch(q);

    /*
     * Site search is broken/changed:
     * use metadata search as fallback.
     */
    if (!results.length) {
      results =
        await kitsuSearch(q);
    }

    /*
     * Verify constructed series
     * pages before returning them.
     */
    const verified = [];

    for (
      let i = 0;
      i <
        Math.min(
          results.length,
          12
        );
      i++
    ) {
      const r =
        results[i];

      const html =
        await getText(
          await soraFetch(
            r.href,
            {
              headers: {
                Referer:
                  baseUrl + "/"
              }
            }
          )
        );

      if (
        html &&
        html.length > 500 &&
        !/404|Page not found/i.test(
          html
        )
      ) {
        const title =
          getTitleFromHtml(
            html
          ) ||
          r.title;

        verified.push({
          title: cleanText(
            title
          ),
          image:
            r.image || "",
          href:
            r.href
        });
      }
    }

    /*
     * If verification failed,
     * still return site results.
     */
    const finalResults =
      verified.length
        ? verified
        : results;

    const ql =
      q.toLowerCase();

    finalResults.sort(
      function (a, b) {
        const at =
          a.title
            .toLowerCase();

        const bt =
          b.title
            .toLowerCase();

        const as =
          at === ql
            ? 100
            : at.includes(ql)
            ? 50
            : 0;

        const bs =
          bt === ql
            ? 100
            : bt.includes(ql)
            ? 50
            : 0;

        return bs - as;
      }
    );

    return JSON.stringify(
      finalResults.slice(
        0,
        30
      )
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * SERIES DETAILS
 * ========================================================= */

async function extractDetails(
  url
) {
  try {
    const html =
      await getText(
        await soraFetch(
          url
        )
      );

    if (!html) {
      return JSON.stringify([
        {
          description:
            "N/A",
          aliases:
            "N/A",
          airdate:
            "N/A"
        }
      ]);
    }

    let description =
      "";

    let m =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      );

    if (!m) {
      m =
        html.match(
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
        );
    }

    if (m) {
      description =
        cleanText(
          m[1]
        );
    }

    return JSON.stringify([
      {
        description:
          description ||
          "N/A",

        aliases:
          getTitleFromHtml(
            html
          ) ||
          "N/A",

        airdate:
          "N/A"
      }
    ]);
  } catch (e) {
    return JSON.stringify([
      {
        description:
          "N/A",
        aliases:
          "N/A",
        airdate:
          "N/A"
      }
    ]);
  }
}

/* =========================================================
 * EPISODES
 * ========================================================= */

async function extractEpisodes(
  url
) {
  try {
    let seriesUrl =
      String(url || "");

    /*
     * If Sora passes an episode
     * URL, find its series slug.
     */
    if (
      !/\/series\//i.test(
        seriesUrl
      )
    ) {
      const match =
        seriesUrl.match(
          /https?:\/\/[^/]+\/([^/?#]+)-episode-\d+/i
        );

      if (match) {
        seriesUrl =
          baseUrl +
          "/series/" +
          match[1] +
          "/";
      }
    }

    const html =
      await getText(
        await soraFetch(
          seriesUrl,
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

    if (!html) {
      return JSON.stringify([]);
    }

    const eps = [];
    const seen = {};

    /*
     * Current GogoAnimeZ:
     * root-level episode URLs.
     */
    const links =
      getLinks(
        html,
        seriesUrl
      );

    links.forEach(
      function (l) {
        if (
          !episodeUrlLooksValid(
            l.href
          )
        ) {
          return;
        }

        if (
          seen[l.href]
        ) {
          return;
        }

        /*
         * Only accept links that
         * actually contain an episode
         * number.
         */
        const number =
          getEpisodeNumber(
            l.text +
              " " +
              l.href,
            0
          );

        if (!number) {
          return;
        }

        seen[l.href] = true;

        eps.push({
          href:
            l.href,
          number:
            number,
          title:
            "Episode " +
            number
        });
      }
    );

    /*
     * Additional direct regex.
     */
    let m;

    const re =
      /href=["']([^"']*(?:episode[-_.]\d+|\/watch\/[^"']+)[^"']*)["']/gi;

    while (
      (m = re.exec(html))
    ) {
      const href =
        absUrl(
          m[1],
          seriesUrl
        );

      if (
        seen[href]
      ) {
        continue;
      }

      const number =
        getEpisodeNumber(
          href,
          0
        );

      if (!number) {
        continue;
      }

      seen[href] = true;

      eps.push({
        href:
          href,
        number:
          number,
        title:
          "Episode " +
          number
      });
    }

    eps.sort(
      function (a, b) {
        return (
          a.number -
          b.number
        );
      }
    );

    return JSON.stringify(
      eps.slice(
        0,
        1000
      )
    );
  } catch (e) {
    return JSON.stringify([]);
  }
}

/* =========================================================
 * MEDIA EXTRACTION
 * ========================================================= */

function extractMedia(
  text,
  parent
) {
  const result = [];
  let m;

  const patterns = [
    /(?:file|src|source|video|videoUrl|stream|streamUrl|hls)\s*[:=]\s*["']([^"']+)["']/gi,

    /data-(?:src|video|file|url)=["']([^"']+)["']/gi,

    /<source[^>]+src=["']([^"']+)["']/gi,

    /https?:\/\/[^"'\\\s<>]+\.m3u8(?:\?[^"'\\\s<>]*)?/gi,

    /https?:\/\/[^"'\\\s<>]+\.mp4(?:\?[^"'\\\s<>]*)?/gi
  ];

  patterns.forEach(
    function (re, index) {
      while (
        (m = re.exec(text))
      ) {
        const raw =
          index >= 3
            ? m[0]
            : m[1];

        const u =
          absUrl(
            raw,
            parent
          );

        if (
          /\.m3u8(?:$|[?#])/i.test(
            u
          ) ||
          /\.mp4(?:$|[?#])/i.test(
            u
          ) ||
          /\.m4v(?:$|[?#])/i.test(
            u
          )
        ) {
          result.push(u);
        }
      }
    }
  );

  return unique(
    result
  );
}

/* =========================================================
 * PLAYER RESOLUTION
 * ========================================================= */

async function resolvePlayer(
  url,
  referer,
  depth
) {
  if (depth > 3) {
    return [];
  }

  const html =
    await getText(
      await soraFetch(
        url,
        {
          headers: {
            Referer:
              referer ||
              baseUrl + "/",
            "User-Agent":
              UA,
            Accept:
              "text/html,*/*"
          }
        }
      )
    );

  if (!html) {
    return [];
  }

  let media =
    extractMedia(
      html,
      url
    );

  if (media.length) {
    return media;
  }

  /*
   * Some Gogo players put the
   * actual source inside JS as an
   * escaped URL.
   */
  const decoded =
    html
      .replace(
        /\\u002F/gi,
        "/"
      )
      .replace(
        /\\\//g,
        "/"
      )
      .replace(
        /\\u003A/gi,
        ":"
      )
      .replace(
        /&amp;/gi,
        "&"
      );

  media =
    extractMedia(
      decoded,
      url
    );

  if (media.length) {
    return media;
  }

  const frames =
    getIframes(
      html,
      url
    );

  for (
    let i = 0;
    i <
      Math.min(
        frames.length,
        8
      );
    i++
  ) {
    const nested =
      await resolvePlayer(
        frames[i],
        url,
        depth + 1
      );

    if (nested.length) {
      media =
        media.concat(
          nested
        );
    }
  }

  return unique(
    media
  );
}

/* =========================================================
 * TURKISH SUBTITLES
 * ========================================================= */

function parseSubtitleEpisode(
  name
) {
  const s =
    String(name || "");

  let m =
    s.match(
      /\bS(\d{1,2})[ ._-]*E(\d{1,3})\b/i
    );

  if (m) {
    return {
      season:
        +m[1],
      episode:
        +m[2]
    };
  }

  m =
    s.match(
      /\b(\d{1,2})x(\d{1,3})\b/i
    );

  if (m) {
    return {
      season:
        +m[1],
      episode:
        +m[2]
    };
  }

  return null;
}

async function getTurkishSubtitles(
  imdb,
  season,
  episode
) {
  if (!imdb) {
    return [];
  }

  const result = [];

  /*
   * OpenSubtitles Stremio endpoint.
   */
  try {
    const key =
      encodeURIComponent(
        imdb +
          ":" +
          season +
          ":" +
          episode
      );

    const data =
      await getJSON(
        OS_V3 +
          "/subtitles/series/" +
          key +
          ".json",
        {
          headers: {
            Referer:
              "https://app.strem.io/",
            Accept:
              "application/json",
            "Accept-Encoding":
              "identity"
          }
        }
      );

    const subs =
      data &&
      Array.isArray(
        data.subtitles
      )
        ? data.subtitles
        : [];

    subs.forEach(
      function (x) {
        if (
          !x ||
          !x.url
        ) {
          return;
        }

        const lang =
          String(
            x.lang || ""
          ).toLowerCase();

        if (
          lang !== "tur"
        ) {
          return;
        }

        const parsed =
          parseSubtitleEpisode(
            x.filename ||
              x.name ||
              ""
          );

        if (
          parsed &&
          (
            parsed.season !==
              season ||
            parsed.episode !==
              episode
          )
        ) {
          return;
        }

        result.push({
          url:
            x.url,
          label:
            "Türkçe",
          lang:
            "tur"
        });
      }
    );
  } catch (e) {}

  const seen = {};

  return result.filter(
    function (x) {
      if (
        seen[x.url]
      ) {
        return false;
      }

      seen[x.url] = true;
      return true;
    }
  ).slice(
    0,
    5
  );
}

/* =========================================================
 * STREAM
 * ========================================================= */

async function extractStreamUrl(
  url
) {
  try {
    const episodeUrl =
      String(url || "");

    const html =
      await getText(
        await soraFetch(
          episodeUrl,
          {
            headers: {
              Referer:
                baseUrl + "/",
              "User-Agent":
                UA,
              Accept:
                "text/html,*/*"
            }
          }
        )
      );

    if (!html) {
      return JSON.stringify({
        streams: [],
        subtitles: ""
      });
    }

    /*
     * Direct source.
     */
    let found =
      extractMedia(
        html,
        episodeUrl
      ).map(
        function (u) {
          return {
            url:
              u,
            label:
              "GogoAnimeZ",
            headers: {
              Referer:
                episodeUrl,
              "User-Agent":
                UA
            }
          };
        }
      );

    /*
     * Find all iframe/player
     * URLs.
     */
    const players =
      getIframes(
        html,
        episodeUrl
      );

    for (
      let i = 0;
      i <
        Math.min(
          players.length,
          10
        );
      i++
    ) {
      const urls =
        await resolvePlayer(
          players[i],
          episodeUrl,
          0
        );

      urls.forEach(
        function (u) {
          found.push({
            url:
              u,
            label:
              playerName(
                players[i]
              ),
            headers: {
              Referer:
                players[i],
              "User-Agent":
                UA,
              Accept:
                "application/vnd.apple.mpegurl,video/*,*/*"
            }
          });
        }
      );
    }

    /*
     * Remove duplicate streams.
     */
    const streamSeen = {};

    found =
      found.filter(
        function (x) {
          if (
            !x.url ||
            streamSeen[
              x.url
            ]
          ) {
            return false;
          }

          streamSeen[
            x.url
          ] = true;

          return true;
        }
      );

    /*
     * HLS first.
     */
    found.sort(
      function (a, b) {
        const ah =
          /\.m3u8/i.test(
            a.url
          )
            ? 0
            : 1;

        const bh =
          /\.m3u8/i.test(
            b.url
          )
            ? 0
            : 1;

        return ah - bh;
      }
    );

    /*
     * Episode number.
     */
    const episode =
      getEpisodeNumber(
        episodeUrl +
          " " +
          getTitleFromHtml(
            html
          ),
        1
      );

    const season =
      getSeasonNumber(
        episodeUrl +
          " " +
          getTitleFromHtml(
            html
          )
      );

    /*
     * Try IMDb.
     */
    let imdb = "";

    const imdbMatch =
      html.match(
        /imdb\.com\/title\/(tt\d+)/i
      );

    if (
      imdbMatch
    ) {
      imdb =
        imdbMatch[1];
    }

    /*
     * Turkish subtitles.
     *
     * No Turkish subtitle =
     * stream still works.
     */
    const subtitles =
      await getTurkishSubtitles(
        imdb,
        season,
        episode
      );

    const output =
      subtitles.length
        ? subtitles[0]
        : null;

    const streams = [];

    found
      .slice(
        0,
        8
      )
      .forEach(
        function (x) {
          const type =
            /\.m3u8/i.test(
              x.url
            )
              ? "HLS"
              : "MP4";

          const title =
            "GogoAnimeZ · " +
            x.label +
            " · " +
            type;

          const item = {
            title:
              title,

            name:
              title,

            streamUrl:
              x.url,

            headers:
              x.headers,

            subtitles: []
          };

          /*
           * Sora/Luna subtitle
           * fields.
           */
          if (
            output
          ) {
            item.subtitle =
              output.url;

            item.subtitleHeaders =
              {
                Referer:
                  "https://app.strem.io/",
                "User-Agent":
                  UA,
                Accept:
                  "text/vtt,text/plain,*/*"
              };

            item.subtitles =
              [
                "Türkçe",
                output.url
              ];

            item.allSubtitles =
              [
                {
                  url:
                    output.url,
                  label:
                    "Türkçe",
                  lang:
                    "tur",
                  headers:
                    {
                      Referer:
                        "https://app.strem.io/",
                      "User-Agent":
                        UA
                    }
                }
              ];
          }

          streams.push(
            item
          );
        }
      );

    return JSON.stringify({
      streams:
        streams,

      subtitles:
        output
          ? output.url
          : ""
    });
  } catch (e) {
    return JSON.stringify({
      streams: [],
      subtitles: ""
    });
  }
}

/* =========================================================
 * PLAYER NAME
 * ========================================================= */

function playerName(
  url
) {
  const u =
    String(url || "")
      .toLowerCase();

  if (
    /megacloud|rapid-cloud/.test(
      u
    )
  ) {
    return "MegaCloud";
  }

  if (
    /vidstream|vidcloud/.test(
      u
    )
  ) {
    return "VidCloud";
  }

  if (
    /streamwish/.test(
      u
    )
  ) {
    return "StreamWish";
  }

  if (
    /vidhide/.test(
      u
    )
  ) {
    return "VidHide";
  }

  try {
    return new URL(
      url
    ).hostname;
  } catch (e) {
    return "Player";
  }
}
