export interface Company {
  id?: number;
  name: string;
  domain?: string | null;
  url?: string | null;
  scraped_at?: string | null;
  industry?: string | null;
  what_they_sell?: string | null;
  company_size?: string | null;
  screenshot_path?: string | null;
  design_quality_score?: number | null;
  design_last_modified_year?: number | null;
  seo_score?: number | null;
  main_colors?: string | null; // JSON array of hex strings
  mood?: string | null;
  style?: string | null;
  copy?: string | null;
  screenshot_count?: number | null;
  upgraded_webpage_count?: number;
  created_at?: string;
}

export interface SiteGeneration {
  id: string;
  company_id: number;
  color_board?: string | null;
  extra_prompt?: string | null;
  generation_time_ms?: number | null;
  screenshot_path?: string | null;
  mobile_screenshot_path?: string | null;
  html_path?: string | null;
  created_at?: string;
}

export interface GalleryEntry {
  file: string;
  label: string;
}

export interface GalleryManifest {
  screenshots: GalleryEntry[];
}

export interface CrawlResult {
  url: string;
  domain: string;
  title: string;
  metaDescription: string;
  h1Texts: string[];
  h2Texts: string[];
  visibleText: string;
  imageSrcs: string[];
  htmlHead: string;
  screenshotPath: string;
  mobileScreenshotPath: string;
  htmlPath: string;
  metadataPath: string;
  galleryPath: string;
}

export interface AnalysisResult {
  industry: string;
  what_they_sell: string;
  company_size: 'small' | 'medium' | 'large' | 'unknown';
  design_quality_score: number;
  design_last_modified_year: number;
  seo_score: number;
  main_colors: string[];
  mood: string;
  style: string;
  copy: string;
}
