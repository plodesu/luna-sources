This file contains ambiguous Unicode characters
This file contains Unicode characters that might be confused with other characters. If you think that this is intentional, you can safely ignore this warning. Use the Escape button to reveal them.
const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36',
    'Cookie': 'hdmbbs=1'
};

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2(`https://hdrezka.me/search/?do=search&subaction=search&q=${encodeURIComponent(keyword)}`, defaultHeaders);
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

        const descMatch = html.match(/class="b-post__description_text"[^>]*>([\s\S]*?)<\/div>/);
        const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : "N/A";

        const origMatch = html.match(/<div class="b-post__origtitle"[^>]*>([\s\S]*?)<\/div>/);
        const aliases = origMatch ? decodeHtmlEntities(origMatch[1].trim()) : "N/A";

        const yearMatch = html.match(/href="[^"]*?\/year\/[^"]*?">([^<]+)<\/a>/);
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

        const typeMatch = html.match(/<meta property="og:type" content="([^"]+)"/);
        const isTV = typeMatch && typeMatch[1] === 'video.tv_series';

        if (!isTV) {
            return JSON.stringify([{
                href: url,
                number: 1,
                season: 1
            }]);
        }

        const postId = getPostId(html, url);
        if (!postId) {
            throw new Error("Post ID not found");
        }

        const translators = parseTranslators(html);
        if (translators.length === 0) {
            throw new Error("No translators found");
        }

        const trId = translators[0].id;
        const origin = getOrigin(url);
        const postData = `id=${postId}&translator_id=${trId}&action=get_episodes`;
        const headers = {
            ...defaultHeaders,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        };

        const apiResponse = await fetchv2(`${origin}/ajax/get_cdn_series/`, headers, "POST", postData);
        const data = await apiResponse.json();

        if (!data.success) {
            throw new Error("Failed to fetch episodes from API");
        }

        const episodesHtml = data.episodes || "";
        const results = [];
        const episodeRegex = /class="[^"]*b-simple_episode__item[^"]*"[^>]*data-season_id="(\d+)"[^>]*data-episode_id="(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
        let match;
        while ((match = episodeRegex.exec(episodesHtml)) !== null) {
            const seasonId = match[1];
            const episodeId = match[2];

            results.push({
                href: appendQueryParams(url, { post_id: postId, season: seasonId, episode: episodeId }),
                number: parseInt(episodeId, 10),
                season: parseInt(seasonId, 10)
            });
        }

        return JSON.stringify(results);
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
        let postId = getQueryParam(url, "post_id");
        const season = getQueryParam(url, "season");
        const episode = getQueryParam(url, "episode");
        const isTV = season && episode;

        const basePageUrl = url.split('?')[0];
        const response = await fetchv2(basePageUrl, defaultHeaders);
        const html = await response.text();

        if (!postId) {
            postId = getPostId(html, basePageUrl);
        }
        if (!postId) {
            throw new Error("Post ID not found");
        }

        const translators = parseTranslators(html);
        if (translators.length === 0) {
            throw new Error("No translators found");
        }

        const origin = getOrigin(basePageUrl);
        const postHeaders = {
            "User-Agent": defaultHeaders["User-Agent"],
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": basePageUrl
        };

        const streamPromises = translators.map(async (tr) => {
            try {
                const postData = isTV
                    ? `id=${postId}&translator_id=${tr.id}&season=${season}&episode=${episode}&action=get_stream`
                    : `id=${postId}&translator_id=${tr.id}&action=get_movie`;

                const apiResponse = await fetchv2(`${origin}/ajax/get_cdn_series/`, postHeaders, "POST", postData);
                const data = await apiResponse.json();

                let translatorSubtitle = "";
                if (data.success && data.subtitle) {
                    const subParts = data.subtitle.split(',');
                    const subs = [];
                    for (const p of subParts) {
                        const match = p.match(/\[([^\]]+)\]\s*([^,\s]+)/);
                        if (match) {
                            subs.push({ lang: match[1], url: match[2] });
                        }
                    }
                    const enSub = subs.find(s => s.lang.toLowerCase().includes('eng'));
                    if (enSub) {
                        translatorSubtitle = enSub.url;
                    } else if (subs.length > 0) {
                        translatorSubtitle = subs[0].url;
                    }
                }

                if (data.success && data.url) {
                    const rawUrl = data.url;
                    const decoded = rawUrl.startsWith('[') ? rawUrl : clearTrash(rawUrl);
                    const parts = decoded.split(',');
                    const translatorStreams = [];
                    for (const part of parts) {
                        const match = part.match(/\[([^\]]+)\]\s*([^,\s]+(?:\s+or\s+[^,\s]+)*)/);
                        if (match) {
                            const quality = match[1];
                            if (quality.includes('<')) continue;
                            const links = match[2].split(/\s+or\s+/);
                            for (const link of links) {
                                if (link) {
                                    translatorStreams.push({
                                        title: `${tr.name} (${quality})`,
                                        streamUrl: link,
                                        headers: {
                                            "User-Agent": defaultHeaders["User-Agent"],
                                            "Referer": basePageUrl
                                        }
                                    });
                                }
                            }
                        }
                    }
                    return { streams: translatorStreams, subtitle: translatorSubtitle };
                }
            } catch (e) {
                // ignore
            }
            return { streams: [], subtitle: "" };
        });

        const results = await Promise.all(streamPromises);
        const allStreams = [];
        let finalSubtitle = "";

        for (const res of results) {
            if (res.streams) {
                allStreams.push(...res.streams);
            }
            if (!finalSubtitle && res.subtitle) {
                finalSubtitle = res.subtitle;
            }
        }

        allStreams.sort((a, b) => {
            const getRes = (title) => {
                const match = title.match(/(\d+)p/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getRes(b.title) - getRes(a.title);
        });

        if (allStreams.length === 0) {
            allStreams.push({
                title: "HDRezka Stream",
                streamUrl: basePageUrl,
                headers: {
                    "User-Agent": defaultHeaders["User-Agent"],
                    "Referer": basePageUrl
                }
            });
        }

        return JSON.stringify({
            streams: allStreams,
            subtitle: finalSubtitle
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

function getOrigin(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
    } catch (e) {
        const match = url.match(/^(https?:\/\/[^\/]+)/);
        return match ? match[1] : "https://hdrezka.me";
    }
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

function getCombinations(arr, length) {
    if (length === 1) return arr.map(x => [x]);
    const results = [];
    const subCombos = getCombinations(arr, length - 1);
    for (const val of arr) {
        for (const sub of subCombos) {
            results.push([val, ...sub]);
        }
    }
    return results;
}

function btoa(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    for (let i = 0; i < input.length; i += 3) {
        const char1 = input.charCodeAt(i);
        const char2 = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
        const char3 = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;

        const byte1 = char1 >> 2;
        const byte2 = ((char1 & 3) << 4) | (isNaN(char2) ? 0 : char2 >> 4);
        const byte3 = isNaN(char2) ? 64 : ((char2 & 15) << 2) | (isNaN(char3) ? 0 : char3 >> 6);
        const byte4 = isNaN(char3) ? 64 : char3 & 63;

        str += chars.charAt(byte1) + chars.charAt(byte2) + chars.charAt(byte3) + chars.charAt(byte4);
    }
    return str;
}

function atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charAt(i);
        if (char === '=') break;
        const index = chars.indexOf(char);
        if (index === -1) continue;
        buffer = (buffer << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            str += String.fromCharCode((buffer >> bits) & 0xFF);
            buffer &= (1 << bits) - 1;
        }
    }
    return str;
}

function decodeUTF8(str) {
    try {
        return decodeURIComponent(escape(str));
    } catch (e) {
        return str;
    }
}

function clearTrash(data) {
    const trashList = ["@", "#", "!", "^", "$"];
    const trashCodesSet = [];

    for (let i = 2; i <= 3; i++) {
        const combos = getCombinations(trashList, i);
        for (const combo of combos) {
            const comboStr = combo.join('');
            const base64 = btoa(comboStr);
            trashCodesSet.push(base64);
        }
    }

    let trashString = data.replace("#h", "").split("//_//").join("");

    for (const temp of trashCodesSet) {
        trashString = trashString.split(temp).join("");
    }

    try {
        const finalString = atob(trashString);
        return decodeUTF8(finalString);
    } catch (e) {
        return trashString;
    }
}

function getPostId(html, url) {
    const match1 = html.match(/id="post_id"\s+value="(\d+)"/) || html.match(/value="(\d+)"\s+id="post_id"/);
    if (match1) return match1[1];

    const match2 = html.match(/id="send-video-issue"\s+data-id="(\d+)"/) || html.match(/data-id="(\d+)"\s+id="send-video-issue"/);
    if (match2) return match2[1];

    const match3 = html.match(/id="user-favorites-holder"\s+data-post_id="(\d+)"/) || html.match(/data-post_id="(\d+)"\s+id="user-favorites-holder"/);
    if (match3) return match3[1];

    const urlParts = url.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    const match4 = lastPart.match(/^(\d+)/);
    if (match4) return match4[1];

    return null;
}

function parseTranslators(html) {
    const translators = [];

    const listMatch = html.match(/<ul[^>]+id="translators-list"[^>]*>([\s\S]*?)<\/ul>/);
    if (listMatch) {
        const liRegex = /<li[^>]+data-translator_id="(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
        let match;
        while ((match = liRegex.exec(listMatch[1])) !== null) {
            const id = match[1];
            let name = match[2].replace(/<[^>]*>/g, '').trim();
            const imgMatch = match[2].match(/<img[^>]+title="([^"]+)"/);
            if (imgMatch) {
                const lang = imgMatch[1];
                if (!name.includes(lang)) {
                    name += ` (${lang})`;
                }
            }
            translators.push({ id: parseInt(id, 10), name });
        }
    }

    if (translators.length === 0) {
        const scriptMatch = html.match(/sof\.tv\.initCDN(?:Series|Movies)Events\(\s*\d+,\s*(\d+)/);
        if (scriptMatch) {
            const id = scriptMatch[1];
            let name = "Default";
            const tableMatch = html.match(/<li>\s*<b>В переводе:<\/b>\s*([^<]+)<\/li>/) ||
                html.match(/<tr>\s*<td>В переводе:<\/td>\s*<td>([^<]+)<\/td>/);
            if (tableMatch) {
                name = tableMatch[1].trim();
            }
            translators.push({ id: parseInt(id, 10), name });
        }
    }

    return translators;
}
