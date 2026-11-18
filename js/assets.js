export const AssetManager = {
    sprites: {},
    manifest: {
        // Раскомментируйте, когда добавите свои PNG/SVG в папку assets/:
        // bubble: './assets/sprites/bubble.png',
        // ship: './assets/sprites/ship.png',
        // background: './assets/backgrounds/space.jpg'
    },

    loadAll() {
        for (const [key, src] of Object.entries(this.manifest)) {
            const img = new Image();
            img.onload = () => {
                this.sprites[key] = img;
            };
            img.onerror = () => {
                console.warn(`Спрайт не загружен (${src}), используется процедурная графика.`);
            };
            img.src = src;
        }
    },

    get(key) {
        return this.sprites[key] || null;
    }
};