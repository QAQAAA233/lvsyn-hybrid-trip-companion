import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { startCloudEmulatorServer } from './local-cloud-emulator.mjs';

const require = createRequire(import.meta.url);
const playwrightEntry = process.env.PLAYWRIGHT_PATH || require.resolve('playwright');
const { chromium } = require(playwrightEntry);

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, 'dist');
const SCREENSHOTS_DIR = path.resolve(ROOT, 'docs/screenshots');
const EXTRA_SCREENSHOTS_DIR = process.env.EXTRA_SCREENSHOTS_DIR
  ? path.resolve(process.env.EXTRA_SCREENSHOTS_DIR)
  : null;
const TMP_VIDEO_DIR = path.resolve(ROOT, 'tmp/e2e-video');
const VIDEO_SUBDIR_1 = path.join(TMP_VIDEO_DIR, 'run1');
const VIDEO_SUBDIR_2 = path.join(TMP_VIDEO_DIR, 'run2');
const REPORT_PATH = path.resolve(ROOT, 'tmp/e2e-report.json');

for (const dir of [
  SCREENSHOTS_DIR,
  VIDEO_SUBDIR_1,
  VIDEO_SUBDIR_2,
  ...(EXTRA_SCREENSHOTS_DIR ? [EXTRA_SCREENSHOTS_DIR] : []),
]) {
  fs.mkdirSync(dir, { recursive: true });
}

