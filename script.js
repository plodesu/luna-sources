async function searchResults(keyword) {
    try {
        const encoded = encodeURIComponent(keyword);
        const targetUrl = `https://shikimori.one/api/animes?search=${encoded}&limit=20`;
        const res = await soraFetch(targetUrl);
        const data = await res.json();

        const results = (data || []).map(item => {
            const posterUrl = item.poster && item.poster.original 
                ? `https://shikimori.one${item.poster.original}` 
                : '';
            return {
                title: item.russian || item.name || 'Аниме',
                image: posterUrl,
                href: `anime/${item.id}`
            };
        });

        return JSON.stringify(results);
    } catch (err) {
        console.log("Search error: " + err);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const parts = url.split('/');
        const animeId = parts[1];
        
        const targetUrl = `https://shikimori.one/api/animes/${animeId}`;
        const res = await soraFetch(targetUrl);
        const item = await res.json();

        return JSON.stringify([{
            description: item.description || 'No description provided on Shikimori.',
            aliases: item.english ? item.english.join(', ') : item.name || '',
            airdate: item.aired_on || 'Unknown'
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: 'Error loading details',
            aliases: '',
            airdate: 'N/A'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const parts = url.split('/');
        const animeId = parts[1];

        const targetUrl = `https://shikimori.one/api/animes/${animeId}`;
        const res = await soraFetch(targetUrl);
        const item = await res.json();

        const episodesCount = item.episodes || 1;
        let episodes = [];

        for (let i = 1; i <= episodesCount; i++) {
            episodes.push({
                href: `play/${animeId}/${i}`,
                number: i,
                title: `Эпизод ${i}`
            });
        }

        return JSON.stringify(episodes);
    } catch (err) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(ID) {
    try {
        const parts = ID.split('/');
        const animeId = parts[1];
        const episodeNum = parts[2] || 1;

        const playerApi = `https://kodikapi.com/search?token=public&shikimori_id=${animeId}&episode=${episodeNum}`;
        const res = await soraFetch(playerApi);
        const data = await res.json();

        let streamUrl = "";
        if (data.results && data.results.length > 0) {
            streamUrl = data.results[0].link;
            if (streamUrl && !streamUrl.startsWith('http')) {
                streamUrl = 'https:' + streamUrl;
            }
        }

        const streams = [{
            title: "🇷🇺 [Shikimori / Translation Mirror] RU Dub",
            streamUrl: streamUrl || "https://kodik.info/",
            headers: {
                "Referer": "https://shikimori.one/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        }];

        return JSON.stringify({
            streams: streams,
            subtitles: ""
        });
    } catch (error) {
        console.log("Stream extraction error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        const res = await fetchv2(url, headers, options.method || 'GET', options.body || null);
        let textRes = res;
        if (res) {
            if (typeof res.text === 'function') {
                textRes = await res.text();
            } else if (typeof res === 'object' && res._data !== undefined) {
                textRes = res._data;
            } else if (typeof res === 'object' && res.body !== undefined) {
                textRes = res.body;
            }
        }
        return {
            json: async () => typeof textRes === 'string' ? JSON.parse(textRes) : textRes,
            text: async () => typeof textRes === 'string' ? textRes : JSON.stringify(textRes)
        };
    } catch (e) {
        try {
            const res = await fetch(url, options);
            return {
                json: async () => await res.json(),
                text: async () => await res.text()
            };
        } catch (err) {
            return null;
        }
    }
}
