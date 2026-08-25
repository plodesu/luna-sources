/**
 * ATodo minimal – crash-safe
 * v1.4.0
 */
var apiBase = "https://api.atodo.fun";
var tmdbImg = "https://image.tmdb.org/t/p/w500";
var UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function soraFetch(url) {
  var headers = {
    "User-Agent": UA,
    Accept: "application/json,*/*",
    Referer: "http://atodo.fun/"
  };
  try {
    if (typeof fetchv2 === "function") {
      var r = await fetchv2(url, headers, "GET", null);
      if (r) return r;
    }
  } catch (e) {}
  try {
    return await fetch(url, { method: "GET", headers: headers });
  } catch (e2) {
    return null;
  }
}

async function getText(res) {
  try {
    if (res == null) return "";
    if (typeof res === "string") return res;
    if (typeof res.text === "function") return String((await res.text()) || "");
    if (res.data) return String(res.data);
    if (res.body) return String(res.body);
    return "";
  } catch (e) {
    return "";
  }
}

async function getJson(url) {
  try {
    var t = await getText(await soraFetch(url));
    if (!t) return null;
    if (t.charAt(0) !== "{" && t.charAt(0) !== "[") return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function parseHref(url) {
  var s = String(url || "");
  var type = "movie";
  var id = "";
  var m = s.match(/\/watch\/(movie|tv)\/(\d+)/i);
  if (m) {
    type = m[1].toLowerCase();
    id = m[2];
  }
  var se = s.match(/[?&#]s=(\d+)/i);
  var ee = s.match(/[?&#]e=(\d+)/i);
  return {
    type: type,
    id: id,
    season: se ? parseInt(se[1], 10) : 1,
    episode: ee ? parseInt(ee[1], 10) : 1
  };
}

function makeHref(type, id, season, episode) {
  var h = apiBase + "/watch/" + type + "/" + id;
  if (type === "tv") {
    h += "?s=" + (season || 1) + "&e=" + (episode || 1);
  }
  return h;
}

function b64(str) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var bytes = [];
  var i;
  for (i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 255);
  var out = "";
  for (i = 0; i < bytes.length; i += 3) {
    var a = bytes[i];
    var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return out;
}

async function searchResults(keyword) {
  try {
    var q = String(keyword || "").replace(/\s+/g, " ").trim();
    if (!q) return "[]";
    var json = await getJson(
      apiBase + "/api/search?query=" + encodeURIComponent(q)
    );
    if (!json || !json.results) return "[]";
    var results = [];
    var seen = {};
    var i;
    for (i = 0; i < json.results.length && results.length < 12; i++) {
      var r = json.results[i];
      if (!r || r.media_type === "person") continue;
      var media = r.media_type === "tv" || (r.name && !r.title) ? "tv" : "movie";
      var id = r.id;
      if (!id || seen[media + id]) continue;
      seen[media + id] = true;
      var title = String(r.title || r.name || "").trim();
      if (!title) continue;
      if (media === "tv") title += " [сериал]";
      var img = "";
      if (r.poster_path) {
        img = r.poster_path.indexOf("http") === 0
          ? r.poster_path
          : tmdbImg + r.poster_path;
      }
      results.push({
        title: title,
        image: img,
        href: makeHref(media, id, 1, 1)
      });
    }
    return JSON.stringify(results);
  } catch (e) {
    return "[]";
  }
}

async function extractDetails(url) {
  try {
    var p = parseHref(url);
    if (!p.id) {
      return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
    }
    var json = await getJson(apiBase + "/api/details/" + p.type + "/" + p.id);
    var overview = "N/A";
    if (json && json.overview) overview = String(json.overview).slice(0, 400);
    return JSON.stringify([
      { description: overview, aliases: "N/A", airdate: "N/A" }
    ]);
  } catch (e) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

async function extractEpisodes(url) {
  try {
    var p = parseHref(url);
    if (!p.id) {
      return JSON.stringify([{ href: String(url), number: 1, season: 1, title: "1" }]);
    }
    if (p.type === "movie") {
      return JSON.stringify([
        { href: makeHref("movie", p.id), number: 1, season: 1, title: "Смотреть" }
      ]);
    }
    // Lightweight: only first 2 seasons, max 40 episodes total (no big memory)
    var src = await getJson(
      apiBase + "/api/source/jator?type=tv&id=" + encodeURIComponent(p.id)
    );
    var eps = [];
    if (src && src.translations && src.translations.length) {
      var tr = null;
      var i;
      for (i = 0; i < src.translations.length; i++) {
        if (src.translations[i].seasons && src.translations[i].seasons.length) {
          tr = src.translations[i];
          break;
        }
      }
      if (tr) {
        var maxSeasons = Math.min(tr.seasons.length, 2);
        for (i = 0; i < maxSeasons; i++) {
          var season = tr.seasons[i];
          var sid = season.season_id != null ? season.season_id : i + 1;
          var episodes = season.episodes || [];
          var maxEp = Math.min(episodes.length, 20);
          var j;
          for (j = 0; j < maxEp; j++) {
            var eid = episodes[j].episode_id != null ? episodes[j].episode_id : j + 1;
            eps.push({
              href: makeHref("tv", p.id, sid, eid),
              number: eid,
              season: sid,
              title: "S" + sid + "E" + eid
            });
          }
        }
      }
    }
    if (!eps.length) {
      eps.push({
        href: makeHref("tv", p.id, 1, 1),
        number: 1,
        season: 1,
        title: "S1E1"
      });
    }
    return JSON.stringify(eps);
  } catch (e) {
    return JSON.stringify([
      { href: String(url), number: 1, season: 1, title: "1" }
    ]);
  }
}

async function extractStreamUrl(url) {
  try {
    var p = parseHref(url);
    if (!p.id) return JSON.stringify({ streams: [], subtitles: "" });

    var src = await getJson(
      apiBase +
        "/api/source/jator?type=" +
        encodeURIComponent(p.type) +
        "&id=" +
        encodeURIComponent(p.id)
    );
    if (!src || !src.translations || !src.translations.length) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    var tr = src.translations[0];
    var dataObj = null;
    if (p.type === "movie") {
      dataObj = tr.data || null;
    } else if (tr.seasons) {
      var si;
      for (si = 0; si < tr.seasons.length; si++) {
        var season = tr.seasons[si];
        var sid = season.season_id != null ? season.season_id : si + 1;
        if (parseInt(sid, 10) !== p.season) continue;
        var episodes = season.episodes || [];
        var ei;
        for (ei = 0; ei < episodes.length; ei++) {
          var eid = episodes[ei].episode_id != null ? episodes[ei].episode_id : ei + 1;
          if (parseInt(eid, 10) === p.episode) {
            dataObj = episodes[ei].data || null;
            break;
          }
        }
        break;
      }
    }
    if (!dataObj) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    var payload = encodeURIComponent(b64(JSON.stringify(dataObj)));
    var resolved = await getJson(
      apiBase + "/api/source/jator?data=" + payload
    );
    if (
      !resolved ||
      !resolved.streams ||
      !resolved.streams.video ||
      !resolved.streams.video.hls ||
      !resolved.streams.video.hls.master
    ) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    var master = String(resolved.streams.video.hls.master).replace(
      /^http:\/\//i,
      "https://"
    );
    if (master.indexOf("http") !== 0) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }

    // Single stream only – avoids crash / black multi-list
    var voice = String(tr.translation_name || "Stream").slice(0, 40);
    return JSON.stringify({
      streams: [{ title: voice, name: voice, streamUrl: master }],
      subtitles: ""
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
