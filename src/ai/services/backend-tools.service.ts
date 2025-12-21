import axios, { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';

const logger = new Logger('BackendToolsService');

interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Client pour les outils internes du backend (CRM, automations, etc.)
 */
export class BackendToolsClient {
  private client: AxiosInstance | null = null;
  private baseUrl?: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl = process.env.BACKEND_TOOLS_URL;
    this.apiKey = process.env.BACKEND_TOOLS_API_KEY;
  }

  private ensureClient(): AxiosInstance {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('BACKEND_TOOLS_URL ou BACKEND_TOOLS_API_KEY manquant');
    }
    if (!this.client) {
      this.client = axios.create({
        baseURL: this.baseUrl.replace(/\/$/, ''),
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.apiKey,
        },
      });
    }
    return this.client;
  }

  async triggerTool(
    name: string,
    payload: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<any> {
    const client = this.ensureClient();
    const response = await client.post('/tools/execute', {
      name,
      payload,
      metadata,
    });
    return response.data;
  }
}

/**
 * Client pour l'API Reccos (propriétés)
 */
export class ReccosApiClient {
  private client: AxiosInstance | null = null;
  private readonly baseUrls: string[];
  private currentIndex = 0;

  constructor() {
    const candidates = [
      process.env.RECCOS_API_URL,
      process.env.BACKEND_URL,
      'http://127.0.0.1:3000/api',
      'http://localhost:3000/api',
    ]
      .filter((url): url is string => !!url)
      .map((url) => url.replace(/\/$/, ''));

    this.baseUrls = Array.from(new Set(candidates));

    if (this.baseUrls.length === 0) {
      this.baseUrls = ['http://127.0.0.1:3000/api'];
    }

    logger.log(`🔧 [ReccosAPI] Initialisé avec baseUrls: ${this.baseUrls.join(' , ')}`);
    logger.log(
      `🔧 [ReccosAPI] RECCOS_API_URL=${process.env.RECCOS_API_URL || 'non défini'}, BACKEND_URL=${
        process.env.BACKEND_URL || 'non défini'
      }`,
    );
  }

