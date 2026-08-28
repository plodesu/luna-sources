class MeAnime extends Source {
  constructor() {
    super();
    this.baseUrl = "https://www.meanime.net"; // Adjusted to standard domain
  }

  async search(query, page = 1) {
    const url = `${this.baseUrl}/tim-kiem?keyword=${encodeURIComponent(query)}&page=${page}`;
    const response = await Client.get(url);
    const $ = Cheerio.load(response.data);
    const results = [];

    $("div.grid a, div.group a, .movie-item").each((_, element) => {
      const el = $(element);
      const title = el.find("h3, .title").text().trim() || el.attr("title");
      const link = el.attr("href");
      let cover = el.find("img").attr("data-src") || el.find("img").attr("src");
      const latestEpisode = el.find(".episode, span.text-\\[9px\\]").first().text().trim();

      if (title && link) {
        // Fix relative URLs for covers and links
        if (cover && cover.startsWith("/")) cover = this.baseUrl + cover;
        const finalUrl = link.startsWith("http") ? link : this.baseUrl + link;
        
        results.push({
          title: title,
          url: finalUrl,
          cover: cover || "",
          description: latestEpisode ? `Cập nhật: ${latestEpisode}` : ""
        });
      }
    });

    return results;
  }

  async getDetail(url) {
    const fullUrl = url.startsWith("http") ? url : this.baseUrl + url;
    const response = await Client.get(fullUrl);
    const $ = Cheerio.load(response.data);

    const title = $("h1").first().text().trim() || $("meta[property='og:title']").attr("content");
    let cover = $("meta[property='og:image']").attr("content") || $(".film-poster img").attr("src");
    const description = $("meta[property='og:description']").attr("content") || $(".film-description").text().trim();
    
    if (cover && cover.startsWith("/")) cover = this.baseUrl + cover;

    const episodes = [];
    
    // Look for standard episode button structures in Vietsub sites
    $("a[href*='/xem/'], .list-episode a, .episodes a").each((_, element) => {
      const el = $(element);
      const epName = el.text().trim();
      const epLink = el.attr("href");

      if (epLink && !episodes.some(e => e.url === epLink)) {
        episodes.push({
          name: epName || `Tập ${episodes.length + 1}`,
          url: epLink.startsWith("http") ? epLink : this.baseUrl + epLink
        });
      }
    });

    return {
      title: title || "Unknown Title",
      cover: cover || "",
      description: description || "",
      episodes: episodes
    };
  }

  async getPlayerUrl(episodeUrl) {
    const fullUrl = episodeUrl.startsWith("http") ? episodeUrl : this.baseUrl + episodeUrl;
    const response = await Client.get(fullUrl);
    const html = response.data;
    const $ = Cheerio.load(html);

    let videoSources = [];
    const extractRegex = /(?:file|src|url)["']?\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i;

    // Strategy 1: Look for direct video/source tags in the episode DOM
    $("video source").each((_, el) => {
      const src = $(el).attr("src");
      if (src && (src.includes(".m3u8") || src.includes(".mp4"))) {
        videoSources.push({ url: src, quality: "Auto" });
      }
    });

    // Strategy 2: Regex search the raw HTML for JWPlayer/Plyr configs
    if (videoSources.length === 0) {
      const sourceMatch = html.match(extractRegex);
      if (sourceMatch && sourceMatch[1]) {
        videoSources.push({ url: sourceMatch[1], quality: "Auto" });
      }
    }

    // Strategy 3: Deep Iframe Extraction (Crucial for embedded players)
    if (videoSources.length === 0) {
      let iframeSrc = $("iframe").attr("src") || $("iframe").attr("data-src");
      if (iframeSrc) {
        if (iframeSrc.startsWith("//")) iframeSrc = "https:" + iframeSrc;
        
        try {
          // Navigate into the iframe to find the true stream
          const iframeRes = await Client.get(iframeSrc, {
            headers: { "Referer": this.baseUrl }
          });
          
          const iframeMatch = iframeRes.data.match(extractRegex);
          if (iframeMatch && iframeMatch[1]) {
            videoSources.push({ url: iframeMatch[1], quality: "Auto" });
          }
        } catch (e) {
          // Silently fail if iframe request is blocked
        }
      }
    }

    // Format the output exactly how native players (Exoplayer) expect it
    return videoSources.map(video => ({
      url: video.url,
      name: video.quality,
      type: video.url.includes(".m3u8") ? "hls" : "mp4",
      headers: {
        "Referer": this.baseUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    }));
  }
}
