import { requestUrl } from 'obsidian';
import { LLMMessage } from '../types';
import { LLMProvider } from './LLMProvider';

export class OpenAIProvider implements LLMProvider {
  constructor(private apiKey: string, private defaultModel: string) {}

  async chat(messages: LLMMessage[], model?: string): Promise<string> {
    const response = await requestUrl({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model ?? this.defaultModel,
        messages,
      }),
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI API 오류: ${response.status}`);
    }

    return response.json.choices[0].message.content as string;
  }
}
