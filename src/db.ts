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
}

export function getCompanies(opts: GetCompaniesOptions = {}): { companies: Company[]; total: number } {
  const database = getDb();
  const { page = 1, limit = 20, sort = 'created_at', dir = 'desc' } = opts;

  // Whitelist allowed sort columns to prevent SQL injection
  const allowedSortCols = [
    'id', 'name', 'domain', 'scraped_at', 'industry', 'company_size',
    'design_quality_score', 'design_last_modified_year', 'seo_score',
    'upgraded_webpage_count', 'created_at'
  ];
  const safeSort = allowedSortCols.includes(sort) ? sort : 'created_at';
  const safeDir = dir === 'asc' ? 'ASC' : 'DESC';

  const offset = (page - 1) * limit;
  const total = (database.prepare('SELECT COUNT(*) as count FROM companies').get() as { count: number }).count;
  const companies = database
    .prepare(`SELECT * FROM companies ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`)
    .all(limit, offset) as Company[];

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
