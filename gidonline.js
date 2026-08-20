class Source {
    constructor() {
        this.baseUrl = "https://gidonline.me";
    }

    async search(query) {
        try {
            // Using a CORS proxy to bypass Cloudflare blockages
            const targetUrl = encodeURIComponent(`${this.baseUrl}/?s=${encodeURIComponent(query)}`);
            const proxyUrl = `https://api.allorigins.win/get?url=${targetUrl}`;

            const res = await fetch(proxyUrl);
            if (!res.ok) return [];

            const data = await res.json();
            const html = data.contents;
            if (!html) return [];

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
        return {};
    }

    async getStream(url) {
        return [];
    }
}

const source = new Source();
