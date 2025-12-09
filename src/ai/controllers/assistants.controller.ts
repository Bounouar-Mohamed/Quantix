/**
 * Controller pour l'API Assistants (threads unifiés)
 */

import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    HttpCode,
    HttpStatus,
    Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AssistantsService } from '../services/assistants.service';

@ApiTags('assistants')
@Controller('assistants')
export class AssistantsController {
    constructor(private readonly assistantsService: AssistantsService) {}

    /**
     * Créer ou récupérer un thread pour une conversation (multi-tenant)
     * POST /api/v1/assistants/thread/upsert
     */
    @Post('thread/upsert')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Créer ou récupérer un thread pour une conversation',
        description: 'Retourne l\'assistant_thread_id associé à un conversationId (multi-tenant)',
    })
    @ApiResponse({ status: 200, description: 'Thread créé/récupéré' })
    async upsertThread(
        @Body() body: { conversationId: string; tenantId?: string; assistantId?: string },
        @Headers('tenant-id') headerTenantId?: string
    ): Promise<{ assistant_thread_id: string }> {
        const tenantId = body.tenantId || headerTenantId;
        const threadId = await this.assistantsService.upsertThread(
            body.conversationId,
            tenantId,
            body.assistantId
        );
        return { assistant_thread_id: threadId };
    }

    /**
     * Ajouter un message au thread (depuis Realtime ou autre source)
     * POST /api/v1/assistants/thread/:threadId/messages
     */
    @Post('thread/:threadId/messages')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Ajouter un message au thread',
        description: 'Journalise un message user/assistant dans le thread pour la cohérence conversationnelle (avec déduplication par eventId)',
    })
    @ApiResponse({ status: 200, description: 'Message ajouté' })
    async addMessage(
        @Param('threadId') threadId: string,
        @Body() body: { role: 'user' | 'assistant'; content: string; eventId?: string; meta?: any }
    ): Promise<{ success: boolean }> {
        await this.assistantsService.addMessage(threadId, body.role, body.content, {
            eventId: body.eventId,
            meta: body.meta,
        });
        return { success: true };
    }

    /**
     * Ajouter un message via conversationId (plus pratique pour Front Realtime)
     * POST /api/v1/assistants/thread/messages
     * Le front n'a besoin que de tenantId + conversationId, pas du threadId
     */
    @Post('thread/messages')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Ajouter un message via conversationId (Front-friendly)',
        description: 'Le front envoie tenantId + conversationId, le serveur résout le threadId automatiquement',
    })
    @ApiResponse({ status: 200, description: 'Message ajouté' })
    async addMessageByConversation(
        @Body() body: { tenantId?: string; conversationId: string; role: 'user' | 'assistant'; content: string; eventId?: string; meta?: any },
        @Headers('tenant-id') headerTenantId?: string
    ): Promise<{ success: boolean; thread_id: string }> {
        const tenantId = body.tenantId || headerTenantId;
        let threadId = await this.assistantsService.getThreadId(body.conversationId, tenantId);
        
        if (!threadId) {
            // Créer le thread s'il n'existe pas
            const assistantId = await this.assistantsService.getOrCreateAssistant();
            threadId = await this.assistantsService.upsertThread(body.conversationId, tenantId, assistantId);
        }
        
        await this.assistantsService.addMessage(threadId, body.role, body.content, {
            eventId: body.eventId,
            meta: body.meta,
        });
        
        return { success: true, thread_id: threadId };
    }

    /**
     * Ajouter un message via conversationId (plus pratique pour Realtime, multi-tenant)
     * POST /api/v1/assistants/thread/conversation/:conversationId/messages
     * @deprecated Préférer POST /assistants/thread/messages (plus simple pour le front)
     */
    @Post('thread/conversation/:conversationId/messages')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Ajouter un message via conversationId',
        description: 'Cherche le thread associé et ajoute le message (multi-tenant)',
    })
    @ApiResponse({ status: 200, description: 'Message ajouté' })
    async addMessageByConversationId(
        @Param('conversationId') conversationId: string,
        @Body() body: { role: 'user' | 'assistant'; content: string; tenantId?: string; eventId?: string; meta?: any },
        @Headers('tenant-id') headerTenantId?: string
    ): Promise<{ success: boolean }> {
        const tenantId = body.tenantId || headerTenantId;
        let threadId = await this.assistantsService.getThreadId(conversationId, tenantId);
        if (!threadId) {
            // Créer le thread s'il n'existe pas
            const assistantId = await this.assistantsService.getOrCreateAssistant();
            threadId = await this.assistantsService.upsertThread(conversationId, tenantId, assistantId);
        }
        await this.assistantsService.addMessage(threadId, body.role, body.content, {
            eventId: body.eventId,
            meta: body.meta,
        });
        return { success: true };
    }

    /**
     * Chat unifié avec threads (multi-tenant)
     * POST /api/v1/assistants/chat
     */
    @Post('chat')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Chat unifié via Assistants API',
        description: 'Utilise threads pour maintenir la cohérence conversationnelle (multi-tenant)',
    })
    @ApiResponse({ status: 200, description: 'Réponse générée' })
    async chat(
        @Body() body: { conversationId: string; userText: string; userId?: string; tenantId?: string },
        @Headers('conversation-id') headerConversationId?: string,
        @Headers('tenant-id') headerTenantId?: string
    ): Promise<{ content: string; thread_id: string }> {
        const conversationId = headerConversationId || body.conversationId;
        const tenantId = body.tenantId || headerTenantId;
        if (!conversationId) {
            throw new Error('conversationId requis');
        }

        // Upsert thread
        const assistantId = await this.assistantsService.getOrCreateAssistant();
        const threadId = await this.assistantsService.upsertThread(conversationId, tenantId, assistantId);

        // Ajouter message user (comme ChatGPT : toujours écrire dans le thread)
        await this.assistantsService.addMessage(threadId, 'user', body.userText);

        // Run et poll (le run ajoute automatiquement la réponse assistant au thread)
        const answer = await this.assistantsService.runAndPoll(
            threadId,
            assistantId,
            body.userId
        );

        // Le message assistant est déjà dans le thread via runAndPoll
        return {
            content: answer,
            thread_id: threadId,
        };
    }

    /**
     * Récupérer le thread_id depuis conversationId (multi-tenant)
     * GET /api/v1/assistants/thread/conversation/:conversationId
     */
    @Get('thread/conversation/:conversationId')
    @ApiOperation({
        summary: 'Récupérer le thread_id d\'une conversation',
    })
    @ApiResponse({ status: 200, description: 'Thread trouvé' })
    async getThreadId(
        @Param('conversationId') conversationId: string,
        @Headers('tenant-id') headerTenantId?: string,
        @Body() body?: { tenantId?: string }
    ): Promise<{ assistant_thread_id: string | null }> {
        const tenantId = body?.tenantId || headerTenantId;
        const threadId = await this.assistantsService.getThreadId(conversationId, tenantId);
        return { assistant_thread_id: threadId };
    }
}

