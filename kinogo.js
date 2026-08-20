const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://kinogomy.net/",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
};

const baseUrl = "https://kinogomy.net";

async function soraFetch(url, options = {}) {
    const headers = Object.assign({}, defaultHeaders, options.headers || {});
    const method = options.method || "GET";
    const body = options.body || null;

    try {
        if (typeof fetchv2 === "function") {
            return await fetchv2(url, headers, method, body);
        }
        return await fetch(url, { headers: headers, method: method, body: body });
    } catch (e) {
        try {
            return await fetch(url, { headers: headers, method: method, body: body });
        } catch (err) {
            return null;
        }
    }
}

/**
 * MAIN SEARCH – direct on kinogomy.net (no TMDB dependency)
 */
async function searchResults(keyword) {
    try {
        if (!keyword || keyword.trim().length < 2) {
            return JSON.stringify([]);
        }

        const query = keyword.trim();
        const body = `do=search&subaction=search&story=${encodeURIComponent(query)}`;

        const res = await soraFetch(`${baseUrl}/index.php?do=search`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": defaultHeaders["User-Agent"],
                "Referer": baseUrl + "/"
            },
            body: body
        });

        if (!res) return JSON.stringify([]);

        const html = await res.text();
        const results = [];

        // Current site pattern for search results
        const regex = /<div class="shortstory[^"]*">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi;
        let match;

        while ((match = regex.exec(html)) !== null) {
            let href = match[1];
            let image = match[2];
            let title = match[3].trim();

            if (href.startsWith("/")) href = baseUrl + href;
            if (image && !image.startsWith("http")) image = baseUrl + image;

            // clean title
            title = title.replace(/\s+/g, " ").trim();

            if (title && href) {
                results.push({
                    title: title,
                    image: image || "",
                    href: href
                });
            }
        }

        // Alternative simpler pattern (fallback)
        if (results.length === 0) {
            const altRegex = /<a href="(https?:\/\/kinogomy\.net\/[^"]+\.html)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/gi;
            while ((match = altRegex.exec(html)) !== null) {
                results.push({
                    title: (match[3] || "Untitled").trim(),
                    image: match[2].startsWith("http") ? match[2] : baseUrl + match[2],
                    href: match[1]
                });
            }
        }

        return JSON.stringify(results.slice(0, 40)); // limit results
    } catch (e) {
        return JSON.stringify([]);
    }
}

/**
 * Details
 */
async function extractDetails(url) {
    try {
        const res = await soraFetch(url);
        if (!res) {
            return JSON.stringify([{ description: "Нет описания", aliases: "N/A", airdate: "N/A" }]);
        }
        const html = await res.text();

        let description = "Описание отсутствует.";
        const descMatch = html.match(/<div class="full-text"[^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = descMatch[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .substring(0, 600);
        }

        let year = "N/A";
        const yearMatch = html.match(/Год[:\s]*<\/?(?:b|strong|span)[^>]*>\s*(\d{4})/i) ||
                          html.match(/(\d{4})\s*<\/?span/i);
        if (yearMatch) year = yearMatch[1];

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: year
        }]);
    } catch (e) {
        return JSON.stringify([{ description: "Error", aliases: "Error", airdate: "Error" }]);
    }
}

/**
 * Episodes (movies = 1, series = try to detect)
 */
async function extractEpisodes(url) {
    try {
        // For movies just return one entry
        if (url.includes("/films/") || !url.includes("serial")) {
            return JSON.stringify([{
                href: url,
                number: 1,
                title: "Фильм"
            }]);
        }

        // For series we still return the page itself (player handles seasons)
        return JSON.stringify([{
            href: url,
            number: 1,
            title: "Смотреть"
        }]);
    } catch (e) {
        return JSON.stringify([{ href: url, number: 1, title: "Смотреть" }]);
    }
}

/**
 * Stream extractor
 */
async function extractStreamUrl(url) {
    try {
        const res = await soraFetch(url);
        if (!res) return JSON.stringify({ streams: [], subtitles: "" });

        const html = await res.text();
        const streams = [];

        // data-src players (main method on current site)
        const tabRegex = /data-src=["']([^"']+)["'][^>]*>([^<]*)</gi;
        let m;
        while ((m = tabRegex.exec(html)) !== null) {
            let src = m[1].replace(/&amp;/g, "&");
            let title = (m[2] || "Player").trim();

            if (/трейлер|trailer|youtube/i.test(title) || /youtube\.com/i.test(src)) continue;
            if (src.startsWith("//")) src = "https:" + src;

            streams.push({
                title: "KinoGo – " + title,
                streamUrl: src,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": url
                }
            });
        }

        // Fallback iframe
        if (streams.length === 0) {
            const iframe = html.match(/id=["']iframesrc["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframe) {
                let src = iframe[1].replace(/&amp;/g, "&");
                if (src.startsWith("//")) src = "https:" + src;
                streams.push({
                    title: "KinoGo Default",
                    streamUrl: src,
                    headers: {
                        "User-Agent": defaultHeaders["User-Agent"],
                        "Referer": url
                    }
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (e) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
