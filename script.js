const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

async function searchResults(keyword) {
    try {
        const cleanQuery = keyword.replace(/Episode\s*\d+/gi, '').replace(/Season\s*\d+/gi, '').trim();
        const proxyUrl = `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanQuery)}&language=ru-RU&include_adult=false`)}&simple=true`;
        
        const response = await soraFetch(proxyUrl);
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const results = (data.results || []).map(item => {
            const title = item.title || item.name || item.original_title || 'Untitled';
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
        const proxyUrl = `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbApiKey}&language=ru-RU`)}&simple=true`;
        
        const response = await soraFetch(proxyUrl);
        if (!response) return JSON.stringify([{ description: 'Описание отсутствует.', aliases: 'N/A', airdate: 'N/A' }]);
        
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

async function extractEpisodes(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];

        if (type === 'movie') {
            return JSON.stringify([{ href: `movie/${id}`, number: 1, title: 'Полный фильм (Russian Dub)' }]);
        }

        const proxyUrl = `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`)}&simple=true`;
        const response = await soraFetch(proxyUrl);
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
        return JSON.stringify(allEpisodes.length ? allEpisodes : [{ href: url, number: 1, title: 'Full Show' }]);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, title: 'Full Show' }]);
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

        let streamObjects = [];

        // Query Kinobox API via proxy to aggregate Russian translation players (Kodik, Collaps, etc.)
        const kinoboxApi = `https://kinobox.tv/api/players?tmdb=${tmdbID}`;
        const res = await soraFetch(kinoboxApi, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://kinobox.tv/"
            }
        });

        if (res) {
            const players = await res.json();
            if (Array.isArray(players)) {
                for (const player of players) {
                    if (!player.iframeUrl) continue;
                    let iframeUrl = player.iframeUrl.startsWith("//") ? "https:" + player.iframeUrl : player.iframeUrl;

                    if (!isMovie) {
                        iframeUrl += (iframeUrl.includes("?") ? "&" : "?") + `season=${season}&episode=${episode}`;
                    }

                    // Scrape the iframe source for raw .m3u8 links
                    const iframeRes = await soraFetch(iframeUrl, {
                        headers: { "Referer": "https://kinobox.tv/" }
                    });

                    if (iframeRes) {
                        const html = await iframeRes.text();
                        const matches = html.match(/(https?:\/\/[^\s"'`<>]+?\.m3u8[^\s"'`<>]*)/gi) || [];
                        
                        for (const rawUrl of matches) {
                            const cleanUrl = rawUrl.replace(/\\/g, "");
                            const sourceName = player.source ? player.source.toUpperCase() : "RU Server";
                            
                            if (!streamObjects.some(s => s.streamUrl === cleanUrl)) {
                                streamObjects.push({
                                    title: `[${sourceName}] 🇷🇺 Russian Dub`,
                                    streamUrl: cleanUrl,
                                    headers: {
                                        "User-Agent": "Mozilla/5.0",
                                        "Referer": iframeUrl
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }

        return JSON.stringify({ streams: streamObjects, subtitles: "" });
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
