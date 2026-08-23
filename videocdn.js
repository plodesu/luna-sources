 const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://kinogomy.net/'
};

const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

/**
 * 1. TMDB Universal Search (Russian Metadata)
 */
async function searchResults(keyword) {
    try {
        const cleanQuery = keyword.replace(/Episode\s*\d+/gi, '').replace(/Season\s*\d+/gi, '').trim();
        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanQuery)}&language=ru-RU&include_adult=false`;
        
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const results = (data.results || []).map(function(item) {
            const ruTitle = item.title || item.name || item.original_title || item.original_name || 'Untitled';
            const isMovie = item.media_type === 'movie' || item.title;

            return {
                title: ruTitle,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
                href: isMovie ? `movie/${item.id}` : `tv/${item.id}`
            };
        });

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([]);
    }
}

/**
 * 2. Extract Details
 */
async function extractDetails(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        const tmdbUrl = `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
        
        const data = await response.json();
        return JSON.stringify([{
            description: data.overview || 'Описание отсутствует.',
            aliases: data.original_title || data.original_name || 'N/A',
            airdate: data.release_date || data.first_air_date || 'N/A'
        }]);
    } catch (err) {
        return JSON.stringify([{ description: 'Error', aliases: 'Error', airdate: 'Error' }]);
    }
}

/**
 * 3. Extract Episodes & Seasons
 */
async function extractEpisodes(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        if (type === 'movie') {
            return JSON.stringify([{
                href: `movie/${id}`,
                number: 1,
                title: 'Фильм (Русская озвучка)'
            }]);
        }

        const response = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`);
        if (!response) return JSON.stringify([{ href: url, number: 1, title: 'Серия 1' }]);
        
        const data = await response.json();
        let allEpisodes = [];
        
        if (data.seasons && data.seasons.length) {
            for (let i = 0; i < data.seasons.length; i++) {
                const season = data.seasons[i];
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= season.episode_count; ep++) {
                    allEpisodes.push({
                        href: `tv/${id}/${season.season_number}/${ep}`,
                        number: ep,
                        season: season.season_number,
                        title: `Сезон ${season.season_number} Серия ${ep}`
                    });
                }
            }
        }

        if (allEpisodes.length === 0) {
            allEpisodes.push({ href: url, number: 1, title: 'Full Show' });
        }

        return JSON.stringify(allEpisodes);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, title: 'Full Show' }]);
    }
}

/**
 * 4. Extract Real Direct Streams for Sora / Luna
 */
async function extractStreamUrl(url) {
    try {
        const parts = url.split('/');
        const tmdbId = parts[1];
        let streams = [];
        
        const kinoboxApi = `https://kinobox.tv/api/players?tmdb=${tmdbId}`;
        const kbRes = await soraFetch(kinoboxApi);
        
        if (kbRes) {
            const players = await kbRes.json();
            
            if (Array.isArray(players)) {
                for (let i = 0; i < players.length; i++) {
                    let iframeUrl = players[i].iframeUrl;
                    if (!iframeUrl) continue;
                    
                    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
                    
                    const iframeRes = await soraFetch(iframeUrl, { headers: { 'Referer': 'https://kinobox.tv/' } });
                    if (!iframeRes) continue;
                    
                    const iframeHtml = await iframeRes.text();
                    
                    // Regex scan for raw HLS (.m3u8) or MP4 files inside the stream scripts
                    const fileMatches = iframeHtml.match(/(https?:\/\/[^\s"'`<>]+?\.(?:m3u8|mp4)[^\s"'`<>]*)/gi) || [];
                    
                    for (let j = 0; j < fileMatches.length; j++) {
                        let rawUrl = fileMatches[j].replace(/\\/g, ''); 
                        
                        if (!streams.some(s => s.streamUrl === rawUrl)) {
                            const serverName = players[i].source ? players[i].source.toUpperCase() : 'Server';
                            
                            streams.push({
                                title: `${serverName} (Russian Dub)`,
                                streamUrl: rawUrl,
                                headers: defaultHeaders
                            });
                        }
                    }
                }
            }
        }

        return JSON.stringify({
            streams: streams,
            subtitles: ""
        });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

/**
 * Multi-environment Sora / Luna Fetch Helper
 */
async function soraFetch(url, options) {
    const opts = options || {};
    const headers = opts.headers || defaultHeaders;
    try {
        let res = await fetchv2(url, headers, opts.method || 'GET', opts.body || null);
        let textRes = res;
        
        if (res && typeof res.text === 'function') {
            textRes = await res.text();
        } else if (res && typeof res === 'object') {
            textRes = res._data || res.body || res;
        }

        return {
            text: async () => typeof textRes === 'string' ? textRes : JSON.stringify(textRes),
            json: async () => typeof textRes === 'string' ? JSON.parse(textRes) : textRes
        };
    } catch (e) {
        try {
            const res = await fetch(url, { headers: headers, method: opts.method || 'GET' });
            const text = await res.text();
            return {
                text: async () => text,
                json: async () => JSON.parse(text)
            };
        } catch (err) {
            return null;
        }
    }
}
