import { LLMMessage } from '../types';

export interface LLMProvider {
  chat(messages: LLMMessage[], model?: string): Promise<string>;
}