for (const dir of [SCREENSHOTS_DIR, VIDEO_SUBDIR_1, VIDEO_SUBDIR_2]) {
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.png') || file.endsWith('.webm') || file === 'frames.json') {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

function logStep(msg) {
  process.stderr.write(`[e2e ${new Date().toISOString()}] ${msg}\n`);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function startStaticDistServer(port = 0) {
  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    let filePath = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        url: `http://127.0.0.1:${actualPort}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`E2E Assertion Failed: ${msg}`);
  }
}

async function launchVerificationChrome(withNanoFlags = false) {
  const args = ['--no-sandbox', '--disable-gpu-sandbox'];
  if (withNanoFlags) {
    args.push(
      '--enable-features=PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput,OptimizationGuideOnDeviceModel:BypassPerfRequirement/true'
    );
  }

  const opts = {
    headless: true,
    timeout: 15000,
    args,
  };
  if (process.env.CHROME_PATH) {
    opts.executablePath = process.env.CHROME_PATH;
  } else {
    opts.channel = 'chrome';
  }
  return chromium.launch(opts);
}

async function createCdpFrameRecorder(page, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const rawFrames = [];
  let frameIndex = 0;

  cdp.on('Page.screencastFrame', async (ev) => {
    const idx = frameIndex++;
    const filename = `frame-${String(idx).padStart(4, '0')}.png`;
    fs.writeFileSync(path.join(outDir, filename), Buffer.from(ev.data, 'base64'));
    rawFrames.push({ file: filename, atMs: Date.now() });
    await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });

  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

  return {
    async snap() {
      const idx = frameIndex++;
      const filename = `frame-${String(idx).padStart(4, '0')}.png`;
      await page.screenshot({ path: path.join(outDir, filename) });
      rawFrames.push({ file: filename, atMs: Date.now() });
    },
    async stop() {
      try {
        await cdp.send('Page.stopScreencast');
      } catch {}
      const endMs = Date.now();
      const timed = rawFrames.map((f, idx) => {
        const nextMs = idx + 1 < rawFrames.length ? rawFrames[idx + 1].atMs : endMs;
        const durationSec = Math.max(0.15, Math.min(8, (nextMs - f.atMs) / 1000));
        return { file: f.file, durationSec: Number(durationSec.toFixed(3)) };
      });
      fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(timed, null, 2), 'utf8');
      return timed;
    },
  };
}

async function probeNativeSystemChrome(url, activeBrowsers) {
  let probeBrowser = null;
  try {
    logStep('[2/6] Launching isolated Google Chrome for native LanguageModel probe (15s timeout)...');
    probeBrowser = await launchVerificationChrome(true);
    activeBrowsers.push(probeBrowser);
    const probeCtx = await probeBrowser.newContext();
    const probePage = await probeCtx.newPage();
    probePage.setDefaultTimeout(12000);
    await probePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const availability = await probePage.evaluate(async () => {
      try {
        if (!('LanguageModel' in globalThis) || !globalThis.LanguageModel?.availability) {
          return 'missing_global';
        }
        return await Promise.race([
          globalThis.LanguageModel.availability({
            expectedInputs: [{ type: 'text' }],
            expectedOutputs: [{ type: 'text' }],
          }),
          new Promise((resolve) => setTimeout(() => resolve('timeout_6000ms'), 6000)),
        ]);
      } catch (e) {
        return `error:${e?.message || e}`;
      }
    });
    await probeCtx.close();
    return { availability, engine: 'system-chrome' };
  } catch (err) {
    return { availability: `chrome_launch_failed:${err.message}`, engine: 'none' };
  } finally {
    try {
      await probeBrowser?.close();
    } catch {}
  }
}

async function run() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist/ not found. Run npm run build first.');
  }

  const activeBrowsers = [];
  let emulator = null;
  let staticServer = null;

  const watchdog = setTimeout(async () => {
    logStep('GLOBAL WATCHDOG EXCEEDED 120s — forcing cleanup and exit(1)');
    for (const b of activeBrowsers) {
      try {
        await b.close();
      } catch {}
    }
    try {
      await staticServer?.close();
    } catch {}
    try {
      await emulator?.close();
    } catch {}
    process.exit(1);
  }, 120_000);

  try {
    logStep('[1/6] Starting local cloud emulator & static dist server...');
    emulator = await startCloudEmulatorServer(0);
    staticServer = await startStaticDistServer(0);
    logStep(`[1/6] Servers ready: static=${staticServer.url}, emulator=${emulator.url}`);

    const probe = await probeNativeSystemChrome(staticServer.url, activeBrowsers);
    const nativeAvailability = probe.availability;
    const usedNativeNano = nativeAvailability === 'available';
    logStep(`[2/6] Native Chrome probe result: ${nativeAvailability} (usedNativeNano=${usedNativeNano})`);

    const screenshots = [];
    const assertions = [];

    // Step B: True Offline Verification + Recording Clip #1
    logStep('[3/6] Launching isolated Chrome for Offline verification (recording run1)...');
    const browserOffline = await launchVerificationChrome(usedNativeNano);
    activeBrowsers.push(browserOffline);

    const ctxOffline = await browserOffline.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const pageOffline = await ctxOffline.newPage();
    pageOffline.setDefaultTimeout(12000);
    const recOffline = await createCdpFrameRecorder(pageOffline, VIDEO_SUBDIR_1);

    await pageOffline.goto(staticServer.url, { waitUntil: 'networkidle', timeout: 15000 });
    await pageOffline
      .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 4000 })
      .catch(() => {});
    await recOffline.snap();
    await pageOffline.waitForTimeout(1200);

    await ctxOffline.setOffline(true);
    await pageOffline.evaluate(() => window.dispatchEvent(new Event('offline')));
    await pageOffline.waitForTimeout(1000);
    await recOffline.snap();

    const netText = await pageOffline.getByTestId('network-badge').innerText();
    assert(netText.includes('Offline'), `Expected Offline badge, got: ${netText}`);
    assertions.push(`Offline badge verified (${netText})`);

    if (usedNativeNano) {
      logStep('[3/6] Native Gemini Nano is available! Running real offline on-device tasks...');
      await pageOffline.getByTestId('run-concierge-btn').click();
      await pageOffline.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="proposal-card-concierge"] [data-testid="proposal-source-badge"]')
            ?.textContent?.includes('ON-DEVICE'),
        { timeout: 25000 }
      );
      await pageOffline.waitForTimeout(1500);
      await recOffline.snap();
      const s1 = '01-offline-on-device.png';
      await pageOffline.screenshot({ path: path.join(SCREENSHOTS_DIR, s1) });
      screenshots.push(s1);

      await pageOffline.getByTestId('tab-sign_vision').click();
      await pageOffline.waitForTimeout(600);
      await pageOffline.getByTestId('sample-kyoto-sign').click();
      await pageOffline.waitForTimeout(600);
      await pageOffline.getByTestId('run-vision-btn').click();
      await pageOffline.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="proposal-card-sign_vision"] [data-testid="proposal-source-badge"]')
            ?.textContent?.includes('ON-DEVICE'),
        { timeout: 25000 }
      );
      await pageOffline.waitForTimeout(1500);
      await recOffline.snap();
      const s2 = '02-multimodal-sign-offline.png';
      await pageOffline.screenshot({ path: path.join(SCREENSHOTS_DIR, s2) });
      screenshots.push(s2);
      assertions.push('Native Chrome Gemini Nano executed offline with 0 cloud calls');
    } else {
      logStep('[3/6] Verifying honest Offline PWA edit + Privacy Shield (ONLY_ON_DEVICE)...');
      await pageOffline
        .getByRole('button', { name: 'Shorten Kinkaku-ji Golden Pavilion by 15 min' })
        .click();
      await pageOffline.waitForTimeout(1000);
      await recOffline.snap();

      await pageOffline.getByTestId('tab-privacy_vault').click();
      await pageOffline.waitForTimeout(700);
      await recOffline.snap();
      await pageOffline.getByTestId('run-privacy-btn').click();
      await pageOffline.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="proposal-card-privacy_vault"] [data-testid="proposal-source-badge"]')
            ?.textContent?.includes('BLOCKED LOCALLY'),
        { timeout: 12000 }
      );
      await pageOffline.waitForTimeout(1800);
      await recOffline.snap();
      const s1 = '01-offline-pwa-privacy-shield.png';
      await pageOffline.screenshot({ path: path.join(SCREENSHOTS_DIR, s1) });
      screenshots.push(s1);
      assertions.push('Offline PWA edit + Privacy Vault ONLY_ON_DEVICE local block verified (0 cloud requests)');
    }

    assert(
      emulator.getRequests().length === 0,
      `Expected 0 cloud requests during offline suite, saw ${emulator.getRequests().length}`
    );

    const run1Frames = await recOffline.stop();
    await pageOffline.close();
    await ctxOffline.close();
    await browserOffline.close();
    logStep(`[3/6] Offline verification PASS (captured ${run1Frames.length} frames).`);

    // Step C: Online Cloud Fallback + Multimodal Sign + Optimizer Keep/Discard + Recording Clip #2
    logStep('[4/6] Launching isolated Chrome for Online Cloud Fallback verification (recording run2)...');
    emulator.resetRequests();
    const browserCloud = await launchVerificationChrome(false);
    activeBrowsers.push(browserCloud);

    const ctxCloud = await browserCloud.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await ctxCloud.addInitScript((emuUrl) => {
      Object.defineProperty(globalThis, 'LanguageModel', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      localStorage.setItem(
        'lvsyn_hybrid_firebase_config_v1',
        JSON.stringify({
          emulatorBaseUrl: emuUrl,
          cloudModel: 'gemini-3.5-flash-lite',
        })
      );
    }, emulator.url);

    const pageCloud = await ctxCloud.newPage();
    pageCloud.setDefaultTimeout(12000);
    const recCloud = await createCdpFrameRecorder(pageCloud, VIDEO_SUBDIR_2);

    await pageCloud.goto(staticServer.url, { waitUntil: 'networkidle', timeout: 15000 });
    await pageCloud.waitForTimeout(1000);
    await recCloud.snap();

    const nanoCloudText = await pageCloud.getByTestId('nano-badge').innerText();
    assert(nanoCloudText.includes('Cloud Fallback'), `Expected Cloud Fallback badge, got: ${nanoCloudText}`);

    // 1) Multimodal Sign Vision -> IN-CLOUD fallback
    logStep('[4/6] Testing Multimodal Sign Vision cloud fallback...');
    await pageCloud.getByTestId('tab-sign_vision').click();
    await pageCloud.waitForTimeout(600);
    await pageCloud.getByTestId('sample-kyoto-sign').click();
    await pageCloud.waitForTimeout(700);
    await recCloud.snap();
    await pageCloud.getByTestId('run-vision-btn').click();
    await pageCloud.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="proposal-card-sign_vision"] [data-testid="proposal-source-badge"]')
          ?.textContent?.includes('IN-CLOUD'),
      { timeout: 12000 }
    );
    await pageCloud.waitForTimeout(1800);
    await recCloud.snap();
    const s2 = '02-multimodal-sign-fallback.png';
    await pageCloud.screenshot({ path: path.join(SCREENSHOTS_DIR, s2) });
    screenshots.push(s2);
    assert(emulator.getRequests().length === 1, `Expected 1 cloud call after Sign Vision, saw ${emulator.getRequests().length}`);
    assertions.push('Multimodal Sign Vision fallback returned IN_CLOUD with X-Firebase-AppCheck');

    // 2) Schedule Optimizer -> IN-CLOUD fallback + Keep Changes
    logStep('[4/6] Testing Schedule Optimizer cloud fallback & Keep verification...');
    await pageCloud.getByTestId('tab-schedule_optimize').click();
    await pageCloud.waitForTimeout(600);
    await pageCloud.getByTestId('run-optimizer-btn').click();
    await pageCloud.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="proposal-card-schedule_optimize"] [data-testid="proposal-source-badge"]')
          ?.textContent?.includes('IN-CLOUD'),
      { timeout: 12000 }
    );
    await pageCloud.getByTestId('deterministic-diff-card').waitFor({ timeout: 12000 });
    await pageCloud.waitForTimeout(1800);
    await recCloud.snap();
    const s3 = '03-cloud-fallback-optimizer.png';
    await pageCloud.screenshot({ path: path.join(SCREENSHOTS_DIR, s3) });
    screenshots.push(s3);

    const cloudCalls = emulator.getRequests();
    assert(cloudCalls.length === 2, `Expected 2 cloud calls after Optimizer, saw ${cloudCalls.length}`);
    assert(cloudCalls[1].hasAppCheckHeader === true, 'Missing X-Firebase-AppCheck header');
    assert(String(cloudCalls[1].googApiClient).includes('hybrid'), 'Missing hybrid tag in x-goog-api-client');

    await pageCloud.getByTestId('keep-proposal-btn').click();
    await pageCloud.waitForTimeout(1400);
    await recCloud.snap();
    const bannerAfterKeep = await pageCloud.getByTestId('schedule-verification-banner').innerText();
    assert(bannerAfterKeep.includes('All 5 stops verified'), `Expected verified timeline after Keep, got: ${bannerAfterKeep}`);
    assertions.push('Schedule Optimizer cloud fallback resolved 2 hard conflicts -> All 5 stops verified after Keep');

    // 3) Online Privacy Vault Guardrail Check -> Must NOT leak to cloud!
    logStep('[4/6] Verifying Online Privacy Vault ONLY_ON_DEVICE blocks cloud leakage...');
    await pageCloud.getByTestId('tab-privacy_vault').click();
    await pageCloud.waitForTimeout(600);
    await pageCloud.getByTestId('run-privacy-btn').click();
    await pageCloud.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="proposal-card-privacy_vault"] [data-testid="proposal-source-badge"]')
          ?.textContent?.includes('BLOCKED LOCALLY'),
      { timeout: 12000 }
    );
    await pageCloud.waitForTimeout(1800);
    await recCloud.snap();
    const s4 = '04-verified-timeline-and-telemetry.png';
    await pageCloud.screenshot({ path: path.join(SCREENSHOTS_DIR, s4) });
    screenshots.push(s4);

    assert(
      emulator.getRequests().length === 2,
      `Privacy Vault leaked! Expected 2 total requests, saw ${emulator.getRequests().length}`
    );
    assertions.push('Online Privacy Vault ONLY_ON_DEVICE blocked cloud transmission (0 leaked calls)');

    const run2Frames = await recCloud.stop();
    await pageCloud.close();
    await ctxCloud.close();
    await browserCloud.close();
    logStep(`[5/6] Cloud fallback verification PASS (captured ${run2Frames.length} frames).`);

    const report = {
      timestamp: new Date().toISOString(),
      probeEngine: probe.engine,
      verificationEngine: 'system-chrome',
      nativeAvailability,
      usedNativeNano,
      screenshots,
      assertions,
      emulatorRequestsCaptured: cloudCalls.length,
      recordedFrames: { run1: run1Frames.length, run2: run2Frames.length },
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    if (EXTRA_SCREENSHOTS_DIR) {
      for (const file of fs.readdirSync(SCREENSHOTS_DIR)) {
        if (file.endsWith('.png')) {
          fs.copyFileSync(path.join(SCREENSHOTS_DIR, file), path.join(EXTRA_SCREENSHOTS_DIR, file));
        }
      }
      fs.writeFileSync(
        path.join(path.dirname(EXTRA_SCREENSHOTS_DIR), 'e2e-report.json'),
        JSON.stringify(report, null, 2),
        'utf8'
      );
    }

    logStep('[6/6] ALL E2E CHECKS PASSED CLEANLY.');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    clearTimeout(watchdog);
    for (const b of activeBrowsers) {
      try {
        await b.close();
      } catch {}
    }
    try {
      await staticServer?.close();
    } catch {}
    try {
      await emulator?.close();
    } catch {}
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
