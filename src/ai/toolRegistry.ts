import { Logger } from '@nestjs/common';
import { backendToolsClient, reccosApiClient } from './services/backend-tools.service';
import { performSearch, fetchPageMeta } from "./services/webSearch";

export type ToolHandler = (args: any, ctx: { userId: string }) => Promise<any>;

const logger = new Logger('ToolRegistry');

/**
 * Registre des handlers de tools pour Noor
 */
export const toolHandlers: Record<string, ToolHandler> = {
    // ============================================
    // OUTILS LEGACY (business tools)
    // ============================================
    async create_automation(args, ctx) {
        const payload = { ...args, requestedBy: ctx.userId };
        const response = await backendToolsClient.triggerTool('create_automation', payload);
        return response;
    },

    async analyze_client(args, ctx) {
        const payload = { ...args, requestedBy: ctx.userId };
        return backendToolsClient.triggerTool('analyze_client', payload);
    },

    async log_to_crm(args, ctx) {
        const payload = { ...args, requestedBy: ctx.userId };
        return backendToolsClient.triggerTool('log_to_crm', payload);
    },

    // ============================================
    // OUTILS WEB SEARCH
    // ============================================
    async web_search(args, ctx) {
        const { query, maxResults, recencyDays } = args;
        const numResults = Math.max(maxResults ?? 5, 3);
        logger.log(`🔍 [web_search] user=${ctx.userId} query="${query}"`);
        
        try {
            const results = await performSearch(query, numResults, recencyDays);
            logger.log(`✅ [web_search] ${results?.length || 0} résultats trouvés`);
            return { 
                results,
                query,
                source: 'web_search',
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            logger.error(`❌ [web_search] Erreur: ${error.message}`);
            return { 
                error: 'Recherche web temporairement indisponible',
                query 
            };
        }
    },

    async web_open(args, ctx) {
        const { url } = args;
        logger.log(`🌐 [web_open] user=${ctx.userId} url="${url}"`);
        
        try {
            const meta = await fetchPageMeta(url);
            return meta;
        } catch (error: any) {
            logger.error(`❌ [web_open] Erreur: ${error.message}`);
            return { 
                error: 'Impossible de récupérer cette page',
                url 
            };
        }
    },

    // ============================================
    // OUTILS RECCOS - Propriétés
    // ============================================
    
    /**
     * Lister les propriétés disponibles sur Reccos
     */
    async list_available_properties(args, ctx) {
        logger.log(`🏠 [list_available_properties] user=${ctx.userId} filters=${JSON.stringify(args)}`);
        
        try {
            // NE PAS passer de filtre status pour récupérer PUBLISHED + UPCOMING
            // Le backend retourne automatiquement les deux pour les clients (cf. clientVisibleStatuses)
            const normalizeText = (value: string | undefined | null) => {
                if (!value) return '';
                return value
                    .toString()
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]/g, '');
            };

            // Construire les filtres en excluant les valeurs undefined/null/vides
            const baseFilters: Record<string, any> = {
                // status omis intentionnellement → retourne published + upcoming
                limit: args.limit || 10, // augmenté pour voir plus de biens
            };
            
            // Ajouter uniquement les filtres définis
            if (args.emirate) baseFilters.emirate = args.emirate;
            if (args.zone) baseFilters.zone = args.zone;
            if (args.propertyType) baseFilters.propertyType = args.propertyType;
            if (args.minYield !== undefined && args.minYield !== null) baseFilters.minRentalYield = args.minYield;
            if (args.maxPricePerShare !== undefined && args.maxPricePerShare !== null) baseFilters.maxPrice = args.maxPricePerShare;
            if (args.minPricePerShare !== undefined && args.minPricePerShare !== null) baseFilters.minPrice = args.minPricePerShare;
            if (args.bedrooms !== undefined && args.bedrooms !== null) baseFilters.bedrooms = args.bedrooms;
            
            logger.debug(`🔍 [list_available_properties] baseFilters: ${JSON.stringify(baseFilters)}`);

            const requestedFilters = Object.fromEntries(
                Object.entries({
                    emirate: args.emirate,
                    zone: args.zone,
                    propertyType: args.propertyType,
                    minYield: args.minYield,
                    maxPricePerShare: args.maxPricePerShare,
                    minPricePerShare: args.minPricePerShare,
                    bedrooms: args.bedrooms,
                }).filter(([, value]) => value !== undefined && value !== null && value !== ''),
            );

            let properties = await reccosApiClient.getProperties(baseFilters);
            
            // Debug: logger les statuts des propriétés retournées
            if (properties && properties.length > 0) {
                const statuses = properties.map((p: any) => p.status || 'unknown');
                const uniqueStatuses = [...new Set(statuses)];
                logger.debug(`🔍 [list_available_properties] Propriétés retournées: ${properties.length}, statuts: ${uniqueStatuses.join(', ')}`);
            } else {
                logger.warn(`⚠️ [list_available_properties] Aucune propriété retournée par l'API avec les filtres: ${JSON.stringify(baseFilters)}`);
            }
            
            let zoneFallbackUsed = false;
            let globalFallbackUsed = false;
            let globalFallbackReason: string | null = null;

            // Si l'utilisateur filtre par zone mais que le backend ne renvoie rien,
            // on relance une requête sans filtre zone et on filtre côté IA (match approx.).
            if (args.zone && (!properties || properties.length === 0)) {
                const zoneTerm = args.zone.trim();
                if (zoneTerm.length > 0) {
                    const fallbackProperties = await reccosApiClient.getProperties({
                        ...baseFilters,
                        zone: undefined,
                        search: zoneTerm,
                    });

                    const filteredFallback = (fallbackProperties || []).filter((p: any) => {
                        const target = normalizeText(zoneTerm);
                        if (!target) return false;

                        const haystacks = [
                            p.zone,
                            p.title,
                            p.description,
                            p.emirate,
                            p.address,
                        ]
                            .filter(Boolean)
                            .map((str: string) => normalizeText(str));

                        return haystacks.some((value: string) => value.includes(target));
                    });

                    if (filteredFallback.length > 0) {
                        properties = filteredFallback;
                        zoneFallbackUsed = true;
                        logger.log(`ℹ️ [list_available_properties] zone fallback utilisé pour "${args.zone}" (${filteredFallback.length} propriétés trouvées)`);
                    }
                }
            }

            // Fallback global : si l'utilisateur a appliqué des filtres mais qu'on ne trouve rien,
            // relancer une requête sans aucun filtre pour proposer d'autres opportunités.
            if ((!properties || properties.length === 0) && Object.keys(requestedFilters).length > 0) {
                const fallbackProperties = await reccosApiClient.getProperties({ limit: baseFilters.limit });
                if (fallbackProperties && fallbackProperties.length > 0) {
                    properties = fallbackProperties;
                    globalFallbackUsed = true;
                    globalFallbackReason = 'no_match_with_filters';
                    logger.log(
                        `ℹ️ [list_available_properties] global fallback utilisé (filters=${JSON.stringify(
                            requestedFilters,
                        )}, results=${fallbackProperties.length})`,
                    );
                }
            }
            
            if (!properties || properties.length === 0) {
                return {
                    message: "No properties available matching these criteria",
                    filters: args,
                    status: "no_properties_found",
                    honest_info: {
                        reality: "There are currently NO properties available matching these criteria in the Reccos database.",
                        what_to_say: "Tell the user honestly that there are no properties available at the moment. DO NOT suggest broadening the search unless you have verified that other properties exist.",
                        next_steps: [
                            "User can sign up to be notified of new properties",
                            "New opportunities can arrive at any time",
                            "The Reccos team is constantly working to find new properties"
                        ]
                    }
                };
            }

            // Filtrage complémentaire selon le statut demandé
            let filtered = properties;
            if (args.status === 'published') {
                filtered = properties.filter((p: any) => p.isAvailableNow === true);
            } else if (args.status === 'upcoming') {
                filtered = properties.filter((p: any) => p.isUpcoming === true);
            }

            // Formater les propriétés pour une lecture facile par l'IA
            const now = Date.now();
            const formattedProperties = filtered
                .map((p: any) => {
                    const availableAt = p.availableAt ? new Date(p.availableAt).getTime() : null;
                    const isAvailableNow = !availableAt || availableAt <= now;
                    const friendlyDate = availableAt
                        ? new Date(availableAt).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                          })
                        : null;
                    // Labels in English for international compatibility
                    const availabilityLabel = isAvailableNow
                        ? '✅ Available now - Can invest immediately'
                        : friendlyDate
                        ? `⏳ Coming soon (${friendlyDate})`
                        : '⏳ Coming soon';

                    return {
                        id: p.id,
                        title: p.title,
                        zone: p.zone,
                        emirate: p.emirate,
                        type: p.propertyType,
                        pricePerShare: p.pricePerShare,
                        pricePerShareFormatted: `${Number(p.pricePerShare).toLocaleString()} AED`,
                        totalShares: p.totalShares,
                        availableShares: p.totalShares - (p.soldShares || 0),
                        soldPercentage:
                            p.totalShares > 0 ? Math.round(((p.soldShares || 0) / p.totalShares) * 100) : 0,
                        bedrooms: p.bedrooms,
                        bathrooms: p.bathrooms,
                        totalArea: p.totalArea ? `${p.totalArea} sqft` : null,
                        mainImage: p.mainImage,
                        completionStatus: p.completionStatus,
                        description: p.description?.substring(0, 200) + '...',
                        availableAt: p.availableAt || null,
                        isAvailableNow,
                        isUpcoming: !isAvailableNow,
                        status: isAvailableNow ? 'AVAILABLE' : 'UPCOMING',
                        availabilityLabel,
                    };
                })
                .filter((property) => {
                    if (args.status === 'available') {
                        return property.isAvailableNow;
                    }
                    if (args.status === 'upcoming') {
                        return property.isUpcoming;
                    }
                    return true;
                });

            if (formattedProperties.length === 0) {
                return {
                    message: "No properties available matching these criteria",
                    filters: args,
                    status: "no_properties_found",
                    honest_info: {
                        reality: "There are currently NO properties available matching these criteria in the Reccos database.",
                        what_to_say: "Tell the user honestly that there are no properties available at the moment. DO NOT suggest broadening the search unless you have verified that other properties exist.",
                        next_steps: [
                            "User can sign up to be notified of new properties",
                            "New opportunities can arrive at any time",
                            "The Reccos team is constantly working to find new properties"
                        ]
                    }
                };
            }

            logger.log(`✅ [list_available_properties] ${formattedProperties.length} propriétés (live + upcoming) trouvées`);
            
            return {
                count: formattedProperties.length,
                properties: formattedProperties,
                filters: args,
                meta: {
                    requestedFilters,
                    zoneFallbackUsed,
                    globalFallbackUsed,
                    globalFallbackReason,
                },
            };
        } catch (error: any) {
            logger.error(`❌ [list_available_properties] Erreur: ${error.message}`);
            return {
                error: 'Impossible de récupérer les propriétés pour le moment',
                message: "Je n'arrive pas à accéder à la base de données. Réessaie dans quelques instants ou contacte l'équipe Reccos.",
            };
        }
    },

    /**
     * Obtenir les détails d'une propriété spécifique
     */
    async get_property_details(args, ctx) {
        const { propertyId } = args;
        logger.log(`🏠 [get_property_details] user=${ctx.userId} propertyId=${propertyId}`);
        
        try {
            const property = await reccosApiClient.getPropertyById(propertyId);
            
            if (!property) {
                return {
                    error: 'Propriété non trouvée',
                    message: `Je n'ai pas trouvé de propriété avec l'ID "${propertyId}". Vérifie l'ID ou demande-moi de lister les propriétés disponibles.`,
                };
            }

            // Calculer quelques métriques utiles
            const availableShares = property.totalShares - (property.soldShares || 0);
            const totalValue = property.pricePerShare * property.totalShares;
            const monthlyRentalPerShare = property.rentalYield 
                ? (property.pricePerShare * property.rentalYield / 100 / 12)
                : null;

            const details = {
                id: property.id,
                title: property.title,
                description: property.description,
                
                // Localisation
                location: {
                    emirate: property.emirate,
                    zone: property.zone,
                    address: property.address,
                    nearbyLandmarks: property.nearbyLandmarks,
                    distanceToMetro: property.distanceToMetro ? `${property.distanceToMetro} km` : null,
                    distanceToBeach: property.distanceToBeach ? `${property.distanceToBeach} km` : null,
                },
                
                // Caractéristiques
                specs: {
                    type: property.propertyType,
                    bedrooms: property.bedrooms,
                    bathrooms: property.bathrooms,
                    totalArea: property.totalArea ? `${property.totalArea} sqft` : null,
                    builtArea: property.builtArea ? `${property.builtArea} sqft` : null,
                    view: property.view,
                    furnishing: property.furnishingStatus,
                    features: property.features,
                },
                
                // Investissement
                investment: {
                    pricePerShare: property.pricePerShare,
                    pricePerShareFormatted: `${Number(property.pricePerShare).toLocaleString()} AED`,
                    totalShares: property.totalShares,
                    availableShares,
                    soldShares: property.soldShares || 0,
                    soldPercentage: Math.round((property.soldShares || 0) / property.totalShares * 100),
                    totalPropertyValue: `${totalValue.toLocaleString()} AED`,
                    minimumInvestment: `${Number(property.pricePerShare).toLocaleString()} AED (1 part)`,
                },
                
                // Rendement
                returns: {
                    rentalYield: property.rentalYield ? `${property.rentalYield}%` : 'À confirmer',
                    monthlyRentalPerShare: monthlyRentalPerShare 
                        ? `~${Math.round(monthlyRentalPerShare).toLocaleString()} AED/mois par part`
                        : null,
                    expectedROI: property.expectedROI ? `${property.expectedROI}%` : null,
                },
                
                // Statut
                status: {
                    completionStatus: property.completionStatus,
                    handoverDate: property.handoverDate,
                    availabilityStatus: property.availabilityStatus,
                },
                
                // Médias
                media: {
                    mainImage: property.mainImage,
                    images: property.images,
                    virtualTour: property.virtualTourUrl,
                },
                
                // Développeur
                developer: property.developer ? {
                    name: `${property.developer.firstName} ${property.developer.lastName}`.trim(),
                    brand: property.brandDeveloper?.name,
                } : null,
            };

            logger.log(`✅ [get_property_details] Propriété trouvée: ${property.title}`);
            return details;
            
        } catch (error: any) {
            logger.error(`❌ [get_property_details] Erreur: ${error.message}`);
            return {
                error: 'Impossible de récupérer les détails',
                message: "Je n'arrive pas à accéder aux détails de cette propriété. Réessaie dans quelques instants.",
            };
        }
    },

    /**
     * Calculer le rendement d'un investissement
     */
    async calculate_investment(args, ctx) {
        const { propertyId, numberOfShares, investmentAmount, holdingPeriodYears = 5 } = args;
        logger.log(`📊 [calculate_investment] user=${ctx.userId} propertyId=${propertyId} shares=${numberOfShares} amount=${investmentAmount}`);
        
        try {
            // Récupérer les détails de la propriété
            const property = await reccosApiClient.getPropertyById(propertyId);
            
            if (!property) {
                return {
                    error: 'Propriété non trouvée',
                    message: "Je n'ai pas trouvé cette propriété. Vérifie l'ID ou demande-moi la liste des propriétés.",
                };
            }

            const pricePerShare = Number(property.pricePerShare);
            const rentalYield = Number(property.rentalYield) || 6; // Default 6% si non spécifié
            
            // Calculer le nombre de parts si montant fourni
            let shares = numberOfShares;
            if (!shares && investmentAmount) {
                shares = Math.floor(investmentAmount / pricePerShare);
            }
            if (!shares || shares < 1) {
                shares = 1;
            }

            // Vérifier disponibilité
            const availableShares = property.totalShares - (property.soldShares || 0);
            if (shares > availableShares) {
                return {
                    error: 'Parts insuffisantes',
                    message: `Il ne reste que ${availableShares} parts disponibles sur cette propriété. Tu peux en acheter jusqu'à ${availableShares}.`,
                    availableShares,
                    requested: shares,
                };
            }

            // Calculs
            const totalInvestment = shares * pricePerShare;
            const annualRentalIncome = totalInvestment * (rentalYield / 100);
            const monthlyRentalIncome = annualRentalIncome / 12;
            
            // Projection plus-value (estimation conservatrice 5% par an)
            const annualAppreciation = 0.05;
            const futureValue = totalInvestment * Math.pow(1 + annualAppreciation, holdingPeriodYears);
            const capitalGain = futureValue - totalInvestment;
            
            // Total des revenus locatifs sur la période
            const totalRentalIncome = annualRentalIncome * holdingPeriodYears;
            
            // ROI total
            const totalReturn = capitalGain + totalRentalIncome;
            const totalROI = (totalReturn / totalInvestment) * 100;
            const annualizedROI = (Math.pow(1 + totalReturn / totalInvestment, 1 / holdingPeriodYears) - 1) * 100;

            const calculation = {
                property: {
                    id: property.id,
                    title: property.title,
                    zone: property.zone,
                    rentalYield: `${rentalYield}%`,
                },
                
                investment: {
                    numberOfShares: shares,
                    pricePerShare: `${pricePerShare.toLocaleString()} AED`,
                    totalInvestment: `${Math.round(totalInvestment).toLocaleString()} AED`,
                    percentageOfProperty: `${((shares / property.totalShares) * 100).toFixed(2)}%`,
                },
                
                rentalIncome: {
                    monthly: `${Math.round(monthlyRentalIncome).toLocaleString()} AED`,
                    annual: `${Math.round(annualRentalIncome).toLocaleString()} AED`,
                    overPeriod: `${Math.round(totalRentalIncome).toLocaleString()} AED (sur ${holdingPeriodYears} ans)`,
                },
                
                projection: {
                    holdingPeriod: `${holdingPeriodYears} ans`,
                    assumedAnnualAppreciation: '5% par an (estimation conservatrice)',
                    estimatedFutureValue: `${Math.round(futureValue).toLocaleString()} AED`,
                    estimatedCapitalGain: `${Math.round(capitalGain).toLocaleString()} AED`,
                },
                
                totalReturns: {
                    totalProfit: `${Math.round(totalReturn).toLocaleString()} AED`,
                    totalROI: `${totalROI.toFixed(1)}%`,
                    annualizedROI: `${annualizedROI.toFixed(1)}% par an`,
                },
                
                disclaimer: "⚠️ Ces calculs sont des estimations basées sur les rendements actuels et une appréciation de 5%/an. Les performances passées ne garantissent pas les résultats futurs. Le marché immobilier comporte des risques. Consulte un conseiller financier pour une analyse personnalisée.",
            };

            logger.log(`✅ [calculate_investment] Calcul effectué pour ${shares} parts`);
            return calculation;
            
        } catch (error: any) {
            logger.error(`❌ [calculate_investment] Erreur: ${error.message}`);
            return {
                error: 'Impossible de calculer',
                message: "Je n'ai pas pu effectuer ce calcul. Réessaie dans quelques instants.",
            };
        }
    },

    /**
     * Obtenir les statistiques du marché Reccos
     */
    async get_market_stats(args, ctx) {
        const { zone } = args;
        logger.log(`📈 [get_market_stats] user=${ctx.userId} zone=${zone || 'all'}`);
        
        try {
            // Récupérer toutes les propriétés publiées
            const properties = await reccosApiClient.getProperties({
                status: 'published',
                zone,
                limit: 100,
            });
            
            if (!properties || properties.length === 0) {
                return {
                    message: zone 
                        ? `No properties yet in ${zone} on Reccos`
                        : "No properties available at the moment",
                    suggestion: "Come back soon, new opportunities arrive regularly!",
                };
            }

            // Calculer les stats
            const totalProperties = properties.length;
            const yields = properties
                .filter((p: any) => p.rentalYield)
                .map((p: any) => Number(p.rentalYield));
            const averageYield = yields.length > 0 
                ? yields.reduce((a: number, b: number) => a + b, 0) / yields.length 
                : null;
            
            const prices = properties.map((p: any) => Number(p.pricePerShare));
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;

            // Compter par zone
            const byZone: Record<string, number> = {};
            properties.forEach((p: any) => {
                byZone[p.zone] = (byZone[p.zone] || 0) + 1;
            });

            // Compter par type
            const byType: Record<string, number> = {};
            properties.forEach((p: any) => {
                byType[p.propertyType] = (byType[p.propertyType] || 0) + 1;
            });

            const stats = {
                overview: {
                    totalProperties,
                    zone: zone || 'Tous les émirats',
                    lastUpdated: new Date().toISOString(),
                },
                
                yields: averageYield ? {
                    average: `${averageYield.toFixed(1)}%`,
                    range: `${Math.min(...yields).toFixed(1)}% - ${Math.max(...yields).toFixed(1)}%`,
                    note: "Rendement locatif net annuel",
                } : { note: "Rendements en cours de calcul" },
                
                pricing: {
                    minimum: `${minPrice.toLocaleString()} AED par part`,
                    maximum: `${maxPrice.toLocaleString()} AED par part`,
                    average: `${Math.round(avgPrice).toLocaleString()} AED par part`,
                },
                
                distribution: {
                    byZone: Object.entries(byZone)
                        .sort((a, b) => b[1] - a[1])
                        .map(([zone, count]) => `${zone}: ${count}`),
                    byType: Object.entries(byType)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => `${type}: ${count}`),
                },
                
                highlights: [
                    `${totalProperties} propriétés disponibles à l'investissement`,
                    averageYield ? `Rendement moyen de ${averageYield.toFixed(1)}%` : null,
                    `Prix d'entrée à partir de ${minPrice.toLocaleString()} AED`,
                ].filter(Boolean),
            };

            logger.log(`✅ [get_market_stats] Stats calculées: ${totalProperties} propriétés`);
            return stats;
            
        } catch (error: any) {
            logger.error(`❌ [get_market_stats] Erreur: ${error.message}`);
            return {
                error: 'Statistiques indisponibles',
                message: "Je n'arrive pas à calculer les stats pour le moment. Réessaie dans quelques instants.",
            };
        }
    },
};

/**
 * Exécuter un tool par son nom
 */
export async function executeTool(
    toolName: string,
    args: any,
    context: { userId: string }
): Promise<any> {
    if (!toolName) {
        throw new Error('Nom de tool manquant');
    }
    
    const handler = toolHandlers[toolName];
    if (!handler) {
        logger.warn(`⚠️ Tool "${toolName}" non trouvé dans le registre`);
        throw new Error(`Tool ${toolName} not found. Available tools: ${Object.keys(toolHandlers).join(', ')}`);
    }
    
    logger.log(`🔧 Exécution tool: ${toolName}`);
    const startTime = Date.now();
    
    try {
        const result = await handler(args, context);
        const duration = Date.now() - startTime;
        logger.log(`✅ Tool ${toolName} exécuté en ${duration}ms`);
        return result;
    } catch (error: any) {
        logger.error(`❌ Tool ${toolName} erreur: ${error.message}`);
        throw error;
    }
}
