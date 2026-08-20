class Source {
    constructor() {
        this.baseUrl = "https://kinogo.inc";
    }

    async search(query) {
        try {
            const params = new URLSearchParams();
            params.append("do", "search");
            params.append("subaction", "search");
            params.append("story", query);

            const res = await fetch(`${this.baseUrl}/index.php?do=search`, {
                method: "POST",
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: params.toString()
            });

            if (!res.ok) return [];

            const html = await res.text();
            const results = [];
            
            const regex = /<div class="shortstory-title"><a href="(.*?)">(.*?)<\/a>[\s\S]*?<img src="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let imgUrl = match[3];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[2].replace(/<[^>]*>/g, "").trim(),
                    href: match[1],
                    image: imgUrl
                });
            }

            return results;
        } catch (e) {
            return [];
        }
    }

    async searchResults(query) {
        return await this.search(query);
    }

    async getDetails(url) {
        try {
            const res = await fetch(url, {
                headers: { 
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" 
                }
            });
            const html = await res.text();

            // Extract iframe player URL from Kinogo page
            const iframeMatch = html.match(/<iframe[\s\S]*?src=["'](.*?)["']/i);
            const playerUrl = iframeMatch ? iframeMatch[1] : "";

            return {
                streamUrl: playerUrl
            };
        } catch (e) {
            return {};
        }
    }

    async getStream(url) {
        if (!url) return [];

        try {
            let embedUrl = url;
            if (embedUrl.startsWith("//")) {
                embedUrl = `https:${embedUrl}`;
            }

            // Fetch iframe player page to locate direct video file
            const res = await fetch(embedUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                    "Referer": this.baseUrl
                }
            });

            const html = await res.text();

            // Search for direct HLS (.m3u8) or MP4 stream URL inside player code
            const streamMatch = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/i) 
                               || html.match(/file\s*:\s*["']([^"']+)["']/i);

            if (streamMatch && streamMatch[1]) {
                return [{
                    name: "KinoGo HD",
                    url: streamMatch[1],
                    quality: "1080p"
                }];
            }

            return [];
        } catch (e) {
            return [];
        }
    }
}

const source = new Source();
