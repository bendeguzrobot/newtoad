import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the Python script, resolved relative to this file
const PYTHON_SCRIPT = path.join(__dirname, 'extract-colors.py');

/**
 * Extract dominant colors from a screenshot using pixel-based KMeans clustering.
 *
 * @param screenshotPath Absolute path to screenshot.png
 * @param nColors Number of dominant colors to extract (default 10)
 * @returns Array of hex color strings sorted by frequency (most prominent first),
 *          or null if extraction fails (so callers can fall back gracefully)
 */
export async function extractColors(
  screenshotPath: string,
  nColors = 10
): Promise<string[] | null> {
  if (!fs.existsSync(screenshotPath)) {
    return null;
  }

  if (!fs.existsSync(PYTHON_SCRIPT)) {
    console.warn(`[extract-colors] Python script not found at ${PYTHON_SCRIPT}`);
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      'python3',
      [PYTHON_SCRIPT, screenshotPath, '--n-colors', String(nColors)],
      { timeout: 60_000 }
    );

    const colors = JSON.parse(stdout.trim()) as string[];
    if (!Array.isArray(colors)) return null;
    return colors;
  } catch (err) {
    console.warn(
      `[extract-colors] Failed for ${screenshotPath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
