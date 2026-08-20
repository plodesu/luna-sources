const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Cookie': 'hdmbbs=1',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
};

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2(
            `https://hdrezka.me/search/?do=search&subaction=search&q=${encodeURIComponent(keyword)}`,
            defaultHeaders
        );
        const html = await response.text();

        const parts = html.split('class="b-content__inline_item"');
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            const imgMatch = part.match(/<img[^>]+src="([^"]+)"/);
            const linkMatch = part.match(/<div class="b-content__inline_item-link">[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);

            if (linkMatch && imgMatch) {
                results.push({
                    title: decodeHtmlEntities(linkMatch[2].trim()),
                    image: imgMatch[1].trim(),
                    href: linkMatch[1].trim()
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

        const descMatch = html.match(/class="b-post__description_text"[^>]*>([\s\S]*?)<\/div>/);
        const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : 'N/A';

        const origMatch = html.match(/<div class="b-post__origtitle"[^>]*>([\s\S]*?)<\/div>/);
        const aliases = origMatch ? decodeHtmlEntities(origMatch[1].trim()) : 'N/A';

        const yearMatch = html.match(/href="[^"]*?\/year\/[^"]*?">([^<]+)<\/a>/);
        const airdate = yearMatch ? yearMatch[1].trim() : 'N/A';

        return JSON.stringify([{ description, aliases, airdate }]);
    } catch (err) {
        return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();

        const typeMatch = html.match(/<meta property="og:type" content="([^"]+)"/);
        const isTV = typeMatch && typeMatch[1] === 'video.tv_series';

        if (!isTV) {
            return JSON.stringify([{ href: url, number: 1, season: 1 }]);
        }

        const postId = getPostId(html, url);
        if (!postId) {
            return JSON.stringify([{ href: url, number: 1, season: 1 }]);
        }

        const translators = parseTranslators(html);
        if (translators.length === 0) {
            return JSON.stringify([{ href: url, number: 1, season: 1 }]);
        }

        const origin = getOrigin(url);
        const postData = `id=${postId}&translator_id=${translators[0].id}&action=get_episodes`;
        const headers = {
            ...defaultHeaders,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': url
        };

        const apiResponse = await fetchv2(`${origin}/ajax/get_cdn_series/`, headers, 'POST', postData);
        const data = await apiResponse.json();

        if (!data.success) {
            return JSON.stringify([{ href: url, number: 1, season: 1 }]);
        }

        const results = [];
        const episodeRegex = /class="[^"]*b-simple_episode__item[^"]*"[^>]*data-season_id="(\d+)"[^>]*data-episode_id="(\d+)"/g;
        let match;
        while ((match = episodeRegex.exec(data.episodes || '')) !== null) {
            results.push({
                href: appendQueryParams(url, {
                    post_id: postId,
                    season: match[1],
                    episode: match[2]
                }),
                number: parseInt(match[2], 10),
                season: parseInt(match[1], 10)
            });
        }

        return JSON.stringify(results.length ? results : [{ href: url, number: 1, season: 1 }]);
    } catch (err) {
        return JSON.stringify([{ href: url, number: 1, season: 1 }]);
    }
}

async function extractStreamUrl(url) {
    try {
        let postId = getQueryParam(url, 'post_id');
        const season = getQueryParam(url, 'season');
        const episode = getQueryParam(url, 'episode');
        const isTV = !!(season && episode);

        const basePageUrl = url.split('?')[0];
        const response = await fetchv2(basePageUrl, defaultHeaders);
        const html = await response.text();

        if (!postId) postId = getPostId(html, basePageUrl);
        if (!postId) return JSON.stringify({ streams: [], subtitles: '' });

        const translators = parseTranslators(html);
        if (translators.length === 0) return JSON.stringify({ streams: [], subtitles: '' });

        const origin = getOrigin(basePageUrl);
        const postHeaders = {
            'User-Agent': defaultHeaders['User-Agent'],
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': basePageUrl,
            'Cookie': 'hdmbbs=1'
        };

        const allStreams = [];
        let finalSubtitle = '';

        // Try translators one by one (more reliable than Promise.all on iOS)
        for (const tr of translators) {
            try {
                const postData = isTV
                    ? `id=${postId}&translator_id=${tr.id}&season=${season}&episode=${episode}&action=get_stream`
                    : `id=${postId}&translator_id=${tr.id}&action=get_movie`;

                const apiResponse = await fetchv2(
                    `${origin}/ajax/get_cdn_series/`,
                    postHeaders,
                    'POST',
                    postData
                );
                const data = await apiResponse.json();

                if (!data || !data.success || !data.url) continue;

                // Subtitles
                if (data.subtitle && !finalSubtitle) {
                    const subParts = String(data.subtitle).split(',');
                    for (const p of subParts) {
                        const m = p.match(/\[([^\]]+)\]\s*(\S+)/);
                        if (m) {
                            finalSubtitle = m[2];
                            break;
                        }
                    }
                }

                // Decode stream URL
                let decoded = data.url;
                if (!decoded.startsWith('[')) {
                    decoded = clearTrash(decoded);
                }

                const parts = decoded.split(',');
                for (const part of parts) {
                    const match = part.match(/\[([^\]]+)\]\s*(.+)/);
                    if (!match) continue;

                    const quality = match[1].replace(/<[^>]+>/g, '').trim();
                    if (!quality || quality.includes('<')) continue;

                    const links = match[2].split(/\s+or\s+/);
                    for (const link of links) {
                        const clean = link.trim();
                        if (clean && (clean.startsWith('http') || clean.startsWith('//'))) {
                            allStreams.push({
                                title: `${tr.name} • ${quality}`,
                                streamUrl: clean.startsWith('//') ? 'https:' + clean : clean,
                                headers: {
                                    'User-Agent': defaultHeaders['User-Agent'],
                                    'Referer': basePageUrl
                                }
                            });
                        }
                    }
                }

                // If we already have streams, no need to try every translator
                if (allStreams.length > 0) break;
            } catch (e) {
                // continue to next translator
            }
        }

        // Sort by quality (highest first)
        allStreams.sort((a, b) => {
            const getRes = (t) => {
                const m = t.match(/(\d{3,4})p/);
                return m ? parseInt(m[1], 10) : 0;
            };
            return getRes(b.title) - getRes(a.title);
        });

        return JSON.stringify({
            streams: allStreams,
            subtitles: finalSubtitle
        });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitles: '' });
    }
}

