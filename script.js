const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
};

const workerUrl = 'https://ru-cinema-relay.justalihan095.workers.dev';
const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

/**
 * 1. TMDB Search (Movies & TV Shows)
 */
async function searchResults(keyword) {
    try {
        const cleanQuery = keyword.replace(/Episode\s*\d+/gi, '').replace(/Season\s*\d+/gi, '').trim();
        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanQuery)}&include_adult=false`;
        
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const results = (data.results || []).map(function(item) {
            const title = item.title || item.name || item.original_title || item.original_name || 'Untitled';
            const isMovie = item.media_type === 'movie' || item.title;

            return {
                title: title,
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
 * 2. Detailed Metadata Extraction
 */
async function extractDetails(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        const tmdbUrl = `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${id}?api_key=${tmdbApiKey}`;
        const response = await soraFetch(tmdbUrl);
        if (!response) return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
        
        const data = await response.json();
        return JSON.stringify([{
            description: data.overview || 'No description available.',
            aliases: data.original_title || data.original_name || 'N/A',
            airdate: data.release_date || data.first_air_date || 'N/A'
        }]);
    } catch (err) {
        return JSON.stringify([{ description: 'Error', aliases: 'Error', airdate: 'Error' }]);
    }
}

/**
 * 3. Episode & Season Builder
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
                title: 'Movie'
            }]);
        }

        const response = await soraFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}`);
        if (!response) return JSON.stringify([{ href: url, number: 1, title: 'Episode 1' }]);
        
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
                        title: `Season ${season.season_number} Episode ${ep}`
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
 * 4. Fetch Streams from Cloudflare Worker
 */
async function extractStreamUrl(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const tmdbId = parts[1];
        const season = parts[2] || 1;
        const episode = parts[3] || 1;

        const relayTarget = `${workerUrl}?tmdb=${tmdbId}&type=${type}&s=${season}&e=${episode}`;
        const res = await soraFetch(relayTarget);
        
        if (!res) return JSON.stringify({ streams: [], subtitles: "" });
        const data = await res.json();

        return JSON.stringify(data);
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

/**
 * Multi-environment Fetch Helper
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
