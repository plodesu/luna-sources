class Source {
    constructor() {
        this.baseUrl = "https://kinogo.inc";
    }

    async search(query) {
        try {
            // DLE requires POST data formatted as application/x-www-form-urlencoded
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
            
            // Regex to parse Kinogo search result cards
            const regex = /<div class="shortstory-title"><a href="(.*?)">(.*?)<\/a>[\s\S]*?<img src="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let imgUrl = match[3];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[2].replace(/<[^>]*>/g, "").trim(), // Strip inner HTML tags
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
            
            // Extract player iframe source
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
