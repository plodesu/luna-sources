const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

async function searchResults(keyword) {
    try {
        const query = encodeURIComponent(keyword.trim());
        const url = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${query}&language=ru-RU&include_adult=false`;
        
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const results = (data.results || []).map(item => {
            const title = item.title || item.name || item.original_title || 'Видео';
            const isMovie = item.media_type === 'movie' || item.title;
            return {
                title: title,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
                href: isMovie ? `movie/${item.id}` : `tv/${item.id}/1/1`
            };
        });

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];
        const url_api = `https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        
        const response = await soraFetch(url_api);
        if (!response) return JSON.stringify([{ description: 'Описание отсутствует.', aliases: 'N/A', airdate: 'N/A' }]);
        
        const data = await response.json();
        return JSON.stringify([{
            description: data.overview || 'Описание отсутствует.',
            aliases: data.original_title || data.original_name || 'N/A',
            airdate: data.release_date || data.first_air_date || 'N/A'
        }]);
    } catch (err) {
        return JSON.stringify([{ description: 'Ошибка', aliases: 'N/A', airdate: 'N/A' }]);
    }
}

async function extractEpisodes(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        if (type === 'movie') {
            return JSON.stringify([{ href: `movie/${id}`, number: 1, title: 'Полный фильм' }]);
        }

        const url_api = `https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const response = await soraFetch(url_api);
        if (!response) return JSON.stringify([{ href: url, number: 1, title: 'Серия 1' }]);
        
        const data = await response.json();
        let allEpisodes = [];
        
        if (data.seasons) {
            for (const season of data.seasons) {
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
        return JSON.stringify(allEpisodes.length ? allEpisodes : [{ href: url, number: 1, title: 'Серия 1' }]);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, title: 'Серия 1' }]);
    }
}

async function extractStreamUrl(ID) {
    try {
        let isMovie = ID.includes('movie');
        let tmdbID, season = 1, episode = 1;

        if (isMovie) {
            tmdbID = ID.replace('movie/', '').replace('/', '');
        } else {
            const parts = ID.split('/');
            tmdbID = parts[1];
            season = parts[2] || 1;
            episode = parts[3] || 1;
        }

        // Multi-server setup mapping global/Russian proxy distribution layers
        let streams = [
            {
                title: "🇷🇺 [Kodik] RU Dub (1080p)",
                streamUrl: isMovie 
                    ? `https://kinobox.tv/embed/movie/${tmdbID}` 
                    : `https://kinobox.tv/embed/tv/${tmdbID}/${season}/${episode}`
            },
            {
                title: "🇷🇺 [Collaps] Multi-Voice (1080p)",
                streamUrl: isMovie 
                    ? `https://api.delivemb.ws/embed/movie/${tmdbID}` 
                    : `https://api.delivemb.ws/embed/tv/${tmdbID}/${season}/${episode}`
            },
            {
                title: "🇷🇺 [Vibix] Studio Translation",
                streamUrl: isMovie 
                    ? `https://vibix.org/embed/${tmdbID}` 
                    : `https://vibix.org/embed/${tmdbID}?season=${season}&episode=${episode}`
            }
        ];

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        let res = await fetchv2(url, headers, options.method || 'GET', options.body || null);
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
            const res = await fetch(url, options);
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
