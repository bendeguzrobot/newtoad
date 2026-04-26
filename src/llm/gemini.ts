// Gemini provider — swap in src/llm/index.ts to activate
//
// import { GoogleGenAI } from '@google/genai';
// import type { LLMProvider, LLMCompleteOptions } from './types.js';
//
// const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
//
// export const geminiProvider: LLMProvider = {
//   async complete({ system, prompt, maxTokens = 4096 }: LLMCompleteOptions): Promise<string> {
//     const response = await client.models.generateContent({
//       model: 'gemini-2.5-flash',
//       config: { systemInstruction: system },
//       contents: prompt,
//     });
//     return (response.text ?? '').trim();
//   },
// };
