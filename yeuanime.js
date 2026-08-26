/**
 * YeuAnime Module - Using exact site patterns
 * Episode URL: /xem-phim/{slug}/tap-{num}/{language}?server={SERVER}
 * Search: /tim-kiem?q={keyword}
 * Series: /phim/{slug}
 */

const baseUrl = "https://yeuanime.buzz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ============ FETCH HELPERS ============

async function getHTML(url) {
  try {
    const headers = {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": baseUrl + "/"
    };
    
    if (typeof fetchv2 === "function") {
      try {
        const res = await fetchv2(url, headers, "GET");
        if (res) {
          if (typeof res === "string") return res;
          if (typeof res.text === "function") return await res.text();
          return String(res);
        }
      } catch (_) {}
    }
    
    const res = await fetch(url, { headers });
    if (res && typeof res.text === "function") {
      return await res.text();
    }
    return String(res);
  } catch (e) {
    return "";
  }
}

function cleanString(str) {
  if (!str) return "";
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(path) {
  if (!path) return "";
  path = String(path).trim();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("//")) return "https:" + path;
  if (path.startsWith("/")) return baseUrl + path;
  return baseUrl + "/" + path;
}

function extractSlugFromUrl(url) {
  const match = String(url).match(/\/phim\/([^/?#]+)/);
  return match ? match[1] : null;
}

// ============ SEARCH ============

async function searchResults(keyword) {
  try {
    const q = String(keyword || "").trim();
    if (!q) return "[]";
    
    const url = baseUrl + "/tim-kiem?q=" + encodeURIComponent(q);
    const html = await getHTML(url);
    
    if (!html || html.length < 100) return "[]";
    
    const results = [];
    const seen = {};
    
    // Pattern: Find anime cards with <a href="/phim/SLUG">
    // and <img src="..." alt="TITLE">
    const cardRegex = /<a[^>]+href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"[^>]*>/gi;
    
    let match;
    while ((match = cardRegex.exec(html))) {
      const slug = match[1];
      const image = absUrl(match[2]);
      let title = cleanString(match[3]);
      
      // If no alt, try to get title from nearby h3
      if (!title) {
        const slice = html.slice(Math.max(0, match.index - 300), match.index + 500);
        const hMatch = slice.match(/<h3[^>]*>([^<]+)<\/h3>/);
        if (hMatch) title = cleanString(hMatch[1]);
      }
      
      // Fallback: use slug
      if (!title) {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      
      const href = baseUrl + "/phim/" + slug;
      if (!seen[href]) {
        seen[href] = true;
        results.push({ title, image, href });
      }
    }
    
    // Alternative pattern
    if (results.length === 0) {
      const altRegex = /<a[^>]+href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/gi;
      while ((match = altRegex.exec(html))) {
        const slug = match[1];
        const title = cleanString(match[2]);
        const href = baseUrl + "/phim/" + slug;
        
        const slice = html.slice(Math.max(0, match.index - 500), match.index + 100);
        const imgMatch = slice.match(/<img[^>]+src="([^"]+)"[^>]*>/);
        const image = imgMatch ? absUrl(imgMatch[1]) : "";
        
        if (!seen[href]) {
          seen[href] = true;
          results.push({ title, image, href });
        }
      }
    }
    
    return JSON.stringify(results.slice(0, 30));
    
  } catch (e) {
    return "[]";
  }
}

// ============ DETAILS ============

async function extractDetails(url) {
  try {
    const html = await getHTML(url);
    if (!html) return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
    
    let description = "N/A";
    let aliases = "N/A";
    let airdate = "N/A";
    
    // Try JSON-LD first
    const ldRegex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = ldRegex.exec(html))) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data)) {
          for (let item of data) {
            if (item['@type'] === 'TVSeries' || item['@type'] === 'Movie') {
              if (item.description) description = cleanString(item.description.substring(0, 500));
              if (item.name) aliases = cleanString(item.name);
              if (item.datePublished) airdate = item.datePublished.substring(0, 4);
              break;
            }
          }
        } else if (data['@type'] === 'TVSeries' || data['@type'] === 'Movie') {
          if (data.description) description = cleanString(data.description.substring(0, 500));
          if (data.name) aliases = cleanString(data.name);
          if (data.datePublished) airdate = data.datePublished.substring(0, 4);
        }
      } catch (_) {}
    }
    
    // Fallback: HTML meta tags
    if (description === "N/A") {
      const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                       html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
      if (descMatch) description = cleanString(descMatch[1].substring(0, 500));
    }
    
    if (aliases === "N/A") {
      const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
                        html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) aliases = cleanString(titleMatch[1]);
    }
    
    if (airdate === "N/A") {
      const yearMatch = html.match(/(\d{4})/);
      if (yearMatch) airdate = yearMatch[1];
    }
    
    return JSON.stringify([{ description, aliases, airdate }]);
    
  } catch (_) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

