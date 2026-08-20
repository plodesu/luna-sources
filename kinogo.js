const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://kinogo.inc/'
};

const baseUrl = 'https://kinogo.inc';
const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

/**
 * 1. Search TMDB first to convert title to Russian Cyrillic
 */
async function searchResults(keyword) {
    try {
        const cleanQuery = keyword.replace(/Episode\s*\d+/gi, '').replace(/Season\s*\d+/gi, '').trim();
        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanQuery)}&language=ru-RU&include_adult=false`;
        
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const results = (data.results || []).map(item => {
            const title = item.title || item.name || item.original_title || item.original_name;
            const ruTitle = item.title || item.name || title;
            const isMovie = item.media_type === 'movie' || item.title;

            return {
                title: title,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
                href: isMovie ? `movie/${item.id}/${encodeURIComponent(ruTitle)}` : `tv/${item.id}/${encodeURIComponent(ruTitle)}`
            };
        });

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([]);
    }
}

/**
 * 2. Details metadata
 */
async function extractDetails(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        const tmdbUrl = `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const response = await soraFetch(tmdbUrl);
        const data = await response.json();

        return JSON.stringify([{
            description: data.overview || 'Описание отсутствует.',
            aliases: data.original_title || data.original_name || 'N/A',
            airdate: data.release_date || data.first_air_date || 'N/A'
        }]);
    } catch (err) {
        return JSON.stringify([{ description: "Error", aliases: "Error", airdate: "Error" }]);
    }
}

/**
 * Helper: Search KinoGo and return the actual page URL
 */
async function resolveKinoGoPage(ruTitle) {
    try {
        const postData = `do=search&subaction=search&story=${encodeURIComponent(ruTitle)}`;
        const searchRes = await fetchv2(`${baseUrl}/index.php?do=search`, {
            ...defaultHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
        }, 'POST', postData);

        const searchHtml = await searchRes.text();
        const linkMatch = searchHtml.match(/<div class="shortstory-title">\s*<a href="([^"]+)">/i) ||
                          searchHtml.match(/<a href="(https?:\/\/kinogo\.[^"]+\.html)">/i);

        return linkMatch ? linkMatch[1] : null;
    } catch (e) {
        return null;
    }
}

/**
 * 3. Extract Episodes & resolve actual KinoGo link
 */
async function extractEpisodes(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];
        const ruTitle = decodeURIComponent(parts[2] || '');

        const realPageUrl = await resolveKinoGoPage(ruTitle);
        const targetHref = realPageUrl || `${baseUrl}/index.php?do=search&story=${encodeURIComponent(ruTitle)}`;

        if (type === 'movie') {
            return JSON.stringify([{
                href: targetHref,
                number: 1,
                season: 1
            }]);
        }

        // TV Shows
        const response = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`);
        const data = await response.json();

        let allEpisodes = [];
        if (data.seasons) {
            for (const season of data.seasons) {
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= season.episode_count; ep++) {
                    allEpisodes.push({
                        href: targetHref,
                        number: ep,
                        season: season.season_number
                    });
                }
            }
        }

        return JSON.stringify(allEpisodes);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, season: 1 }]);
    }
}

/**
 * 4. Scrape Video Player Streams
 */
async function extractStreamUrl(url) {
    try {
        let targetUrl = url;

        // Fallback search resolver if it was not resolved earlier
        if (url.includes('do=search')) {
            const queryMatch = url.match(/story=([^&]+)/);
            if (queryMatch) {
                const resolved = await resolveKinoGoPage(decodeURIComponent(queryMatch[1]));
                if (resolved) targetUrl = resolved;
            }
        }

        const response = await fetchv2(targetUrl, defaultHeaders);
        const html = await response.text();

        // Locate iframe embed player
        const iframeMatch = html.match(/<iframe[\s\S]*?src=["']([^"']+)["']/i);
        if (!iframeMatch) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        let embedUrl = iframeMatch[1].startsWith('//') ? `https:${iframeMatch[1]}` : iframeMatch[1];

        const playerResponse = await fetchv2(embedUrl, { ...defaultHeaders, 'Referer': targetUrl });
        const playerHtml = await playerResponse.text();

        const streams = [];
        
        // Extract directly formatted .m3u8 / .mp4 streams
        const streamMatches = playerHtml.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi);

        if (streamMatches) {
            streamMatches.forEach(stream => {
                streams.push({
                    title: "KinoGo Stream",
                    streamUrl: stream,
                    headers: {
                        "User-Agent": defaultHeaders["User-Agent"],
                        "Referer": embedUrl
                    }
                });
            });
        }

        // Web player fallback stream object
        if (streams.length === 0) {
            streams.push({
                title: "KinoGo Web Player",
                streamUrl: embedUrl,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": targetUrl
                }
            });
        }

        return JSON.stringify({ streams: streams, subtitle: "" });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}

/**
 * Fetch Utility Function
 */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = defaultHeaders["User-Agent"];
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
