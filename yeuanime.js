/**
 * YeuAnime Module - Scraped from actual site structure
 * Works with Sora, Luna, Anymex, Mojuru
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
    
    // Try fetchv2 first (Sora's internal fetch)
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
    
    // Fallback to standard fetch
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
    
    // Pattern 1: Find all anime cards - matches the actual site structure
    // Look for: <a href="/phim/SLUG"> ... <img src="IMAGE" alt="TITLE"> ... </a>
    // Then the title appears in a <h3> inside a sibling div
    const cardRegex = /<a[^>]+href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"[^>]*>/gi;
    
    let match;
    while ((match = cardRegex.exec(html))) {
      const slug = match[1];
      const image = absUrl(match[2]);
      let title = cleanString(match[3]);
      
      // If title is empty from alt, try to find it in a nearby <h3>
      if (!title) {
        const slice = html.slice(Math.max(0, match.index - 300), match.index + 500);
        const hMatch = slice.match(/<h3[^>]*>([^<]+)<\/h3>/);
        if (hMatch) {
          title = cleanString(hMatch[1]);
        }
      }
      
      // If still no title, use slug
      if (!title) {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      
      const href = baseUrl + "/phim/" + slug;
      if (!seen[href]) {
        seen[href] = true;
        results.push({ title, image, href });
      }
    }
    
    // Pattern 2: If no results, try to find cards with title in a separate link
    if (results.length === 0) {
      const altRegex = /<a[^>]+href="\/phim\/([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/gi;
      while ((match = altRegex.exec(html))) {
        const slug = match[1];
        const title = cleanString(match[2]);
        const href = baseUrl + "/phim/" + slug;
        
        // Try to find image for this card
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
    
    // Get description from meta tags
    let description = "N/A";
    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                     html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
    if (descMatch) {
      description = cleanString(descMatch[1].substring(0, 500));
    }
    
    // Get title/aliases
    let aliases = "N/A";
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
                      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      aliases = cleanString(titleMatch[1]);
    }
    
    // Get year
    let airdate = "N/A";
    const yearMatch = html.match(/(\d{4})/);
    if (yearMatch) {
      airdate = yearMatch[1];
    }
    
    return JSON.stringify([{ description, aliases, airdate }]);
    
  } catch (_) {
    return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
  }
}

// ============ EPISODES ============

async function extractEpisodes(url) {
  try {
    // Extract slug from URL
    const slugMatch = url.match(/\/phim\/([^/?#]+)/);
    if (!slugMatch) return "[]";
    
    const slug = slugMatch[1];
    const html = await getHTML(baseUrl + "/phim/" + slug);
    
    if (!html) return "[]";
    
    const episodes = [];
    const seen = {};
    
    // Find all episode links: /xem-phim/SLUG/tap-NUM/LANG?server=XXX
    const epRegex = /<a[^>]+href="(\/xem-phim\/[^"]+?\/tap-(\d+)\/[^"]+?)"[^>]*>/gi;
    
    let match;
    while ((match = epRegex.exec(html))) {
      const href = absUrl(match[1]);
      const epNum = parseInt(match[2], 10);
      
      // Get episode title
      const slice = html.slice(Math.max(0, match.index - 100), match.index + 300);
      let titleMatch = slice.match(/<span[^>]*>([^<]+)<\/span>/);
      let title = titleMatch ? cleanString(titleMatch[1]) : ("Tập " + epNum);
      
      if (!seen[epNum]) {
        seen[epNum] = true;
        episodes.push({
          href: href,
          number: epNum,
          season: 1,
          episode: epNum,
          title: title
        });
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
    
    // Extract HLS URL from the hidden form input
    const m = html.match(/<input[^>]+name="url"[^>]+value="([^"]+)"[^>]*>/i);
    if (!m) {
      // Try to find it in JavaScript
      const jsMatch = html.match(/url\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (!jsMatch) return JSON.stringify({ streams: [], subtitles: "" });
      var hlsUrl = jsMatch[1];
    } else {
      var hlsUrl = m[1];
    }
    
    // Clean up the URL if needed
    hlsUrl = String(hlsUrl).replace(/\\/g, '');
    
    // Build headers
    const headers = {
      "User-Agent": UA,
      "Referer": url,
      "Origin": baseUrl,
      "Accept": "*/*"
    };
    
    return JSON.stringify({
      streams: [
        {
          title: "HLS Stream",
          streamUrl: hlsUrl,
          headers: headers
        }
      ],
      subtitles: ""
    });
    
  } catch (_) {
    return JSON.stringify({ streams: [], subtitles: "" });
  }
}
