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
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface FetchCompaniesParams {
  page?: number;
  limit?: number;
  sort?: SortField;
  dir?: SortDir;
}

export function fetchCompanies(params: FetchCompaniesParams = {}): Promise<CompaniesResponse> {
  const { page = 1, limit = 20, sort = 'seo_score', dir = 'desc' } = params;
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
    dir,
  });
  return get<CompaniesResponse>(`/companies?${qs}`);
}

export function fetchCompany(id: number | string): Promise<Company> {
  return get<Company>(`/companies/${id}`);
}

export function fetchGenerations(companyId: number | string): Promise<SiteGeneration[]> {
  return get<SiteGeneration[]>(`/generations?companyId=${companyId}`);
}

export function triggerGenerate(
  companyId: number | string,
  opts: { extra_prompt?: string; color_board?: string[] },
): Promise<SiteGeneration> {
  return post<SiteGeneration>(`/companies/${companyId}/generate`, opts);
}
