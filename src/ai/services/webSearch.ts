/**
 * Service de recherche web
 * Fonctions partagées pour performSearch et fetchPageMeta
 */

export type WebResult = {
    title: string;
    url: string;
    snippet?: string;
    date?: string;
    image?: string;
    favicon?: string;
    source?: string; // e.g. domain/displayLink
};

/**
 * Effectuer une recherche web via Google Custom Search API
 * Documentation: https://developers.google.com/custom-search/v1/using_rest
 */
export async function performSearch(q: string, max = 5, recencyDays?: number): Promise<WebResult[]> {
    const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

    console.log('🔍 performSearch appelé avec query:', q);
    console.log('🔑 API Key présent:', !!apiKey);
    console.log('🔑 Search Engine ID présent:', !!searchEngineId);

    if (!apiKey || !searchEngineId) {
        console.warn('⚠️ GOOGLE_CUSTOM_SEARCH_API_KEY ou GOOGLE_CUSTOM_SEARCH_ENGINE_ID non configurés');
        return [];
    }

    try {
        const num = max; // Google limite à 10 résultats par page

        // Construire l'URL avec les paramètres requis
        const params = new URLSearchParams({
            key: apiKey,
            cx: searchEngineId,
            q: q,
            num: num.toString(),
        });

        // Option: ajouter un filtre de date si demandé (format date), mais Google n'a pas de paramètre recencyDays direct
        // On peut utiliser dateRestrict avec des valeurs prédéfinies (d, w, m, y) mais pas personnalisées
        // Pour les dates, on pourrait parser les résultats côté serveur

        const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
        console.log(`🔍 Google Custom Search: "${q}"`);

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Google Custom Search error (${response.status}):`, errorText);
            return [];
        }

        const data = await response.json();

        // Transformer les résultats Google en format WebResult
        if (!data.items || data.items.length === 0) {
            console.log('📭 Aucun résultat trouvé');
            return [];
        }

        let results: WebResult[] = data.items.map((item: any) => {
            const image = item.pagemap?.cse_image?.[0]?.src || item.pagemap?.cse_thumbnail?.[0]?.src;
            const favicon = item.pagemap?.cse_thumbnail?.[0]?.src; // approximatif
            const source = item.displayLink || new URL(item.link).hostname;
            return {
                title: item.title || 'Sans titre',
                url: item.link,
                snippet: item.snippet,
                date: item.date || undefined,
                image,
                favicon,
                source,
            } as WebResult;
        });

        // Filtrer et prioriser les résultats pertinents (titres correspondant aux mots-clés)
        if (results.length > 1) {
            const keywords = q.toLowerCase().split(/\s+/);
            results.sort((a, b) => {
                const titleA = (a.title + ' ' + (a.snippet || '')).toLowerCase();
                const titleB = (b.title + ' ' + (b.snippet || '')).toLowerCase();
                
                // Compter les mots-clés correspondants
                const scoreA = keywords.reduce((sum, kw) => sum + (titleA.includes(kw) ? 1 : 0), 0);
                const scoreB = keywords.reduce((sum, kw) => sum + (titleB.includes(kw) ? 1 : 0), 0);
                
                return scoreB - scoreA; // Plus de matches en premier
            });
        }

        console.log(`✅ ${results.length} résultats trouvés`);
        return results;

    } catch (error) {
        console.error('❌ Erreur Google Custom Search:', error);
        return [];
    }
}

/**
 * Récupérer les métadonnées d'une page web
 */
export async function fetchPageMeta(url: string): Promise<WebResult> {
    try {
        const r = await fetch(url, { method: "GET" });
        const html = await r.text();
        const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || url).trim();
        const snippet = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]
            || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]
            || html.replace(/\s+/g, " ").slice(0, 400)) as string;
        const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
        const twitterImage = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
        const linkIcon = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
        const image = ogImage || twitterImage;
        const favicon = linkIcon;
        const source = new URL(url).hostname;
        return { title, url, snippet, image, favicon, source };
    } catch (e) {
        return { title: url, url, snippet: 'Unable to fetch metadata' };
    }
}

