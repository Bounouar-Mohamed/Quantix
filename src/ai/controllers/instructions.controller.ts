import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InstructionsService } from '../services/instructions.service';
import type { InstructionMode } from '../services/instructions.service';

@ApiTags('ai')
@Controller('ai/instructions')
export class InstructionsController {
  constructor(private readonly instructionsService: InstructionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Retrieve the system instructions for a profile',
    description: 'Returns the English prompt that must be sent to the LLM (chat or realtime).',
  })
  @ApiQuery({ name: 'profile', required: false, description: 'Profile name (noor, john, ...)' })
  @ApiQuery({ name: 'mode', required: false, enum: ['chat', 'realtime'], description: 'Prompt mode' })
  getInstructions(
    @Query('profile') profile?: string,
    @Query('mode') mode?: InstructionMode,
  ) {
    return this.instructionsService.getInstructions(profile, mode);
  }
}




