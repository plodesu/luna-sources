class Source {
    constructor() {
        this.baseUrl = "https://kinogo.online";
    }

    async search(query) {
        try {
            const searchUrl = `${this.baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
            const response = await fetch(searchUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            });
            const text = await response.text();
            
            const results = [];
            const regex = /<div class="shortstorytitle">[\s\S]*?<a href="(.*?)">(.*?)<\/a>[\s\S]*?<img src="(.*?)"/g;
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                results.push({
                    title: match[2].replace(/<[^>]*>?/gm, '').trim(),
                    href: match[1],
                    image: match[3].startsWith('http') ? match[3] : `${this.baseUrl}${match[3]}`
                });
            }
            return results;
        } catch (e) {
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
