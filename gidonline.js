class Source {
    constructor() {
        this.baseUrl = "https://vidsrc.me";
    }

    async search(query) {
        try {
            // Fetch search results via public API to bypass Cloudflare blocks
            const res = await fetch(`https://vidsrc.tmdbvids.com/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) return [];
            
            const data = await res.json();
            if (!data || !data.results) return [];

            return data.results.map(item => ({
                title: item.title || item.name || query,
                href: `${this.baseUrl}/embed/movie/${item.id}`,
                image: item.poster_path ? `https://image.tmdb.org/t50/w500${item.poster_path}` : ""
            }));
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
