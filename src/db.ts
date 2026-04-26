import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Company, SiteGeneration } from './types.js';

const DB_PATH = path.join(process.cwd(), 'data', 'newtoad.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT UNIQUE,
      url TEXT,
      scraped_at TEXT,
      industry TEXT,
      what_they_sell TEXT,
      company_size TEXT,
      screenshot_path TEXT,
      design_quality_score INTEGER,
      design_last_modified_year INTEGER,
      seo_score INTEGER,
      main_colors TEXT,
      mood TEXT,
      style TEXT,
      copy TEXT,
      screenshot_count INTEGER DEFAULT 0,
      upgraded_webpage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_generations (
      id TEXT PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id),
      color_board TEXT,
      extra_prompt TEXT,
      generation_time_ms INTEGER,
      screenshot_path TEXT,
      mobile_screenshot_path TEXT,
      html_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for columns added after initial schema
  try { db.exec('ALTER TABLE companies ADD COLUMN screenshot_count INTEGER DEFAULT 0'); } catch { /* already exists */ }

  return db;
}

export function upsertCompany(data: Partial<Company>): Company {
  const database = getDb();

  const existing = data.domain
    ? (database.prepare('SELECT * FROM companies WHERE domain = ?').get(data.domain) as Company | undefined)
    : data.name
    ? (database.prepare('SELECT * FROM companies WHERE name = ?').get(data.name) as Company | undefined)
    : undefined;

  if (existing) {
    // Update existing record
    const fields = Object.keys(data)
      .filter(k => k !== 'id' && k !== 'created_at' && data[k as keyof Company] !== undefined)
      .map(k => `${k} = @${k}`)
      .join(', ');

    if (fields) {
      database.prepare(`UPDATE companies SET ${fields} WHERE id = @id`).run({ ...data, id: existing.id });
    }

    return database.prepare('SELECT * FROM companies WHERE id = ?').get(existing.id) as Company;
  } else {
    // Insert new record
    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at' && data[k as keyof Company] !== undefined);
    const cols = keys.join(', ');
    const vals = keys.map(k => `@${k}`).join(', ');

    const result = database.prepare(`INSERT INTO companies (${cols}) VALUES (${vals})`).run(data);
    return database.prepare('SELECT * FROM companies WHERE id = ?').get(result.lastInsertRowid) as Company;
  }
}

export interface GetCompaniesOptions {
  page?: number;
  limit?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  // Filters
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

export function getCompanies(opts: GetCompaniesOptions = {}): { companies: Company[]; total: number } {
  const database = getDb();
  const {
    page = 1,
    limit = 20,
    sort = 'created_at',
    dir = 'desc',
    search,
    industry,
    company_size,
    min_score,
    max_score,
    mood,
    style,
    missing_metadata,
    has_metadata,
    missing_screenshot,
    has_screenshot,
    has_multiple_screenshots,
  } = opts;

  // Whitelist allowed sort columns to prevent SQL injection
  const allowedSortCols = [
    'id', 'name', 'domain', 'scraped_at', 'industry', 'company_size',
    'design_quality_score', 'design_last_modified_year', 'seo_score',
    'screenshot_count', 'upgraded_webpage_count', 'created_at'
  ];
  const safeSort = allowedSortCols.includes(sort) ? sort : 'created_at';
  const safeDir = dir === 'asc' ? 'ASC' : 'DESC';

  // Build WHERE clause from filters
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push('(name LIKE ? OR domain LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (industry) {
    conditions.push('industry LIKE ?');
    params.push(`%${industry}%`);
  }
  if (company_size) {
    conditions.push('company_size = ?');
    params.push(company_size);
  }
  if (min_score !== undefined && !isNaN(min_score)) {
    conditions.push('design_quality_score >= ?');
    params.push(min_score);
  }
  if (max_score !== undefined && !isNaN(max_score)) {
    conditions.push('design_quality_score <= ?');
    params.push(max_score);
  }
  if (mood) {
    conditions.push('mood LIKE ?');
    params.push(`%${mood}%`);
  }
  if (style) {
    conditions.push('style LIKE ?');
    params.push(`%${style}%`);
  }
  if (missing_metadata) {
    conditions.push('(industry IS NULL OR what_they_sell IS NULL)');
  }
  if (has_metadata) {
    conditions.push('(industry IS NOT NULL AND what_they_sell IS NOT NULL)');
  }
  if (missing_screenshot) {
    conditions.push('screenshot_path IS NULL');
  }
  if (has_screenshot) {
    conditions.push('screenshot_path IS NOT NULL');
  }
  if (has_multiple_screenshots) {
    conditions.push('screenshot_count > 1');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const total = (
    database.prepare(`SELECT COUNT(*) as count FROM companies ${where}`).get(...params) as { count: number }
  ).count;
  const companies = database
    .prepare(`SELECT * FROM companies ${where} ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Company[];

  return { companies, total };
}

export function getCompany(id: number): Company | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined;
}

export function saveGeneration(data: SiteGeneration): SiteGeneration {
  const database = getDb();
  database.prepare(`
    INSERT INTO site_generations (id, company_id, color_board, extra_prompt, generation_time_ms, screenshot_path, mobile_screenshot_path, html_path)
    VALUES (@id, @company_id, @color_board, @extra_prompt, @generation_time_ms, @screenshot_path, @mobile_screenshot_path, @html_path)
  `).run(data);

  return database.prepare('SELECT * FROM site_generations WHERE id = ?').get(data.id) as SiteGeneration;
}

export function getGenerations(companyId: number): SiteGeneration[] {
  const database = getDb();
  return database
    .prepare('SELECT * FROM site_generations WHERE company_id = ? ORDER BY created_at DESC')
    .all(companyId) as SiteGeneration[];
}

export function getGenerationsByCompany(companyId: number): SiteGeneration[] {
  return getGenerations(companyId);
}

export function incrementUpgradedCount(companyId: number): void {
  const database = getDb();
  database.prepare('UPDATE companies SET upgraded_webpage_count = upgraded_webpage_count + 1 WHERE id = ?').run(companyId);
}