  private ensureClient(): AxiosInstance {
    if (!this.client) {
      this.client = axios.create({
        baseURL: this.baseUrls[this.currentIndex],
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Log les requêtes en dev
      this.client.interceptors.request.use((config) => {
        logger.debug(`🌐 [ReccosAPI] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      });

      // Log les réponses/erreurs
      this.client.interceptors.response.use(
        (response) => {
          logger.debug(`✅ [ReccosAPI] ${response.status} ${response.config.url}`);
          return response;
        },
        (error) => {
          logger.error(`❌ [ReccosAPI] ${error.response?.status || 'ERR'} ${error.config?.url}: ${error.message}`);
          throw error;
        }
      );
    }
    return this.client;
  }

  private rotateBaseUrl(error: any): boolean {
    const nextIndex = (this.currentIndex + 1) % this.baseUrls.length;
    if (nextIndex === this.currentIndex) {
      return false;
    }

    const shouldFallback =
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ENOTFOUND' ||
      error?.response?.status === 401 ||
      error?.response?.status === 403 ||
      error?.response?.status === 404;

    if (!shouldFallback) {
      return false;
    }

    this.currentIndex = nextIndex;
    this.client = null;
    logger.warn(`⚠️ [ReccosAPI] Fallback vers ${this.baseUrls[this.currentIndex]} suite à ${error?.code || error?.response?.status}`);
    return true;
  }

  private async withFallback<T>(operation: () => Promise<T>): Promise<T> {
    let attempts = 0;
    let lastError: any = null;

    while (attempts < this.baseUrls.length) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempts++;
        if (!this.rotateBaseUrl(error)) {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Récupérer les propriétés avec filtres
   */
  async getProperties(filters: {
    status?: string;
    emirate?: string;
    zone?: string;
    propertyType?: string;
    minRentalYield?: number;
    maxRentalYield?: number;
    minPrice?: number;
    maxPrice?: number;
    bedrooms?: number;
    limit?: number;
    page?: number;
    search?: string; // Recherche textuelle
  }): Promise<any[]> {
    try {
      // Construire les query params
      const params = new URLSearchParams();

      if (filters.status) params.append('status', filters.status);
      if (filters.emirate) params.append('emirate', filters.emirate.toLowerCase());
      if (filters.zone) params.append('zone', filters.zone);
      if (filters.propertyType) params.append('propertyType', filters.propertyType);
      if (filters.minRentalYield) params.append('minRentalYield', String(filters.minRentalYield));
      if (filters.maxRentalYield) params.append('maxRentalYield', String(filters.maxRentalYield));
      if (filters.minPrice) params.append('minPrice', String(filters.minPrice));
      if (filters.maxPrice) params.append('maxPrice', String(filters.maxPrice));
      if (filters.bedrooms) params.append('bedrooms', String(filters.bedrooms));
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.page) params.append('page', String(filters.page));

      // Utiliser l'endpoint public pour les propriétés publiées
      const endpoint = '/properties/public';
      const url = `${endpoint}?${params.toString()}`;

      logger.log(`📊 [ReccosAPI] Fetching properties: ${url}`);

      const response = await this.withFallback(() => this.ensureClient().get(url));

      // Debug: logger la structure complète de la réponse
      logger.debug(`🔍 [ReccosAPI] Response structure: ${JSON.stringify({
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        hasNestedData: !!response.data?.data,
        nestedDataKeys: response.data?.data ? Object.keys(response.data.data) : [],
        isArray: Array.isArray(response.data),
        isNestedArray: Array.isArray(response.data?.data),
      })}`);

      // Extraire les propriétés de la réponse
      // NestJS peut retourner soit directement { properties, total, page, limit }
      // soit enveloppé dans { data: { properties, total, page, limit } }
      let properties: any[] = [];

      if (response.data) {
        // Cas 1: Réponse directe { properties: [...], total, page, limit }
        if (Array.isArray(response.data.properties)) {
          properties = response.data.properties;
          logger.debug(`✅ [ReccosAPI] Found properties in response.data.properties`);
        }
        // Cas 2: Réponse enveloppée { data: { properties: [...], total, page, limit } }
        else if (response.data.data && Array.isArray(response.data.data.properties)) {
          properties = response.data.data.properties;
          logger.debug(`✅ [ReccosAPI] Found properties in response.data.data.properties`);
        }
        // Cas 3: Réponse avec data directe comme tableau (peu probable mais possible)
        else if (Array.isArray(response.data.data)) {
          properties = response.data.data;
          logger.debug(`✅ [ReccosAPI] Found properties as direct array in response.data.data`);
        }
        // Cas 4: Réponse directe comme tableau (peu probable)
        else if (Array.isArray(response.data)) {
          properties = response.data;
          logger.debug(`✅ [ReccosAPI] Found properties as direct array in response.data`);
        }
        // Cas 5: Essayer data?.properties si data existe
        else if (response.data.data && Array.isArray(response.data.data)) {
          properties = response.data.data;
          logger.debug(`✅ [ReccosAPI] Found properties in response.data.data (fallback)`);
        }
      }

      logger.log(`✅ [ReccosAPI] ${properties.length} propriétés récupérées`);

      if (properties.length === 0) {
        logger.warn(`⚠️ [ReccosAPI] Aucune propriété trouvée. Structure de réponse: ${JSON.stringify({
          responseDataType: typeof response.data,
          responseDataIsArray: Array.isArray(response.data),
          responseDataKeys: response.data ? Object.keys(response.data) : 'null',
          sample: response.data ? JSON.stringify(response.data).substring(0, 200) : 'null',
        })}`);
      }

      return properties;
    } catch (error: any) {
      logger.error(`❌ [ReccosAPI] getProperties error: ${error.message}`);

      // En cas d'erreur, retourner un tableau vide plutôt que de throw
      if (error.response?.status === 404) {
        return [];
      }

      throw new Error(`Impossible de récupérer les propriétés: ${error.message}`);
    }
  }

  /**
   * Récupérer une propriété par son ID
   */
  async getPropertyById(propertyId: string): Promise<any | null> {
    try {
      const fetchPublic = async () => {
        const response = await this.ensureClient().get(`/properties/public/${propertyId}`);
        return response.data?.data || response.data;
      };

      const fetchPrivate = async () => {
        logger.warn(`⚠️ [ReccosAPI] ${propertyId} non trouvé en public, tentative endpoint privé`);
        const privResp = await this.ensureClient().get(`/properties/${propertyId}`);
        return privResp.data?.data || privResp.data;
      };

      try {
        return await this.withFallback(fetchPublic);
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw error;
        }

        try {
          return await this.withFallback(fetchPrivate);
        } catch (privErr: any) {
          if (privErr.response?.status === 404) {
            logger.warn(`⚠️ [ReccosAPI] ${propertyId} introuvable même en privé`);
            return null;
          }
          throw privErr;
        }
      }
    } catch (error: any) {
      logger.error(`❌ [ReccosAPI] getPropertyById error: ${error.message}`);

      if (error.response?.status === 404) {
        return null;
      }

      throw new Error(`Impossible de récupérer la propriété: ${error.message}`);
    }
  }

  /**
   * Rechercher des propriétés par texte
   */
  async searchProperties(query: string, limit: number = 10): Promise<any[]> {
    try {
      const client = this.ensureClient();

      const params = new URLSearchParams({
        search: query,
        status: 'published',
        limit: String(limit),
      });

      const response = await client.get(`/properties/public?${params.toString()}`);
      const data = response.data?.data || response.data;

      return data?.properties || data || [];
    } catch (error: any) {
      logger.error(`❌ [ReccosAPI] searchProperties error: ${error.message}`);
      return [];
    }
  }
}

// Instances singleton
export const backendToolsClient = new BackendToolsClient();
export const reccosApiClient = new ReccosApiClient();
