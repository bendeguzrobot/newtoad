export interface Company {
  id: number;
  name: string;
  domain: string | null;
  url: string | null;
  scraped_at: string | null;
  industry: string | null;
  what_they_sell: string | null;
  company_size: string | null;
  screenshot_path: string | null;
  design_quality_score: number | null;
  design_last_modified_year: number | null;
  seo_score: number | null;
  main_colors: string | null; // JSON string of hex array
  mood: string | null;
  style: string | null;
  copy: string | null;
  upgraded_webpage_count: number;
  created_at: string;
}

export interface CompaniesResponse {
  companies: Company[];
  total: number;
  page: number;
  limit: number;
}

export interface SiteGeneration {
  id: number;
  companyId: number;
  created_at: string;
  [key: string]: unknown;
}

export type SortField = 'seo_score' | 'design_quality_score' | 'design_last_modified_year' | 'name';
export type SortDir = 'asc' | 'desc';
