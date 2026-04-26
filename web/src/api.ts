import type { Company, CompaniesResponse, SiteGeneration, SortDir, SortField } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${res.status}: ${res.statusText}`;
    try {
      const data = await res.json() as { message?: string; error?: string };
      if (data.message) message = data.message;
      else if (data.error) message = data.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface FetchCompaniesParams {
  page?: number;
  limit?: number;
  sort?: SortField;
  dir?: SortDir;
  search?: string;
  industry?: string;
  company_size?: string;
  min_score?: number;
  max_score?: number;
  mood?: string;
  style?: string;
  missing_metadata?: boolean;
  has_metadata?: boolean;
  missing_screenshot?: boolean;
  has_screenshot?: boolean;
  has_multiple_screenshots?: boolean;
}

export function fetchCompanies(params: FetchCompaniesParams = {}): Promise<CompaniesResponse> {
  const { page = 1, limit = 20, sort = 'seo_score', dir = 'desc', search, industry, company_size, min_score, max_score, mood, style, missing_metadata, has_metadata, missing_screenshot, has_screenshot, has_multiple_screenshots } = params;
  const qs = new URLSearchParams({ page: String(page), limit: String(limit), sort, dir });
  if (search) qs.set('search', search);
  if (industry) qs.set('industry', industry);
  if (company_size) qs.set('company_size', company_size);
  if (min_score !== undefined) qs.set('min_score', String(min_score));
  if (max_score !== undefined) qs.set('max_score', String(max_score));
  if (mood) qs.set('mood', mood);
  if (style) qs.set('style', style);
  if (missing_metadata) qs.set('missing_metadata', 'true');
  if (has_metadata) qs.set('has_metadata', 'true');
  if (missing_screenshot) qs.set('missing_screenshot', 'true');
  if (has_screenshot) qs.set('has_screenshot', 'true');
  if (has_multiple_screenshots) qs.set('has_multiple_screenshots', 'true');
  return get<CompaniesResponse>(`/companies?${qs}`);
}

export function fetchGallery(companyId: number | string): Promise<import('./types').GalleryManifest> {
  return get(`/companies/${companyId}/gallery`);
}

export function fetchCompany(id: number | string): Promise<Company> {
  return get<Company>(`/companies/${id}`);
}

export function fetchGenerations(companyId: number | string): Promise<SiteGeneration[]> {
  return get<{ data: SiteGeneration[] }>(`/generations?companyId=${companyId}`)
    .then((res) => res.data);
}

export function triggerGenerate(
  companyId: number | string,
  opts: { extra_prompt?: string; color_board?: string[]; language?: string; language_code?: string },
): Promise<SiteGeneration> {
  return post<SiteGeneration>(`/companies/${companyId}/generate`, opts);
}

export function triggerRescrape(companyId: number | string): Promise<Company> {
  return post<Company>(`/companies/${companyId}/rescrape`, {});
}
