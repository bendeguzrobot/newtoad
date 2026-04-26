import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getCompanies, getCompany, getGenerations } from '../db.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Companies ────────────────────────────────────────────────────────────────

/**
 * GET /api/companies
 * Query params: page, limit, sort, dir
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

    const { companies, total } = getCompanies({ page, limit, sort, dir });

    res.json({
      data: companies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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

// ─── Site Generation (stub) ────────────────────────────────────────────────────

/**
 * POST /api/companies/:id/generate
 * Stub endpoint — the generation worker is not yet implemented.
 */
app.post('/api/companies/:id/generate', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid company id' });
    return;
  }

  res.status(501).json({
    error: 'Not implemented',
    message: 'The site generation feature is coming soon.',
    companyId: id,
  });
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
  console.log(`  POST /api/companies/:id/generate (stub)`);
  console.log(`  GET /api/generations?companyId=:id\n`);
});

export default app;
