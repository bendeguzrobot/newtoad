export interface LLMCompleteOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface LLMProvider {
  complete(opts: LLMCompleteOptions): Promise<string>;
}
