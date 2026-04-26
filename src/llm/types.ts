export interface LLMCompleteOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  images?: Buffer[]; // raw PNG/JPEG buffers for vision
}

export interface LLMProvider {
  complete(opts: LLMCompleteOptions): Promise<string>;
}
