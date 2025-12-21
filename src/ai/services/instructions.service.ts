import { Injectable } from '@nestjs/common';
import { getProfile } from '../modelProfile';
import type { PromptMode } from '../prompts/noor.prompt';

export type InstructionMode = PromptMode | 'chat' | 'realtime';

export interface InstructionResponse {
  profile: string;
  mode: InstructionMode;
  instructions: string;
}

@Injectable()
export class InstructionsService {
  getInstructions(profileName?: string, mode: InstructionMode = 'chat'): InstructionResponse {
    const profile = getProfile(profileName);
    const normalizedMode: InstructionMode = mode === 'realtime' ? 'realtime' : 'chat';
    const instructions =
      normalizedMode === 'realtime' && profile.realtimeInstructions
        ? profile.realtimeInstructions
        : profile.instructions;

    return {
      profile: profileName || profile.id,
      mode: normalizedMode,
      instructions,
    };
  }
}




