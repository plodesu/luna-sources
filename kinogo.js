const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Referer': 'https://kinogomy.net/'
};

const baseUrl = 'https://kinogomy.net';
const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

/**
 * 1. TMDB Search (Russian Translation Handler)
 */
async function searchResults(keyword) {
    try {
        const cleanQuery = keyword.replace(/Episode\s*\d+/gi, '').replace(/Season\s*\d+/gi, '').trim();
        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanQuery)}&language=ru-RU&include_adult=false`;
        
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const results = (data.results || []).map(function(item) {
            const title = item.title || item.name || item.original_title || item.original_name || 'Untitled';
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
 * 2. Details Metadata
 */
async function extractDetails(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        const tmdbUrl = `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const response = await soraFetch(tmdbUrl);
        if (!response) {
            return JSON.stringify([{ description: 'Описание отсутствует.', aliases: 'N/A', airdate: 'N/A' }]);
        }
        const data = await response.json();

        return JSON.stringify([{
            description: data.overview || 'Описание отсутствует.',
            aliases: data.original_title || data.original_name || 'N/A',
            airdate: data.release_date || data.first_air_date || 'N/A'
        }]);
    } catch (err) {
        return JSON.stringify([{ description: 'Error loading details', aliases: 'Error', airdate: 'Error' }]);
    }
}

/**
 * Helper: Resolve KinoGo Page URL from TMDB Title
 */
async function resolveKinoGoPage(ruTitle) {
    try {
        if (!ruTitle) return null;
        const postData = `do=search&subaction=search&story=${encodeURIComponent(ruTitle)}`;
        const response = await soraFetch(`${baseUrl}/index.php?do=search`, {
            method: 'POST',
            headers: {
                ...defaultHeaders,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        });

        if (!response) return null;
        const searchHtml = await response.text();
        
        const linkMatch = searchHtml.match(/<div class="shortstory-title">\s*<a href="([^"]+)">/i) ||
                          searchHtml.match(/<a href="(https?:\/\/[^"]+\.html)">/i);

        return linkMatch ? linkMatch[1] : null;
    } catch (e) {
        return null;
    }
}

/**
 * 3. Extract Episodes
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
                title: 'Full Movie'
            }]);
        }

        const response = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`);
        if (!response) {
            return JSON.stringify([{ href: targetHref, number: 1, title: 'Episode 1' }]);
        }
        const data = await response.json();

        let allEpisodes = [];
        if (data.seasons && data.seasons.length) {
            for (let i = 0; i < data.seasons.length; i++) {
                const season = data.seasons[i];
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= season.episode_count; ep++) {
                    allEpisodes.push({
                        href: `${targetHref}#s${season.season_number}e${ep}`,
                        number: ep,
                        season: season.season_number,
                        title: `Season ${season.season_number} Episode ${ep}`
                    });
                }
            }
        }

        if (allEpisodes.length === 0) {
            allEpisodes.push({ href: targetHref, number: 1, title: 'Full Show' });
        }

        return JSON.stringify(allEpisodes);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, title: 'Full Movie' }]);
    }
}

/**
 * 4. Advanced Tab & Player Extractor
 */
async function extractStreamUrl(url) {
    try {
        let targetUrl = url.split('#')[0];

        if (targetUrl.includes('do=search')) {
            const queryMatch = targetUrl.match(/story=([^&]+)/);
            if (queryMatch) {
                const resolved = await resolveKinoGoPage(decodeURIComponent(queryMatch[1]));
                if (resolved) targetUrl = resolved;
            }
        }

        const response = await soraFetch(targetUrl, { headers: defaultHeaders });
        if (!response) return JSON.stringify({ streams: [], subtitles: "" });
        
        const html = await response.text();
        let streams = [];

        // 1. Scrape the specific 'data-src' attributes from the tabs list
        const tabRegex = /<li[^>]+data-src=["']([^"']+)["'][^>]*>([^<]+)<\/li>/gi;
        let match;

        while ((match = tabRegex.exec(html)) !== null) {
            let src = match[1];
            let title = match[2].trim();

            // Ignore trailers
            if (title.toLowerCase().includes('трейлер')) continue;

            // Clean up the URL
            if (src.startsWith('//')) src = 'https:' + src;

            streams.push({
                title: `KinoGo - ${title}`,
                streamUrl: src,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": targetUrl,
                    "Origin": "https://kinogomy.net"
                }
            });
        }

        // 2. Fallback to the iframe src if nothing is found from tabs
        if (streams.length === 0) {
            const iframeMatch = html.match(/id="iframesrc"[^>]+src=["']([^"']+)["']/i) || html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                let src = iframeMatch[1];
                if (src.startsWith('//')) src = 'https:' + src;
                
                streams.push({
                    title: "KinoGo Default Player",
                    streamUrl: src,
                    headers: {
                        "User-Agent": defaultHeaders["User-Agent"],
                        "Referer": targetUrl,
                        "Origin": "https://kinogomy.net"
                    }
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

/**
 * Fetch Utility Function
 */
async function soraFetch(url, options) {
    const opts = options || {};
    const headers = opts.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = defaultHeaders["User-Agent"];
    }
    const method = opts.method || 'GET';
    const body = opts.body || null;

    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            return await fetch(url, { headers: headers, method: method, body: body });
        } catch (error) {
            return null;
        }
    }
}
