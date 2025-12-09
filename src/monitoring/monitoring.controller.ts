import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques globales',
    description: 'Récupère les statistiques globales du microservice',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques globales',
  })
  getGlobalStats() {
    return this.monitoringService.getGlobalStats();
  }

  @Get('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques d un utilisateur',
    description: 'Récupère les statistiques d un utilisateur spécifique',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques utilisateur',
  })
  getUserStats(@Query('userId') userId: string) {
    return this.monitoringService.getUserStats(userId);
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liste des utilisateurs actifs',
    description: 'Récupère la liste des utilisateurs avec leurs statistiques',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs',
  })
  getActiveUsers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.monitoringService.getActiveUsers(limitNum);
  }

  @Get('endpoint/:endpoint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques d un endpoint',
    description: 'Récupère les statistiques d un endpoint spécifique',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques endpoint',
  })
  getEndpointStats(@Query('endpoint') endpoint: string) {
    return this.monitoringService.getEndpointStats(endpoint);
  }
}


