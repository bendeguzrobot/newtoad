import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getCompanies, getCompany, getGenerations, getGenerationsByCompany } from '../db.js';
import { generateWebsite } from '../generate/worker.js';
import { rescrapeCompany } from '../scraper/rescrape.js';
import type { GalleryManifest } from '../types.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());
app.use('/data', express.static(path.join(process.cwd(), 'data')));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Companies ────────────────────────────────────────────────────────────────

/**
 * GET /api/companies
 * Query params: page, limit, sort, dir, industry, company_size, min_score, max_score, mood, style
 */
app.get('/api/companies', (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const sort = (req.query.sort as string) || 'created_at';
    const dir = ((req.query.dir as string) || 'desc') as 'asc' | 'desc';

    if (isNaN(page) || page < 1) {
      res.status(400).json({ error: 'Invalid page parameter' });
      return;
    }
    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: 'Invalid limit parameter (1-100)' });
      return;
    }
    if (!['asc', 'desc'].includes(dir)) {
      res.status(400).json({ error: 'Invalid dir parameter (asc|desc)' });
      return;
    }

    // Optional filters
    const search = (req.query.search as string) || undefined;
    const industry = (req.query.industry as string) || undefined;
    const company_size = (req.query.company_size as string) || undefined;
    const min_score = req.query.min_score !== undefined ? parseInt(req.query.min_score as string, 10) : undefined;
    const max_score = req.query.max_score !== undefined ? parseInt(req.query.max_score as string, 10) : undefined;
    const mood = (req.query.mood as string) || undefined;
    const style = (req.query.style as string) || undefined;
    const missing_metadata = req.query.missing_metadata === 'true';
    const has_metadata = req.query.has_metadata === 'true';
    const missing_screenshot = req.query.missing_screenshot === 'true';
    const has_screenshot = req.query.has_screenshot === 'true';
    const has_multiple_screenshots = req.query.has_multiple_screenshots === 'true';

    const { companies, total } = getCompanies({ page, limit, sort, dir, search, industry, company_size, min_score, max_score, mood, style, missing_metadata, has_metadata, missing_screenshot, has_screenshot, has_multiple_screenshots });

    res.json({ companies, total, page, limit });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/companies/:id
 */
app.get('/api/companies/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid company id' });
      return;
    }

    const company = getCompany(id);
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Parse main_colors JSON if present and return enriched object
    const companyOut: Record<string, unknown> = { ...company };
    if (typeof company.main_colors === 'string') {
      try {
        companyOut.main_colors = JSON.parse(company.main_colors);
      } catch {
        // leave as string if parse fails
      }
    }

    res.json(companyOut);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/companies/:id/gallery
 * Returns the gallery.json for a company's crawled site.
 * Falls back to { screenshots: [] } if the file is missing.
 */
app.get('/api/companies/:id/gallery', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid company id' });
      return;
    }

    const company = getCompany(id);
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    if (!company.domain) {
      res.json({ screenshots: [] } satisfies GalleryManifest);
      return;
    }

    // Sanitize domain the same way the crawler does
    const safeDomain = company.domain.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/^\.+|\.+$/g, '');
    const galleryFile = path.join(process.cwd(), 'data', 'websites', safeDomain, 'gallery.json');

    if (!fs.existsSync(galleryFile)) {
      res.json({ screenshots: [] } satisfies GalleryManifest);
      return;
    }

    const raw = fs.readFileSync(galleryFile, 'utf-8');
    const gallery = JSON.parse(raw) as GalleryManifest;
    res.json(gallery);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/companies/:id/rescrape
 */
app.post('/api/companies/:id/rescrape', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid company id' });
      return;
    }

    const updated = await rescrapeCompany(id);
    
    // Parse main_colors JSON if present and return enriched object
    const companyOut: Record<string, unknown> = { ...updated };
    if (typeof updated.main_colors === 'string') {
      try {
        companyOut.main_colors = JSON.parse(updated.main_colors);
      } catch {
        // leave as string if parse fails
      }
    }

    res.json(companyOut);
  } catch (err) {
    next(err);
  }
});

// ─── Site Generation (stub) ────────────────────────────────────────────────────

/**
 * POST /api/companies/:id/generate
 * Body: { extra_prompt?: string; color_board?: string[] }
 */
app.post('/api/companies/:id/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid company id' });
      return;
    }

    const company = getCompany(id);
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const { extra_prompt, color_board, language, language_code } = req.body as {
      extra_prompt?: string; color_board?: string[]; language?: string; language_code?: string;
    };

    const gen = await generateWebsite(company, { extra_prompt, color_board, language, language_code });
    // Worker returns absolute paths for CLI; normalize to data-relative for API
    const dataDir = path.join(process.cwd(), 'data');
    res.json({
      ...gen,
      html_path: gen.html_path ? path.relative(dataDir, gen.html_path) : null,
      screenshot_path: gen.screenshot_path ? path.relative(dataDir, gen.screenshot_path) : null,
      mobile_screenshot_path: gen.mobile_screenshot_path ? path.relative(dataDir, gen.mobile_screenshot_path) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/companies/:id/generations
 */
app.get('/api/companies/:id/generations', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid company id' });
      return;
    }

    const generations = getGenerationsByCompany(id);
    res.json({ data: generations });
  } catch (err) {
    next(err);
  }
});

// ─── Generations ───────────────────────────────────────────────────────────────

/**
 * GET /api/generations?companyId=:id
 */
app.get('/api/generations', (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = parseInt((req.query.companyId as string) || '', 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: 'Missing or invalid companyId query parameter' });
      return;
    }

    const generations = getGenerations(companyId);
    res.json({ data: generations });
  } catch (err) {
    next(err);
  }
});

// ─── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nNewToad API running on http://localhost:${PORT}`);
  console.log(`  GET /health`);
  console.log(`  GET /api/companies`);
  console.log(`  GET /api/companies/:id`);
  console.log(`  GET /api/companies/:id/gallery`);
  console.log(`  POST /api/companies/:id/generate`);
  console.log(`  GET  /api/companies/:id/generations`);
  console.log(`  GET  /api/generations?companyId=:id\n`);
});

export default app;
