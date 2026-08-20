const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://kinogomy.net/'
};

const baseUrl = 'https://kinogomy.net';
const tmdbApiKey = 'ad301b7cc82ffe19273e55e4d4206885';

async function searchResults(keyword) {
    try {
        const clean = keyword.replace(/Episode\s*\d+/gi, '').replace(/Season\s*\d+/gi, '').trim();
        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(clean)}&language=ru-RU&include_adult=false`;
        
        const response = await fetchv2(tmdbUrl, defaultHeaders);
        const data = await response.json();

        const results = (data.results || []).map(item => {
            const title = item.title || item.name || item.original_title || item.original_name || 'Untitled';
            const isMovie = item.media_type === 'movie' || !!item.title;

            return {
                title: title,
                image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
                href: isMovie 
                    ? `movie/${item.id}/${encodeURIComponent(title)}` 
                    : `tv/${item.id}/${encodeURIComponent(title)}`
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

        const tmdbUrl = `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${id}?api_key=${tmdbApiKey}&language=ru-RU`;
        const response = await fetchv2(tmdbUrl, defaultHeaders);
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

async function resolveKinoGoPage(ruTitle) {
    try {
        const body = `do=search&subaction=search&story=${encodeURIComponent(ruTitle)}`;
        const response = await fetchv2(`${baseUrl}/index.php?do=search`, {
            ...defaultHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
        }, 'POST', body);

        const html = await response.text();
        const match = html.match(/<h2 class="zagolovki">\s*<a href="([^"]+)">/i) ||
                      html.match(/href="(https?:\/\/kinogomy\.net\/[^"]+\.html)"/i);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

async function extractEpisodes(url) {
    try {
        const parts = url.split('/');
        const type = parts[0];
        const id = parts[1];
        const ruTitle = decodeURIComponent(parts[2] || '');

        const realPage = await resolveKinoGoPage(ruTitle);
        const target = realPage || `${baseUrl}/index.php?do=search&story=${encodeURIComponent(ruTitle)}`;

        if (type === 'movie') {
            return JSON.stringify([{
                href: target,
                number: 1,
                title: 'Фильм'
            }]);
        }

        const response = await fetchv2(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbApiKey}&language=ru-RU`, defaultHeaders);
        const data = await response.json();

        const episodes = [];
        if (data.seasons) {
            for (const season of data.seasons) {
                if (season.season_number === 0) continue;
                for (let ep = 1; ep <= (season.episode_count || 0); ep++) {
                    episodes.push({
                        href: `${target}#s${season.season_number}e${ep}`,
                        number: ep,
                        season: season.season_number,
                        title: `S${season.season_number}E${ep}`
                    });
                }
            }
        }

        if (episodes.length === 0) {
            episodes.push({ href: target, number: 1, title: 'Смотреть' });
        }

        return JSON.stringify(episodes);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, title: 'Смотреть' }]);
    }
}

async function extractStreamUrl(url) {
    try {
        let cleanUrl = url.split('#')[0];
        const hashMatch = url.match(/#(s\d+e\d+)/i);
        const seasonEpisode = hashMatch ? hashMatch[1] : '';

        if (cleanUrl.includes('do=search')) {
            const q = cleanUrl.match(/story=([^&]+)/);
            if (q) {
                const resolved = await resolveKinoGoPage(decodeURIComponent(q[1]));
                if (resolved) cleanUrl = resolved;
            }
        }

        const response = await fetchv2(cleanUrl, defaultHeaders);
        const html = await response.text();
        const streams = [];

        const tabRegex = /data-src=["']([^"']+)["'][^>]*>([^<]*)</gi;
        let match;
        while ((match = tabRegex.exec(html)) !== null) {
            let src = match[1].replace(/&amp;/g, '&');
            let title = (match[2] || 'Player').trim();

            if (/трейлер|trailer|youtube/i.test(title) || /youtube\.com/i.test(src)) continue;
            if (src.startsWith('//')) src = 'https:' + src;

            if (seasonEpisode && !src.includes('#')) {
                src += '#' + seasonEpisode;
            }

            streams.push({
                title: 'KinoGo – ' + title,
                streamUrl: src,
                headers: defaultHeaders
            });
        }

        if (streams.length === 0) {
            const iframe = html.match(/id=["']iframesrc["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframe) {
                let src = iframe[1].replace(/&amp;/g, '&');
                if (src.startsWith('//')) src = 'https:' + src;
                streams.push({
                    title: 'KinoGo Default',
                    streamUrl: src,
                    headers: defaultHeaders
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: '' });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: '' });
    }
}
