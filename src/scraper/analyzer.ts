import Anthropic from '@anthropic-ai/sdk';
import type { CrawlResult, AnalysisResult } from '../types.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert web analyst specializing in Korean business websites.
Your job is to analyze website content and extract structured information about the company and its web presence.

You will be given:
- Page title
- Meta description
- Visible text content (truncated)
- HTML head section

You must respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.
The JSON must contain exactly these fields:
{
  "industry": "string describing the industry sector in English",
  "what_they_sell": "string describing products or services in English",
  "company_size": "small|medium|large|unknown",
  "design_quality_score": integer 0-100,
  "design_last_modified_year": integer between 2010 and 2025,
  "seo_score": integer 0-100,
  "main_colors": ["#hex1", "#hex2", "#hex3"],
  "mood": "string describing overall mood (e.g. 'professional', 'playful', 'minimal', 'traditional')",
  "style": "string describing design style (e.g. 'corporate', 'modern', 'traditional', 'e-commerce')",
  "copy": "string with the key marketing copy or tagline from the page"
}

For design_quality_score: 0=terrible, 50=average, 80=good, 100=excellent
For seo_score: 0=terrible (no meta, no h1), 50=average, 80=good (has meta, structured headings), 100=excellent
For main_colors: extract 3 dominant colors from CSS or meta og:image context if available, otherwise provide educated guesses based on industry
For design_last_modified_year: estimate based on design patterns, CSS frameworks mentioned, and content references
For company_size: small (<50 employees or local business), medium (50-500 employees), large (>500 employees or national/global brand)`;

/**
 * Analyze a crawled website using Claude to extract structured business and design information.
 * Uses prompt caching on the system prompt to reduce costs for repeated analyses.
 */
export async function analyzeWebsite(crawlResult: CrawlResult): Promise<AnalysisResult> {
  const { title, metaDescription, visibleText, htmlHead } = crawlResult;

  const userContent = `Please analyze this Korean company website:

## Page Title
${title || '(no title)'}

## Meta Description
${metaDescription || '(no meta description)'}

## HTML Head Section (first 3000 chars)
${htmlHead || '(not available)'}

## Visible Text Content (first 5000 chars)
${visibleText || '(no visible text extracted)'}

Respond with ONLY the JSON object as described in your instructions.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  // Extract text from response
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let rawText = textBlock.text.trim();

  // Strip markdown code fences if present
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${rawText.slice(0, 200)}`);
  }

  // Validate and normalize the parsed result
  const obj = parsed as Record<string, unknown>;

  const result: AnalysisResult = {
    industry: typeof obj.industry === 'string' ? obj.industry : 'unknown',
    what_they_sell: typeof obj.what_they_sell === 'string' ? obj.what_they_sell : 'unknown',
    company_size: (['small', 'medium', 'large', 'unknown'] as const).includes(obj.company_size as 'small' | 'medium' | 'large' | 'unknown')
      ? (obj.company_size as 'small' | 'medium' | 'large' | 'unknown')
      : 'unknown',
    design_quality_score: typeof obj.design_quality_score === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.design_quality_score)))
      : 50,
    design_last_modified_year: typeof obj.design_last_modified_year === 'number'
      ? Math.max(2010, Math.min(2025, Math.round(obj.design_last_modified_year)))
      : 2020,
    seo_score: typeof obj.seo_score === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.seo_score)))
      : 50,
    main_colors: Array.isArray(obj.main_colors)
      ? (obj.main_colors as unknown[]).filter(c => typeof c === 'string').slice(0, 5) as string[]
      : ['#000000', '#ffffff', '#888888'],
    mood: typeof obj.mood === 'string' ? obj.mood : 'professional',
    style: typeof obj.style === 'string' ? obj.style : 'corporate',
    copy: typeof obj.copy === 'string' ? obj.copy : '',
  };

  return result;
}
