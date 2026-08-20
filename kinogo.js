const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://kinogomy.net/",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
};

const baseUrl = "https://kinogomy.net";
const tmdbApiKey = "ad301b7cc82ffe19273e55e4d4206885";

async function soraFetch(url, options = {}) {
    const headers = { ...defaultHeaders, ...(options.headers || {}) };
    const method = options.method || "GET";
    const body = options.body || null;

    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            return await fetch(url, { headers, method, body });
        } catch (err) {
            return null;
        }
    }
}

/**
 * 1. Search (TMDB → Russian titles)
 */
async function searchResults(keyword) {
    try {
        const clean = keyword
            .replace(/Episode\s*\d+/gi, "")
            .replace(/Season\s*\d+/gi, "")
            .trim();

        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(clean)}&language=ru-RU&include_adult=false`;
        const res = await soraFetch(tmdbUrl);
        if (!res) return JSON.stringify([]);

        const data = await res.json();
        const results = (data.results || []).map(item => {
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
    } catch (e) {
        return JSON.stringify([]);
    }
}

/**
 * 2. Details
 */
async function extractDetails(url) {
    try {
        const [type, id] = url.split("/");
        const tmdbUrl = `https://api.themoviedb.org/3/${type === "movie" ? "movie" : "tv"}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const res = await soraFetch(tmdbUrl);
        if (!res) {
            return JSON.stringify([{ description: "Описание отсутствует.", aliases: "N/A", airdate: "N/A" }]);
        }
        const data = await res.json();

        return JSON.stringify([{
            description: data.overview || "Описание отсутствует.",
            aliases: data.original_title || data.original_name || "N/A",
            airdate: data.release_date || data.first_air_date || "N/A"
        }]);
    } catch (e) {
        return JSON.stringify([{ description: "Error", aliases: "Error", airdate: "Error" }]);
    }
}

/**
 * Helper – find real KinoGo page by Russian title
 */
async function resolveKinoGoPage(ruTitle) {
    try {
        if (!ruTitle) return null;

        const body = `do=search&subaction=search&story=${encodeURIComponent(ruTitle)}`;
        const res = await soraFetch(`${baseUrl}/index.php?do=search`, {
            method: "POST",
            headers: {
                ...defaultHeaders,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        });

        if (!res) return null;
        const html = await res.text();

        // Current site patterns
        const match =
            html.match(/<div class="shortstory-title">\s*<a href="([^"]+)">/i) ||
            html.match(/<a href="(https?:\/\/kinogomy\.net\/[^"]+\.html)"/i) ||
            html.match(/href="(\/[^"]+\.html)"[^>]*>[\s\S]*?shortstory/i);

        if (!match) return null;
        let link = match[1];
        if (link.startsWith("/")) link = baseUrl + link;
        return link;
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
                title: "Full Movie"
            }]);
        }

        // TV – build from TMDB seasons
        const res = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`);
        if (!res) {
            return JSON.stringify([{ href: target, number: 1, title: "Episode 1" }]);
        }
        const data = await res.json();

        const episodes = [];
        if (data.seasons) {
            for (const season of data.seasons) {
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= (season.episode_count || 0); ep++) {
                    episodes.push({
                        href: `${target}#s${season.season_number}e${ep}`,
                        number: ep,
                        season: season.season_number,
                        title: `S${season.season_number}E${ep}`
                    });
                }
            }
        }

        if (episodes.length === 0) {
            episodes.push({ href: target, number: 1, title: "Full Show" });
        }

        return JSON.stringify(episodes);
    } catch (e) {
        return JSON.stringify([{ href: url, number: 1, title: "Full Show" }]);
    }
}

/**
 * 4. Stream extractor (updated for current players)
 */
async function extractStreamUrl(url) {
    try {
        let cleanUrl = url.split("#")[0];
        const hashMatch = url.match(/#(s\d+e\d+)/i);
        const seasonEpisode = hashMatch ? hashMatch[1] : "";

        // Resolve search URLs
        if (cleanUrl.includes("do=search")) {
            const q = cleanUrl.match(/story=([^&]+)/);
            if (q) {
                const resolved = await resolveKinoGoPage(decodeURIComponent(q[1]));
                if (resolved) cleanUrl = resolved;
            }
        }

        const res = await soraFetch(cleanUrl, { headers: defaultHeaders });
        if (!res) return JSON.stringify({ streams: [], subtitles: "" });

        const html = await res.text();
        const streams = [];

        // Current site: <li ... data-src="..." data-tab="...">Title</li>
        const tabRegex = /<li[^>]+data-src=["']([^"']+)["'][^>]*>([^<]+)<\/li>/gi;
        let m;
        while ((m = tabRegex.exec(html)) !== null) {
            let src = m[1].replace(/&amp;/g, "&");
            const title = m[2].trim();

            if (/трейлер|trailer/i.test(title)) continue;
            if (src.startsWith("//")) src = "https:" + src;

            if (seasonEpisode && !src.includes("#")) {
                src += "#" + seasonEpisode;
            }

            streams.push({
                title: `KinoGo – ${title}`,
                streamUrl: src,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": cleanUrl
                }
            });
        }

        // Fallback – main iframe
        if (streams.length === 0) {
            const iframe =
                html.match(/id=["']iframesrc["'][^>]+src=["']([^"']+)["']/i) ||
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

        return JSON.stringify({ streams, subtitles: "" });
    } catch (e) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
