const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://kinogomy.net/"
};

const baseUrl = "https://kinogomy.net";
const tmdbApiKey = "ad301b7cc82ffe19273e55e4d4206885";

async function soraFetch(url, options = {}) {
    const headers = Object.assign({}, defaultHeaders, options.headers || {});
    const method = options.method || "GET";
    const body = options.body || null;

    try {
        if (typeof fetchv2 === "function") {
            return await fetchv2(url, headers, method, body);
        }
        return await fetch(url, { headers, method, body });
    } catch (e) {
        try {
            return await fetch(url, { headers, method, body });
        } catch (err) {
            return null;
        }
    }
}

/**
 * 1. Search – TMDB (same method as working HDREZKA / russian_media)
 */
async function searchResults(keyword) {
    try {
        const cleanQuery = keyword.replace(/Episode\s*\d+/gi, "").replace(/Season\s*\d+/gi, "").trim();
        if (!cleanQuery) return JSON.stringify([]);

        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanQuery)}&language=ru-RU&include_adult=false`;
        
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([]);

        const data = await response.json();

        const results = (data.results || []).map(function(item) {
            const title = item.title || item.name || item.original_title || item.original_name || "Untitled";
            const isMovie = item.media_type === "movie" || !!item.title;

            return {
                title: title,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                href: isMovie 
                    ? `movie/${item.id}/${encodeURIComponent(title)}` 
                    : `tv/${item.id}/${encodeURIComponent(title)}`
            };
        });

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([]);
    }
}

/**
 * 2. Details
 */
async function extractDetails(url) {
    try {
        const parts = url.split("/");
        const type = parts[0];
        const id = parts[1];

        const tmdbUrl = `https://api.themoviedb.org/3/${type === "movie" ? "movie" : "tv"}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const response = await soraFetch(tmdbUrl);
        if (!response) {
            return JSON.stringify([{ description: "Описание отсутствует.", aliases: "N/A", airdate: "N/A" }]);
        }
        const data = await response.json();

        return JSON.stringify([{
            description: data.overview || "Описание отсутствует.",
            aliases: data.original_title || data.original_name || "N/A",
            airdate: data.release_date || data.first_air_date || "N/A"
        }]);
    } catch (err) {
        return JSON.stringify([{ description: "Error", aliases: "Error", airdate: "Error" }]);
    }
}

/**
 * Helper – find real page on kinogomy
 */
async function resolveKinoGoPage(ruTitle) {
    try {
        if (!ruTitle) return null;

        const body = `do=search&subaction=search&story=${encodeURIComponent(ruTitle)}`;
        const response = await soraFetch(`${baseUrl}/index.php?do=search`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": defaultHeaders["User-Agent"],
                "Referer": baseUrl + "/"
            },
            body: body
        });

        if (!response) return null;
        const html = await response.text();

        const match = html.match(/<h2 class="zagolovki">\s*<a href="([^"]+)">/i) ||
                      html.match(/<a href="(https?:\/\/kinogomy\.net\/[^"]+\.html)"/i);

        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

/**
 * 3. Episodes
 */
async function extractEpisodes(url) {
    try {
        const parts = url.split("/");
        const type = parts[0];
        const id = parts[1];
        const ruTitle = decodeURIComponent(parts[2] || "");

        const realPage = await resolveKinoGoPage(ruTitle);
        const target = realPage || `${baseUrl}/index.php?do=search&story=${encodeURIComponent(ruTitle)}`;

        if (type === "movie") {
            return JSON.stringify([{
                href: target,
                number: 1,
                title: "Фильм"
            }]);
        }

        // TV
        const response = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`);
        if (!response) {
            return JSON.stringify([{ href: target, number: 1, title: "Серия 1" }]);
        }
        const data = await response.json();

        const allEpisodes = [];
        if (data.seasons) {
            for (const season of data.seasons) {
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= (season.episode_count || 0); ep++) {
                    allEpisodes.push({
                        href: `${target}#s${season.season_number}e${ep}`,
                        number: ep,
                        season: season.season_number,
                        title: `S${season.season_number}E${ep}`
                    });
                }
            }
        }

        if (allEpisodes.length === 0) {
            allEpisodes.push({ href: target, number: 1, title: "Смотреть" });
        }

        return JSON.stringify(allEpisodes);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, title: "Смотреть" }]);
    }
}

/**
 * 4. Streams
 */
async function extractStreamUrl(url) {
    try {
        let cleanUrl = url.split("#")[0];
        const hashMatch = url.match(/#(s\d+e\d+)/i);
        const seasonEpisode = hashMatch ? hashMatch[1] : "";

        if (cleanUrl.includes("do=search")) {
            const q = cleanUrl.match(/story=([^&]+)/);
            if (q) {
                const resolved = await resolveKinoGoPage(decodeURIComponent(q[1]));
                if (resolved) cleanUrl = resolved;
            }
        }

        const response = await soraFetch(cleanUrl);
        if (!response) return JSON.stringify({ streams: [], subtitles: "" });

        const html = await response.text();
        const streams = [];

        const tabRegex = /data-src=["']([^"']+)["'][^>]*>([^<]*)</gi;
        let match;
        while ((match = tabRegex.exec(html)) !== null) {
            let src = match[1].replace(/&amp;/g, "&");
            let title = (match[2] || "Player").trim();

            if (/трейлер|trailer|youtube/i.test(title) || /youtube\.com/i.test(src)) continue;
            if (src.startsWith("//")) src = "https:" + src;

            if (seasonEpisode && !src.includes("#")) {
                src += "#" + seasonEpisode;
            }

            streams.push({
                title: "KinoGo – " + title,
                streamUrl: src,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": cleanUrl
                }
            });
        }

        if (streams.length === 0) {
            const iframe = html.match(/id=["']iframesrc["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframe) {
                let src = iframe[1].replace(/&amp;/g, "&");
                if (src.startsWith("//")) src = "https:" + src;
                streams.push({
                    title: "KinoGo Default",
                    streamUrl: src,
                    headers: {
                        "User-Agent": defaultHeaders["User-Agent"],
                        "Referer": cleanUrl
                    }
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
