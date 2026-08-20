class Source {
    constructor() {
        this.baseUrl = "https://kinogo.inc";
    }

    async search(query) {
        // 5-second timeout controller so Luna never hangs indefinitely
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

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
                body: params.toString(),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
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
            clearTimeout(timeoutId);
            return []; // Guarantees Luna receives an empty array instead of hanging
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
