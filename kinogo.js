const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://kinogo.inc/'
};

const baseUrl = 'https://kinogo.inc';
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
 * 4. Dub & Player Selector Extractor
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
        if (!response) {
            return JSON.stringify({ streams: [], subtitles: "" });
        }
        const html = await response.text();

        let streams = [];

        // Look for translation / dub menu options or data attributes containing alternative player links
        // KinoGo typically stores alternative player links or translator names in data attributes or translation lists
        const dataLinkRegex = /data-(?:link|file|src|translate|player)=["']([^"']+)["']/gi;
        let match;
        let index = 1;

        while ((match = dataLinkRegex.exec(html)) !== null) {
            let link = match[1];
            if (!link) continue;

            if (link.startsWith('//')) link = 'https:' + link;
            else if (link.startsWith('/')) link = baseUrl + link;

            if (!streams.some(s => s.streamUrl === link)) {
                streams.push({
                    title: `Dub / Translation ${index++}`,
                    streamUrl: link,
                    headers: {
                        "User-Agent": defaultHeaders["User-Agent"],
                        "Referer": targetUrl
                    }
                });
            }
        }

        // Fallback to standard iframes if no custom data links were captured
        if (streams.length === 0) {
            const iframeRegex = /<iframe[\s\S]*?src=["']([^"']+)["']/gi;
            while ((match = iframeRegex.exec(html)) !== null) {
                let iframeSrc = match[1];
                if (!iframeSrc) continue;

                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = baseUrl + iframeSrc;

                if (!iframeSrc.includes('facebook') && !iframeSrc.includes('vk.com')) {
                    streams.push({
                        title: `KinoGo Player ${index++}`,
                        streamUrl: iframeSrc,
                        headers: {
                            "User-Agent": defaultHeaders["User-Agent"],
                            "Referer": targetUrl
                        }
                    });
                }
            }
        }

        if (streams.length === 0) {
            streams.push({
                title: "KinoGo Web Player",
                streamUrl: targetUrl,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": baseUrl
                }
            });
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
