class Source {
    constructor() {
        this.baseUrl = "https://gidonline.me";
    }

    async search(query) {
        try {
            const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
            const response = await fetch(url);
            if (!response.ok) return [];

            const html = await response.text();
            const results = [];
            const regex = /<a class="mains" href="(.*?)">[\s\S]*?<img src="(.*?)" alt="(.*?)"/g;
            let match;

            while ((match = regex.exec(html)) !== null) {
                let img = match[2];
                if (img && !img.startsWith("http")) img = `${this.baseUrl}${img}`;

                results.push({
                    title: match[3].trim(),
                    href: match[1],
                    image: img
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
