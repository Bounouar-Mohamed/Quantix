/**
 * Service pour gérer les connexions MCP (Model Context Protocol)
 * PRÉPARATION FUTURE : Sera utilisé quand MCP sera disponible
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MCPConnection {
    id: string;
    name: string;
    type: 'database' | 'api' | 'file' | 'custom';
    endpoint?: string;
    config?: Record<string, any>;
}

@Injectable()
export class MCPService {
    private readonly logger = new Logger(MCPService.name);
    private connections: Map<string, MCPConnection> = new Map();

    constructor(private readonly configService: ConfigService) {
        this.initializeConnections();
    }

    /**
     * Initialiser les connexions MCP depuis la config
     */
    private initializeConnections() {
        const mcpEnabled = this.configService.get<string>('MCP_ENABLED') === 'true';
        
        if (!mcpEnabled) {
            this.logger.log('⚠️ MCP désactivé (MCP_ENABLED=false)');
            return;
        }

        const connectionsStr = this.configService.get<string>('MCP_CONNECTIONS', '');
        if (!connectionsStr) {
            this.logger.log('⚠️ MCP activé mais aucune connexion configurée');
            return;
        }

        const connectionIds = connectionsStr.split(',').map(s => s.trim());
        
        // TODO: Charger les connexions depuis DB ou config
        connectionIds.forEach(id => {
            // Placeholder pour connexions futures
            this.connections.set(id, {
                id,
                name: `MCP Connection ${id}`,
                type: 'custom',
            });
        });

        this.logger.log(`✅ ${this.connections.size} connexions MCP initialisées`);
    }

    /**
     * Obtenir les connexions MCP configurées pour un assistant
     */
    getConnectionsForAssistant(assistantId?: string): string[] {
        // Pour l'instant, retourne toutes les connexions
        // Plus tard: filtrer par assistant ou permissions
        return Array.from(this.connections.keys());
    }

    /**
     * Vérifier si une connexion MCP existe
     */
    hasConnection(connectionId: string): boolean {
        return this.connections.has(connectionId);
    }

    /**
     * Obtenir les détails d'une connexion
     */
    getConnection(connectionId: string): MCPConnection | undefined {
        return this.connections.get(connectionId);
    }

    /**
     * Ajouter une connexion MCP dynamiquement (futur)
     */
    async addConnection(connection: MCPConnection): Promise<void> {
        this.connections.set(connection.id, connection);
        this.logger.log(`✅ Connexion MCP ajoutée: ${connection.id} (${connection.type})`);
    }

    /**
     * Vérifier si MCP est activé
     */
    isEnabled(): boolean {
        return this.configService.get<string>('MCP_ENABLED') === 'true';
    }
}



