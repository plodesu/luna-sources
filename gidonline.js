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

            // Pattern targeting GidOnline search listing entries
            const regex = /<a class="mains" href="(.*?)">[\s\S]*?<img src="(.*?)" alt="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let imgUrl = match[2];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[3].trim(),
                    href: match[1], // Luna uses 'href' for post links
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
        return {};
    }

    async getStream(url) {
        return [];
    }
}

const source = new Source();