// ============ EPISODES ============

async function extractEpisodes(url) {
  try {
    const slug = extractSlugFromUrl(url);
    if (!slug) return "[]";
    
    const html = await getHTML(baseUrl + "/phim/" + slug);
    if (!html) return "[]";
    
    const episodes = [];
    const seen = {};
    
    // Exact pattern from the site:
    // <a href="/xem-phim/{slug}/tap-{num}/{language}?server={SERVER}">
    //   <p>Tập {num}</p>
    // </a>
    const epRegex = /<a[^>]+href="(\/xem-phim\/[^"]+?)"[^>]*>[\s\S]*?<p[^>]*>([^<]+)<\/p>[\s\S]*?<\/a>/gi;
    
    let match;
    while ((match = epRegex.exec(html))) {
      const href = absUrl(match[1]);
      const title = cleanString(match[2]);
      
      // Extract episode number from href
      const epMatch = href.match(/\/tap-(\d+)\//);
      if (!epMatch) continue;
      
      const epNum = parseInt(epMatch[1], 10);
      
      if (!seen[epNum]) {
        seen[epNum] = true;
        episodes.push({
          href: href,
          number: epNum,
          season: 1,
          episode: epNum,
          title: title || "Tập " + epNum
        });
      }
    }
    
    // If no episodes found, try simpler pattern
    if (episodes.length === 0) {
      const altRegex = /href="(\/xem-phim\/[^"]+?)"/gi;
      while ((match = altRegex.exec(html))) {
        const href = absUrl(match[1]);
        const epMatch = href.match(/\/tap-(\d+)\//);
        if (epMatch) {
          const epNum = parseInt(epMatch[1], 10);
          if (!seen[epNum]) {
            seen[epNum] = true;
            episodes.push({
              href: href,
              number: epNum,
              season: 1,
              episode: epNum,
              title: "Tập " + epNum
            });
          }
        }
      }
    }
    
    // Sort by episode number
    episodes.sort((a, b) => a.episode - b.episode);
    
    return JSON.stringify(episodes.slice(0, 300));
    
  } catch (_) {
    return "[]";
  }
}

// ============ STREAMS ============

async function extractStreamUrl(url) {
  try {
    const html = await getHTML(url);
    if (!html) return JSON.stringify({ streams: [], subtitles: "" });
    
    let hlsUrl = null;
    
    // Pattern 1: Hidden input with name="url"
    const inputMatch = html.match(/<input[^>]+name="url"[^>]+value="([^"]+)"[^>]*>/i);
    if (inputMatch) {
      hlsUrl = inputMatch[1];
    }
    
    // Pattern 2: JavaScript variable
    if (!hlsUrl) {
      const jsMatch = html.match(/url\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (jsMatch) {
        hlsUrl = jsMatch[1];
      }
    }
    
    // Pattern 3: Direct .m3u8 URL
    if (!hlsUrl) {
      const m3u8Match = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
      if (m3u8Match) {
        hlsUrl = m3u8Match[1];
      }
    }
    
    // Pattern 4: From iframe src
    if (!hlsUrl) {
      const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/i);
      if (iframeMatch) {
        const iframeUrl = iframeMatch[1];
        if (iframeUrl.includes('player') || iframeUrl.includes('embed')) {
          const iframeHTML = await getHTML(iframeUrl);
          if (iframeHTML) {
            const m3u8Match2 = iframeHTML.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
            if (m3u8Match2) {
              hlsUrl = m3u8Match2[1];
            }
          }
        }
      }
    }
    
    if (!hlsUrl) {
      return JSON.stringify({ streams: [], subtitles: "" });
    }
    
    hlsUrl = String(hlsUrl).replace(/\\/g, '').trim();
    
    const headers = {
      "User-Agent": UA,
      "Referer": url,
      "Origin": baseUrl,
      "Accept": "*/*"
    };
    
    // Try to extract subtitles
    let subtitles = "";
    const subMatch = html.match(/<track[^>]+src="([^"]+\.vtt[^"]*)"[^>]*>/i);
    if (subMatch) {
      subtitles = absUrl(subMatch[1]);
    }
    
    return JSON.stringify({
      streams: [
        {
          title: "HLS Stream",
          streamUrl: hlsUrl,
          headers: headers
        }
      ],
      subtitles: subtitles
    });
    
  } catch (_) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
