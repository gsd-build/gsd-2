import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const out = '/Users/jeremymcspadden/Github/gsd-2/docs/pr-876';

const shots: Array<{ url: string; file: string; fullPage?: boolean }> = [
  { url: 'file:///tmp/gsd-sample-report/index.html',               file: `${out}/01-index.png`,      fullPage: true },
  { url: 'file:///tmp/gsd-sample-report/M002-report.html',         file: `${out}/02-summary.png` },
  { url: 'file:///tmp/gsd-sample-report/M002-report.html#progress',file: `${out}/03-progress.png` },
  { url: 'file:///tmp/gsd-sample-report/M002-report.html#depgraph',file: `${out}/04-depgraph.png` },
  { url: 'file:///tmp/gsd-sample-report/M002-report.html#metrics', file: `${out}/05-metrics.png` },
  { url: 'file:///tmp/gsd-sample-report/M002-report.html#changelog',file: `${out}/06-changelog.png` },
  { url: 'file:///tmp/gsd-sample-report/M002-report.html#knowledge',file: `${out}/07-knowledge.png` },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const s of shots) {
    await page.goto(s.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const buf = await page.screenshot({ fullPage: s.fullPage ?? false });
    writeFileSync(s.file, buf);
    console.log('wrote', s.file);
  }

  await browser.close();
})();
