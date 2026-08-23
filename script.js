async function searchResults(keyword) {
    try {
        const encoded = encodeURIComponent(keyword);
        // Using an open proxy to prevent German IP/ISP blocks on the Kodik API
        const targetUrl = `https://kodikapi.com/search?token=public&title=${encoded}&limit=20`;
        const proxyUrl = `https://api.allorigins.win/raw?url=` + encodeURIComponent(targetUrl);
        
        const res = await soraFetch(proxyUrl);
        const data = await res.json();

        const results = (data.results || []).map(item => ({
            title: item.title || item.original_title || 'Видео',
            image: item.poster || '',
            href: `kodik/${item.id}/${encodeURIComponent(item.link || '')}`
        }));

        return JSON.stringify(results);
    } catch (err) {
        console.log("Search error: " + err);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        return JSON.stringify([{
            description: 'Russian voice-over and translation stream via Kodik network.',
            aliases: 'Kodik Translation',
            airdate: 'Available'
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        // Parse ID and link from href
        const parts = url.split('/');
        const kodikId = parts[1];
        
        // Return default single entry or expanded list if it's a movie/series link
        return JSON.stringify([
            { href: url, number: 1, title: "Stream / Episode 1" }
        ]);
    } catch (err) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(ID) {
    try {
        // Extract the embedded link stored in the href
        const parts = ID.split('/');
        parts.shift(); // remove 'kodik'
        parts.shift(); // remove id
        const encodedLink = parts.join('/');
        const decodedLink = decodeURIComponent(encodedLink);

        let streamUrl = decodedLink;
        if (streamUrl && !streamUrl.startsWith('http')) {
            streamUrl = 'https:' + streamUrl;
        }

        const streams = [{
            title: "🇷🇺 [Kodik] RU Dub / Sub",
            streamUrl: streamUrl || "https://kodik.info/",
            headers: {
                "Referer": "https://kodik.info/",
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
        return {
            json: async () => typeof res === 'string' ? JSON.parse(res) : (typeof res.json === 'function' ? await res.json() : res),
            text: async () => typeof res === 'string' ? res : (typeof res.text === 'function' ? await res.text() : JSON.stringify(res))
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
