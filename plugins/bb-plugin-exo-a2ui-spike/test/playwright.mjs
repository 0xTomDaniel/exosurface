// Playwright for the live verification scripts: PLAYWRIGHT_MODULE, else "playwright" in the
// local config (see src/local-config.ts), else the installed "playwright" package.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const file = process.env.EXO_CONFIG ?? join(homedir(), '.config', 'exo', 'exosurface.json');
const configured = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).playwright : undefined;
const spec = process.env.PLAYWRIGHT_MODULE ?? configured ?? 'playwright';
export const { chromium } = await import(spec.startsWith('~/') ? join(homedir(), spec.slice(2)) : spec);
