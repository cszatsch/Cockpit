import path from 'path';
import fs from 'fs';
import { chromium, Browser, Page } from 'playwright';

/**
 * Banc de test navigateur des frontends : Chromium sans interface, bibliothèques de unpkg.com
 * (React, ReactDOM, Babel) servies depuis node_modules (accès Internet non requis).
 */
const NM = path.join(__dirname, '../../node_modules');
const LOCAL: Record<string, string> = {
  'react.production.min.js': path.join(NM, 'react/umd/react.production.min.js'),
  'react-dom.production.min.js': path.join(NM, 'react-dom/umd/react-dom.production.min.js'),
  'babel.min.js': path.join(NM, '@babel/standalone/babel.min.js'),
};

export async function openBrowser(): Promise<Browser> {
  const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
  return chromium.launch({ executablePath: exe });
}

export async function newPage(browser: Browser, opts: { errors?: string[] } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('https://unpkg.com/**', async (route) => {
    const file = Object.entries(LOCAL).find(([k]) => route.request().url().endsWith(k))?.[1];
    if (file) return route.fulfill({ path: file, contentType: 'application/javascript' });
    return route.abort();
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/(open-meteo|gdeltproject)/, (r) => r.abort());
  page.on('pageerror', (e) => opts.errors?.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') opts.errors?.push(m.text());
  });
  return page;
}
