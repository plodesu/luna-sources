const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://videocdn.tv/'
};

const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

/**
 * 1. TMDB Search (Russian Titles)
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
                title: 'Фильм (Русский дубляж)'
            }]);
        }

        const response = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`);
        if (!response) {
            return JSON.stringify([{ href: url, number: 1, title: 'Серия 1' }]);
        }
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
 * 4. Fetch Direct VideoCDN Stream (.m3u8)
 */
async function extractStreamUrl(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const tmdbId = parts[1];
        const season = parts[2] || 1;
        const episode = parts[3] || 1;

        // Query VideoCDN API directly for direct HLS stream manifests
        const cdnApiUrl = `https://videocdn.tv/api/short?api_token=3i40n552ebDomesticToken&tmdb_id=${tmdbId}`;
        const cdnRes = await soraFetch(cdnApiUrl);
        let streams = [];

        if (cdnRes) {
            const data = await cdnRes.json();
            if (data && data.data && data.data.length > 0) {
                const mediaItem = data.data[0];
                let iframeUrl = mediaItem.iframe_src;

                if (iframeUrl) {
                    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
                    
                    const directHls = iframeUrl.replace('/embed/', '/hls/') + '/index.m3u8';
                    
                    streams.push({
                        title: `VideoCDN (${mediaItem.translations ? mediaItem.translations[0].title : 'Русский дубляж'})`,
                        streamUrl: directHls,
                        headers: defaultHeaders
                    });
                }
            }
        }

        // Fallback Direct HLS Stream
        if (streams.length === 0) {
            const fallbackHls = type === 'movie'
                ? `https://vidsrc.me/hls/tmdb/${tmdbId}/ru.m3u8`
                : `https://vidsrc.me/hls/tmdb/${tmdbId}/${season}/${episode}/ru.m3u8`;

            streams.push({
                title: "Russian Audio Direct Stream",
                streamUrl: fallbackHls,
                headers: defaultHeaders
            });
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

/**
 * Sora / Luna Fetch Helper
 */
async function soraFetch(url, options) {
    const opts = options || {};
    const headers = opts.headers || defaultHeaders;
    try {
        return await fetchv2(url, headers, opts.method || 'GET', opts.body || null);
    } catch (e) {
        return await fetch(url, { headers: headers, method: opts.method || 'GET' });
    }
}
