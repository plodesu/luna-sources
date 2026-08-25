const BASE = "https://anizm.net";
const PLAYER = "https://anizmplayer.com";

async function searchResults(query) {
  try {
    const url = `${BASE}/?s=${encodeURIComponent(query)}`;
    const res = await fetchv2(url);
    const html = await res.text();

    const results = [];
    const regex = /<a[^>]+href="(https?:\/\/anizm\.net\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      const image = match[2];
      const title = match[3].trim();

      if (href.includes("/anime/") || href.match(/anizm\.net\/[a-z0-9-]+\/?$/i)) {
        results.push({
          title: title,
          image: image.startsWith("http") ? image : BASE + image,
          href: href
        });
      }
    }

    // Fallback simpler pattern
    if (results.length === 0) {
      const simpleRegex = /href="(https?:\/\/(?:www\.)?anizm\.net\/([^"]+?))"[^>]*>[\s\S]*?alt="([^"]+)"/gi;
      while ((match = simpleRegex.exec(html)) !== null) {
        const href = match[1];
        const title = match[3].trim();
        if (title && !href.includes("?") && !href.includes("#")) {
          results.push({
            title: title,
            image: "",
            href: href
          });
        }
      }
    }

    // Deduplicate by href
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.href)) return false;
      seen.add(r.href);
      return true;
    });
  } catch (e) {
    console.log("Anizm search error:", e);
    return [];
  }
}

async function extractDetails(url) {
  try {
    const res = await fetchv2(url);
    const html = await res.text();

    let title = "";
    let image = "";
    let description = "";
    let status = "";
    let genres = [];

    // Title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].replace(/\s*-\s*Anizm.*$/i, "").trim();

    // Image
    const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                     html.match(/class="[^"]*poster[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (imgMatch) image = imgMatch[1];

    // Description
    const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/i) ||
                      html.match(/class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                      html.match(/<p class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (descMatch) {
      description = descMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Genres
    const genreRegex = /href="[^"]*genre[^"]*"[^>]*>([^<]+)</gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(html)) !== null) {
      genres.push(gMatch[1].trim());
    }

    return {
      title: title || "Unknown",
      description: description || "",
      image: image || "",
      status: status,
      genres: genres
    };
  } catch (e) {
    console.log("Anizm details error:", e);
    return null;
  }
}

async function extractEpisodes(url) {
  try {
    const res = await fetchv2(url);
    const html = await res.text();

    const episodes = [];
    const seen = new Set();

    // Common episode link patterns on Anizm
    const patterns = [
      /href="(https?:\/\/(?:www\.)?anizm\.net\/[^"]*?bolum[^"]*?)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(https?:\/\/(?:www\.)?anizm\.net\/[^"]*?episode[^"]*?)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(\/[^"]*?-bolum-\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(https?:\/\/(?:www\.)?anizm\.net\/[^"]+?\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi
    ];

    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(html)) !== null) {
        let href = match[1];
        if (href.startsWith("/")) href = BASE + href;

        // Extract episode number
        let num = 0;
        const numMatch = href.match(/bolum-(\d+)/i) ||
                         href.match(/episode-(\d+)/i) ||
                         href.match(/\/(\d+)\/?$/) ||
                         match[2].match(/(\d+)\s*\.?\s*Bölüm/i) ||
                         match[2].match(/Bölüm\s*(\d+)/i);

        if (numMatch) num = parseInt(numMatch[1], 10);

        if (num > 0 && !seen.has(href)) {
          seen.add(href);
          episodes.push({
            href: href,
            number: num,
            title: `Bölüm ${num}`
          });
        }
      }
    }

    // Sort by episode number
    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  } catch (e) {
    console.log("Anizm episodes error:", e);
    return [];
  }
}

async function extractStreamUrl(url) {
  try {
    const res = await fetchv2(url);
    const html = await res.text();

    // 1. Look for packed JS (eval(function(p,a,c,k,e,d)...))
    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?<\/script>/i);
    let key = null;

    if (packedMatch) {
      try {
        // Very basic unpack attempt for FirePlayer key
        const packed = packedMatch[0];
        const keyMatch = packed.match(/FirePlayer\(["']([a-zA-Z0-9]+)["']/i) ||
                         packed.match(/["']([a-zA-Z0-9]{10,})["']\s*,\s*["']?https?:\/\//i);
        if (keyMatch) key = keyMatch[1];
      } catch (e) {}
    }

    // 2. Alternative: look for direct key patterns
    if (!key) {
      const keyPatterns = [
        /FirePlayer\(["']([a-zA-Z0-9]+)["']/i,
        /data=["']([a-zA-Z0-9]{12,})["']/i,
        /anizmplayer\.com\/video\/([a-zA-Z0-9]+)/i,
        /hash["']?\s*[:=]\s*["']([a-zA-Z0-9]+)["']/i
      ];
      for (const p of keyPatterns) {
        const m = html.match(p);
        if (m) {
          key = m[1];
          break;
        }
      }
    }

    // 3. Look for iframe sources
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
      const iframeSrc = iframeMatch[1];
      if (iframeSrc.includes("anizmplayer.com") || iframeSrc.includes("sibnet") || iframeSrc.includes("mp4")) {
        // If it's already a direct-ish link, try to resolve
        if (iframeSrc.includes("anizmplayer.com/video/")) {
          const k = iframeSrc.split("/video/")[1]?.split(/[?#]/)[0];
          if (k) key = k;
        } else if (iframeSrc.startsWith("http")) {
          return iframeSrc;
        }
      }
    }

    // 4. If we have a key, request the real video from anizmplayer
    if (key) {
      const postUrl = `${PLAYER}/player/index.php?data=${key}&do=getVideo`;
      const referer = `${PLAYER}/video/${key}`;

      const postRes = await fetchv2(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Origin": PLAYER,
          "Referer": referer,
          "Accept": "*/*"
        },
        body: `hash=${key}&r=${encodeURIComponent(BASE + "/")}`
      });

      const postText = await postRes.text();

      // Try to parse JSON response
      try {
        const json = JSON.parse(postText);
        if (json.videoSource) return json.videoSource;
        if (json.securedLink) return json.securedLink;
        if (json.source) return json.source;
        if (json.file) return json.file;
        if (json.link) return json.link;
      } catch (e) {}

      // Fallback: look for m3u8 or mp4 in response
      const streamMatch = postText.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i) ||
                          postText.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i) ||
                          postText.match(/"(https?:\/\/[^"]+)"/);
      if (streamMatch) return streamMatch[1].replace(/\\/g, "");
    }

    // 5. Last resort: look for any m3u8 / mp4 in the original page
    const directMatch = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i) ||
                        html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i);
    if (directMatch) return directMatch[1];

    console.log("Anizm: no stream found for", url);
    return null;
  } catch (e) {
    console.log("Anizm stream error:", e);
    return null;
  }
}
