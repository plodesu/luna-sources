const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://kinogomy.net/'
};

const baseUrl = 'https://kinogomy.net';

async function searchResults(keyword) {
    const results = [];
    try {
        // Use GET search (same style as HDRezka)
        const url = `${baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(keyword)}`;
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();

        // Parse current site structure
        const parts = html.split('class="shortstory"');
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];

            const linkMatch = part.match(/<h2 class="zagolovki">\s*<a href="([^"]+)">\s*<span[^>]*>([^<]+)<\/span>/i) ||
                              part.match(/<a href="(https?:\/\/kinogomy\.net\/[^"]+\.html)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i);

            const imgMatch = part.match(/data-src="(\/uploads\/posts\/[^"]+)"/i) ||
                             part.match(/src="(\/uploads\/posts\/[^"]+)"/i);

            if (linkMatch) {
                let href = linkMatch[1];
                let title = linkMatch[2].replace(/\s+/g, ' ').trim();
                let image = '';

                if (imgMatch) {
                    image = imgMatch[1].startsWith('http') ? imgMatch[1] : baseUrl + imgMatch[1];
                }

                results.push({
                    title: title,
                    image: image,
                    href: href
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();

        let description = 'Описание отсутствует.';
        const descMatch = html.match(/<div class="full-text"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = descMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 500);
        }

        let year = 'N/A';
        const yearMatch = html.match(/(?:Год|year)[^0-9]{0,30}(\d{4})/i);
        if (yearMatch) year = yearMatch[1];

        return JSON.stringify([{
            description: description,
            aliases: 'N/A',
            airdate: year
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: 'Error',
            aliases: 'Error',
            airdate: 'Error'
        }]);
    }
}

async function extractEpisodes(url) {
    // For both movies and series just return the page
    return JSON.stringify([{
        href: url,
        number: 1,
        title: 'Смотреть'
    }]);
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();
        const streams = [];

        // Current players use data-src
        const tabRegex = /data-src=["']([^"']+)["'][^>]*>([^<]*)</gi;
        let match;
        while ((match = tabRegex.exec(html)) !== null) {
            let src = match[1].replace(/&amp;/g, '&');
            let title = (match[2] || 'Player').trim();

            if (/трейлер|trailer|youtube/i.test(title) || /youtube\.com|youtu\.be/i.test(src)) continue;
            if (src.startsWith('//')) src = 'https:' + src;
            if (!src.startsWith('http')) continue;

            streams.push({
                title: 'KinoGo – ' + title,
                streamUrl: src,
                headers: {
                    'User-Agent': defaultHeaders['User-Agent'],
                    'Referer': url
                }
            });
        }

        // Fallback iframe
        if (streams.length === 0) {
            const iframe = html.match(/id=["']iframesrc["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframe) {
                let src = iframe[1].replace(/&amp;/g, '&');
                if (src.startsWith('//')) src = 'https:' + src;

                streams.push({
                    title: 'KinoGo Default',
                    streamUrl: src,
                    headers: {
                        'User-Agent': defaultHeaders['User-Agent'],
                        'Referer': url
                    }
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: '' });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: '' });
    }
}