// ==================== HELPERS ====================

function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function getOrigin(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
    } catch (e) {
        const match = url.match(/^(https?:\/\/[^\/]+)/);
        return match ? match[1] : 'https://hdrezka.me';
    }
}

function getQueryParam(url, name) {
    try {
        return new URL(url).searchParams.get(name);
    } catch (e) {
        const match = new RegExp('[?&]' + name + '=([^&#]*)').exec(url);
        return match ? decodeURIComponent(match[1]) : null;
    }
}

function appendQueryParams(url, params) {
    const separator = url.includes('?') ? '&' : '?';
    const qs = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return `${url}${separator}${qs}`;
}

function getPostId(html, url) {
    const m1 = html.match(/id="post_id"\s+value="(\d+)"/) || html.match(/value="(\d+)"\s+id="post_id"/);
    if (m1) return m1[1];
    const m2 = html.match(/id="send-video-issue"\s+data-id="(\d+)"/) || html.match(/data-id="(\d+)"\s+id="send-video-issue"/);
    if (m2) return m2[1];
    const m3 = html.match(/data-post_id="(\d+)"/);
    if (m3) return m3[1];
    const last = (url.split('/').pop() || '').match(/^(\d+)/);
    return last ? last[1] : null;
}

function parseTranslators(html) {
    const translators = [];
    const listMatch = html.match(/<ul[^>]+id="translators-list"[^>]*>([\s\S]*?)<\/ul>/);
    if (listMatch) {
        const liRegex = /<li[^>]+data-translator_id="(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
        let match;
        while ((match = liRegex.exec(listMatch[1])) !== null) {
            let name = match[2].replace(/<[^>]*>/g, '').trim() || 'Озвучка';
            const imgMatch = match[2].match(/<img[^>]+title="([^"]+)"/);
            if (imgMatch && !name.includes(imgMatch[1])) {
                name += ` (${imgMatch[1]})`;
            }
            translators.push({ id: parseInt(match[1], 10), name });
        }
    }
    if (translators.length === 0) {
        const scriptMatch = html.match(/sof\.tv\.initCDN(?:Series|Movies)Events\(\s*\d+,\s*(\d+)/);
        if (scriptMatch) {
            let name = 'Default';
            const tableMatch = html.match(/<li>\s*<b>В переводе:<\/b>\s*([^<]+)<\/li>/) ||
                               html.match(/<tr>\s*<td>В переводе:<\/td>\s*<td>([^<]+)<\/td>/);
            if (tableMatch) name = tableMatch[1].trim();
            translators.push({ id: parseInt(scriptMatch[1], 10), name });
        }
    }
    return translators;
}

function clearTrash(data) {
    const trashList = ['@', '#', '!', '^', '$'];
    const trashCodesSet = [];
    for (let i = 2; i < 4; i++) {
        const combos = getCombinations(trashList, i);
        for (const combo of combos) {
            trashCodesSet.push(btoa(combo.join('')));
        }
    }
    let trashString = String(data).replace('#h', '').split('//_//').join('');
    for (const temp of trashCodesSet) {
        trashString = trashString.split(temp).join('');
    }
    try {
        return decodeUTF8(atob(trashString));
    } catch (e) {
        return trashString;
    }
}

function getCombinations(arr, length) {
    if (length === 1) return arr.map(x => [x]);
    const results = [];
    const sub = getCombinations(arr, length - 1);
    for (const val of arr) {
        for (const s of sub) results.push([val, ...s]);
    }
    return results;
}

function btoa(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = String(input);
    let output = '';
    for (let i = 0; i < str.length; i += 3) {
        const c1 = str.charCodeAt(i);
        const c2 = i + 1 < str.length ? str.charCodeAt(i + 1) : NaN;
        const c3 = i + 2 < str.length ? str.charCodeAt(i + 2) : NaN;
        const e1 = c1 >> 2;
        const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
        const e3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6);
        const e4 = isNaN(c3) ? 64 : c3 & 63;
        output += chars.charAt(e1) + chars.charAt(e2) + chars.charAt(e3) + chars.charAt(e4);
    }
    return output;
}

function atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = String(input).replace(/=+$/, '');
    let output = '';
    for (let i = 0; i < str.length; i += 4) {
        const e1 = chars.indexOf(str.charAt(i));
        const e2 = chars.indexOf(str.charAt(i + 1));
        const e3 = chars.indexOf(str.charAt(i + 2));
        const e4 = chars.indexOf(str.charAt(i + 3));
        const c1 = (e1 << 2) | (e2 >> 4);
        const c2 = ((e2 & 15) << 4) | (e3 >> 2);
        const c3 = ((e3 & 3) << 6) | e4;
        output += String.fromCharCode(c1);
        if (e3 !== 64 && e3 !== -1) output += String.fromCharCode(c2);
        if (e4 !== 64 && e4 !== -1) output += String.fromCharCode(c3);
    }
    return output;
}

function decodeUTF8(str) {
    try {
        return decodeURIComponent(escape(str));
    } catch (e) {
        return str;
    }
}
