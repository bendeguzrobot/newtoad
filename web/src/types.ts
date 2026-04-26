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
  screenshot_count: number | null;
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
  id: string; // uuid
  company_id: number;
  color_board: string | null;
  extra_prompt: string | null;
  generation_time_ms: number | null;
  screenshot_path: string | null;
  mobile_screenshot_path: string | null;
  html_path: string | null;
  created_at: string;
}

export type SortField = 'seo_score' | 'design_quality_score' | 'design_last_modified_year' | 'name' | 'scraped_at' | 'screenshot_count';
export type SortDir = 'asc' | 'desc';

export interface GalleryEntry {
  file: string;
  label: string;
}

export interface GalleryManifest {
  screenshots: GalleryEntry[];
}
