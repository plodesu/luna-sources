const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://kinogo.inc/'
};

const baseUrl = 'https://kinogo.inc';

async function searchResults(keyword) {
    const results = [];
    try {
        const postData = `do=search&subaction=search&story=${encodeURIComponent(keyword)}`;
        const headers = {
            ...defaultHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const response = await fetchv2(`${baseUrl}/index.php?do=search`, headers, 'POST', postData);
        const html = await response.text();

        const parts = html.split('<div class="shortstory-title">');
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            const linkMatch = part.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
            const imgMatch = part.match(/<img[^>]+src="([^"]+)"/);

            if (linkMatch && imgMatch) {
                let imgUrl = imgMatch[1].trim();
                if (!imgUrl.startsWith('http')) {
                    imgUrl = `${baseUrl}${imgUrl}`;
                }

                results.push({
                    title: decodeHtmlEntities(linkMatch[2].replace(/<[^>]*>/g, '').trim()),
                    image: imgUrl,
                    href: linkMatch[1].trim()
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();

        const descMatch = html.match(/<div[^>]+id="news-id-[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<div class="fullstory-description">([\s\S]*?)<\/div>/i);
        const description = descMatch ? decodeHtmlEntities(descMatch[1].replace(/<[^>]*>/g, '').trim()) : "N/A";

        const origMatch = html.match(/<li><b>Оригинальное название:<\/b>\s*([^<]+)<\/li>/i);
        const aliases = origMatch ? decodeHtmlEntities(origMatch[1].trim()) : "N/A";

        const yearMatch = html.match(/<li><b>Год выпуска:<\/b>\s*<a[^>]*>(\d+)<\/a>/i);
        const airdate = yearMatch ? yearMatch[1].trim() : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: aliases,
            airdate: airdate
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();

        const iframeMatch = html.match(/<iframe[\s\S]*?src=["']([^"']+)["']/i);
        if (!iframeMatch) {
            return JSON.stringify([{
                href: url,
                number: 1,
                season: 1
            }]);
        }

        const embedUrl = iframeMatch[1].startsWith('//') ? `https:${iframeMatch[1]}` : iframeMatch[1];
        
        return JSON.stringify([{
            href: appendQueryParams(url, { embed: embedUrl }),
            number: 1,
            season: 1
        }]);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error",
            season: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        let embedUrl = getQueryParam(url, "embed");
        const basePageUrl = url.split('?')[0];

        if (!embedUrl) {
            const response = await fetchv2(basePageUrl, defaultHeaders);
            const html = await response.text();
            const iframeMatch = html.match(/<iframe[\s\S]*?src=["']([^"']+)["']/i);
            
            if (iframeMatch) {
                embedUrl = iframeMatch[1].startsWith('//') ? `https:${iframeMatch[1]}` : iframeMatch[1];
            } else {
                embedUrl = basePageUrl;
            }
        }

        const embedHeaders = {
            ...defaultHeaders,
            'Referer': basePageUrl
        };

        const playerResponse = await fetchv2(embedUrl, embedHeaders);
        const playerHtml = await playerResponse.text();

        const allStreams = [];

        const streamMatch = playerHtml.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/gi) ||
                            playerHtml.match(/file\s*:\s*["']([^"']+)["']/gi);

        if (streamMatch) {
            for (const match of streamMatch) {
                let cleanUrl = match.replace(/file\s*:\s*["']/i, '').replace(/["']$/, '');
                if (cleanUrl.startsWith('//')) cleanUrl = `https:${cleanUrl}`;

                allStreams.push({
                    title: "KinoGo Stream",
                    streamUrl: cleanUrl,
                    headers: {
                        "User-Agent": defaultHeaders["User-Agent"],
                        "Referer": embedUrl
                    }
                });
            }
        }

        if (allStreams.length === 0) {
            allStreams.push({
                title: "KinoGo Web Stream",
                streamUrl: embedUrl,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": basePageUrl
                }
            });
        }

        return JSON.stringify({
            streams: allStreams,
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}

function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'");
}

function getQueryParam(url, name) {
    try {
        const parsed = new URL(url);
        return parsed.searchParams.get(name);
    } catch (e) {
        const regex = new RegExp('[?&]' + name + '=([^&#]*)');
        const match = regex.exec(url);
        return match ? decodeURIComponent(match[1]) : null;
    }
}

function appendQueryParams(url, params) {
    const separator = url.includes('?') ? '&' : '?';
    const queryString = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return `${url}${separator}${queryString}`;
}
