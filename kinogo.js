class Source {
    constructor() {
        this.baseUrl = "https://kinogo.online";
    }

    async search(query, page = 1) {
        try {
            const body = new URLSearchParams({
                do: "search",
                subaction: "search",
                story: query
            }).toString();

            const response = await fetch(`${this.baseUrl}/index.php?do=search`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
                },
                body: body
            });

            if (!response.ok) return [];
            const text = await response.text();

            const results = [];
            // Extracts search title, link, and poster image from Kinogo HTML
            const regex = /<div class="shortstorytitle">[\s\S]*?<a href="(.*?)">(.*?)<\/a>[\s\S]*?<img src="(.*?)"/g;
            let match;

            while ((match = regex.exec(text)) !== null) {
                let imgUrl = match[3];
                if (imgUrl && !imgUrl.startsWith("http")) {
                    imgUrl = `${this.baseUrl}${imgUrl}`;
                }

                results.push({
                    title: match[2].replace(/<[^>]*>?/gm, "").trim(),
                    url: match[1],
                    image: imgUrl
                });
            }

            return results;
        } catch (e) {
            console.error("Kinogo search error:", e);
            return [];
        }
    }

    async getDetails(url) {
        return {};
    }

    async getStream(url) {
        return [];
    }
}

const source = new Source();
