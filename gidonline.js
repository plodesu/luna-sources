class Source {
    constructor() {
        this.baseUrl = "https://gidonline.me";
    }

    async search(query) {
        try {
            const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
            const response = await fetch(searchUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
                }
            });

            if (!response.ok) return [];
            const html = await response.text();
            const results = [];

            const regex = /<a class="mains" href="(.*?)">[\s\S]*?<img src="(.*?)" alt="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let imgUrl = match[2];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[3].trim(),
                    url: match[1],
                    image: imgUrl
                });
            }

            return results;
        } catch (e) {
            console.error("GidOnline search error:", e);
            return [];
        }
    }

    async getDetails(url) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            const iframeMatch = html.match(/<iframe class="ifram" src="(.*?)"/);
            const streamUrl = iframeMatch ? iframeMatch[1] : null;

            return {
                streamUrl: streamUrl
            };
        } catch (e) {
            return {};
        }
    }

    async getStream(url) {
        return [];
    }
}

const source = new Source();
