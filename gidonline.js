class Source {
    constructor() {
        // Points to your deployed Cloudflare Worker
        this.proxyUrl = "https://gidonline-proxy.justalihan095.workers.dev";
        this.baseUrl = "https://gidonline.eu";
    }

    async search(query) {
        try {
            const res = await fetch(`${this.proxyUrl}?s=${encodeURIComponent(query)}`);
            if (!res.ok) return [];

            const html = await res.text();
            const results = [];
            
            // RegEx to extract links, posters, and titles from GidOnline DLE results
            const regex = /<a class="mains" href="(.*?)">[\s\S]*?<img src="(.*?)" alt="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let imgUrl = match[2];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[3].trim(),
                    href: match[1], // Required key for Luna
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
            const res = await fetch(url);
            const html = await res.text();
            const iframe = html.match(/<iframe class="ifram" src="(.*?)"/);
            return { 
                streamUrl: iframe ? iframe[1] : "" 
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
