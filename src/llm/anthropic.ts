import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMCompleteOptions } from './types.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const anthropicProvider: LLMProvider = {
  async complete({ system, prompt, maxTokens = 4096 }: LLMCompleteOptions): Promise<string> {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content.find(b => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('No text in Anthropic response');
    return block.text;
  },
};
