class Source {
    constructor() {
        this.baseUrl = "https://kinogo.inc";
    }

    async search(query) {
        try {
            const url = `${this.baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
                }
            });

            if (!res.ok) return [];

            const html = await res.text();
            const results = [];
            
            // Extract titles, hrefs, and poster images directly from DLE HTML
            const regex = /<div class="shortstory-title"><a href="(.*?)">(.*?)<\/a>[\s\S]*?<img src="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let imgUrl = match[3];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[2].trim(),
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
            const res = await fetch(url);
            const html = await res.text();
            
            // Extract embed player link
            const iframe = html.match(/<iframe[\s\S]*?src="(.*?)"/);
            return { streamUrl: iframe ? iframe[1] : "" };
        } catch (e) {
            return {};
        }
    }

    async getStream(url) {
        return [];
    }
}

const source = new Source();
