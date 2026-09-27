import { openBrowser, newPage } from './harness';
(async () => {
  const b = await openBrowser();
  const errors: string[] = [];
  const p = await newPage(b, { errors });
  await p.goto(process.argv[2], { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: process.argv[3] });
  console.log('title', await p.title(), 'errors', errors.slice(0, 5));
  const txt = await p.evaluate(() => document.body.innerText.slice(0, 400));
  console.log(txt.replace(/\n+/g, ' | '));
  await b.close();
})();
