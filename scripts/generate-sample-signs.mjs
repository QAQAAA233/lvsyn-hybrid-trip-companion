import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightEntry = process.env.PLAYWRIGHT_PATH || require.resolve('playwright');
const { chromium } = require(playwrightEntry);

const SAMPLES_DIR = path.resolve('public/samples');
fs.mkdirSync(SAMPLES_DIR, { recursive: true });

const SIGNS = [
  {
    filename: 'kyoto-teahouse-sign.png',
    html: `
      <html><body style="margin:0;background:#f4efe6;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;width:900px;height:560px;">
        <div style="width:800px;border:4px solid #1f3a2e;background:#fffdf9;border-radius:20px;padding:36px 44px;box-shadow:0 12px 30px rgba(0,0,0,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e5dfd3;padding-bottom:16px;">
            <div>
              <div style="font-size:14px;font-weight:700;letter-spacing:2px;color:#059669;text-transform:uppercase;">Kyoto Heritage Notice</div>
              <div style="font-size:32px;font-weight:800;color:#1c1917;margin-top:4px;">Uji Matcha Pavilion &amp; Garden</div>
            </div>
            <div style="background:#059669;color:#fff;padding:10px 18px;border-radius:12px;font-size:16px;font-weight:700;">STEP-FREE ACCESS</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;font-size:20px;color:#292524;">
            <div style="background:#f8f7f4;padding:18px;border-radius:12px;border:1px solid #e7e5e4;">
              <div style="font-size:13px;font-weight:700;color:#78716c;text-transform:uppercase;">Opening Hours</div>
              <div style="font-weight:800;font-size:26px;margin-top:6px;">09:30 - 17:30</div>
              <div style="font-size:15px;color:#57534e;margin-top:4px;">Last admission 17:00</div>
            </div>
            <div style="background:#fef2f2;padding:18px;border-radius:12px;border:1px solid #fecaca;">
              <div style="font-size:13px;font-weight:700;color:#991b1b;text-transform:uppercase;">Closed Day</div>
              <div style="font-weight:800;font-size:26px;color:#991b1b;margin-top:6px;">Wednesdays</div>
              <div style="font-size:15px;color:#7f1d1d;margin-top:4px;">Open Tuesdays &amp; Weekends</div>
            </div>
          </div>
          <div style="margin-top:22px;padding:16px 20px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;font-size:17px;color:#065f46;font-weight:600;">
            Wheelchair Ramp &amp; Rest Benches: East Gate entrance has 0 stairs and shaded tatami seating inside.
          </div>
        </div>
      </body></html>
    `,
  },
  {
    filename: 'alpine-cablecar-notice.png',
    html: `
      <html><body style="margin:0;background:#e8eff7;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;width:900px;height:560px;">
        <div style="width:800px;border:4px solid #1e3a8a;background:#ffffff;border-radius:20px;padding:36px 44px;box-shadow:0 12px 30px rgba(0,0,0,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #dbeafe;padding-bottom:16px;">
            <div>
              <div style="font-size:14px;font-weight:700;letter-spacing:2px;color:#2563eb;text-transform:uppercase;">Alpine Rail &amp; Cableway Bulletin</div>
              <div style="font-size:32px;font-weight:800;color:#0f172a;margin-top:4px;">Schilthorn - Birg Valley Descent</div>
            </div>
            <div style="background:#d97706;color:#fff;padding:10px 18px;border-radius:12px;font-size:16px;font-weight:700;">WINTER TIMETABLE</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;font-size:20px;color:#1e293b;">
            <div style="background:#eff6ff;padding:18px;border-radius:12px;border:1px solid #bfdbfe;">
              <div style="font-size:13px;font-weight:700;color:#1d4ed8;text-transform:uppercase;">Last Cable Car Down</div>
              <div style="font-weight:800;font-size:28px;margin-top:6px;">16:30 SHARP</div>
              <div style="font-size:15px;color:#334155;margin-top:4px;">Connects to 17:15 Valley Train</div>
            </div>
            <div style="background:#fffbeb;padding:18px;border-radius:12px;border:1px solid #fde68a;">
              <div style="font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;">Platform Alert</div>
              <div style="font-weight:800;font-size:24px;color:#92400e;margin-top:6px;">Tunnel Dead-Zone</div>
              <div style="font-size:15px;color:#78350f;margin-top:4px;">No mobile signal on lower rail link</div>
            </div>
          </div>
          <div style="margin-top:22px;padding:16px 20px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;font-size:17px;color:#334155;font-weight:600;">
            Step-free gondola boarding at Platform 2. Allow 12 minutes transfer buffer before InterCity Express.
          </div>
        </div>
      </body></html>
    `,
  },
];

async function run() {
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox'],
  };
  if (process.env.CHROME_PATH) {
    launchOpts.executablePath = process.env.CHROME_PATH;
  } else {
    launchOpts.channel = 'chrome';
  }
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
    for (const sign of SIGNS) {
      await page.setContent(sign.html);
      await page.screenshot({ path: path.join(SAMPLES_DIR, sign.filename) });
      console.log('Generated:', sign.filename);
    }
  } finally {
    await browser.close();
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
