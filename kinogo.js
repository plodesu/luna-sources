const baseUrl = "https://kinogomy.net";

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://kinogomy.net/",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
};

async function soraFetch(url, options = {}) {
    const headers = Object.assign({}, defaultHeaders, options.headers || {});
    const method = options.method || "GET";
    const body = options.body || null;
    try {
        if (typeof fetchv2 === "function") return await fetchv2(url, headers, method, body);
    } catch (e) {}
    try {
        return await fetch(url, { method, headers, body });
    } catch (e) {
        return null;
    }
}

async function getText(response) {
    if (!response) return "";
    try {
        if (typeof response.text === "function") return await response.text();
        if (response.body) return String(response.body);
        return String(response);
    } catch (e) {
        return "";
    }
}

async function searchResults(keyword) {
    try {
        const q = (keyword || "").trim();
        if (q.length < 2) return "[]";

        const body = "do=search&subaction=search&story=" + encodeURIComponent(q);
        const res = await soraFetch(baseUrl + "/index.php?do=search", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": defaultHeaders["User-Agent"],
                "Referer": baseUrl + "/"
            },
            body: body
        });

        const html = await getText(res);
        if (!html || html.length < 400) return "[]";

        const results = [];
        const seen = {};

        const re = /<h2 class="zagolovki">\s*<a href="([^"]+)">\s*<span[^>]*>([^<]+)<\/span>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const href = m[1];
            const title = m[2].replace(/\s+/g, " ").trim();
            if (href && title && !seen[href]) {
                seen[href] = true;
                results.push({ title, href, image: "" });
            }
        }

        // attach posters if possible
        const imgRe = /data-src="(\/uploads\/posts\/[^"]+)"[^>]*alt="([^"]*)"/gi;
        const imgs = [];
        while ((m = imgRe.exec(html)) !== null) {
            imgs.push({ src: baseUrl + m[1], alt: m[2] });
        }
        for (let i = 0; i < results.length; i++) {
            if (imgs[i]) results[i].image = imgs[i].src;
        }

        return JSON.stringify(results.slice(0, 30));
    } catch (e) {
        return "[]";
    }
}

async function search(keyword) {
    return await searchResults(keyword);
}

async function extractDetails(url) {
    try {
        const res = await soraFetch(url);
        const html = await getText(res);
        let description = "Описание отсутствует";
        const d = html.match(/<div class="full-text"[^>]*>([\s\S]*?)<\/div>/i);
        if (d) description = d[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500);
        let year = "N/A";
        const y = html.match(/(?:Год|year)[^0-9]{0,20}(\d{4})/i);
        if (y) year = y[1];
        return JSON.stringify([{ description, aliases: "N/A", airdate: year }]);
    } catch (e) {
        return JSON.stringify([{ description: "Error", aliases: "N/A", airdate: "N/A" }]);
    }
}

async function extractEpisodes(url) {
    return JSON.stringify([{ href: url, number: 1, title: "Смотреть" }]);
}

async function extractStreamUrl(url) {
    try {
        const res = await soraFetch(url);
        const html = await getText(res);
        if (!html) return JSON.stringify({ streams: [], subtitles: "" });

        const streams = [];
        const seen = {};

        const re = /<li[^>]*data-src=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            let src = m[1].replace(/&amp;/g, "&").trim();
            let title = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

            if (/трейлер|trailer|youtube|youtu\.be/i.test(title + " " + src)) continue;
            if (src.startsWith("//")) src = "https:" + src;
            if (!src.startsWith("http")) continue;
            if (seen[src]) continue;
            seen[src] = true;

            if (!title || title.length < 2) title = "Player";
            if (/4[kк]|качество/i.test(title)) title = "4K / High Quality";
            if (/смотреть|онлайн/i.test(title)) title = "Смотреть онлайн";

            streams.push({
                title: "KinoGo – " + title,
                streamUrl: src,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": url
                }
            });
        }

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

        return JSON.stringify({ streams, subtitles: "" });
    } catch (e) {
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
