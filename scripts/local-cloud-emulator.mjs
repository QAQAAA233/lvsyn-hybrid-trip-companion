import http from 'node:http';

const DEFAULT_PORT = Number(process.env.EMULATOR_PORT || 8788);

function buildItineraryAwareResponse(promptText) {
  const lower = promptText.toLowerCase();

  if (lower.includes('patchops') || lower.includes('schedule optimizer')) {
    if (lower.includes('kyoto-stop-2') || lower.includes('kyoto')) {
      return [
        'Cloud Fallback Analysis (Gemini via Firebase AI Logic):',
        '',
        '1. **Closed-day fix (`kyoto-stop-2`)**: Kyoto National Museum is closed on Tuesdays (`Tue`). Replace it with **Kyoto Railway & Heritage Pavilion (Indoor)**, open Tuesdays 09:30-17:30 with step-free ramps and low walking.',
        '2. **Accessibility & Return Train (`kyoto-stop-3`, `kyoto-stop-4`, `kyoto-stop-5`)**: Replace steep Kiyomizu approach stairs with **Sanjusangendo Flat Temple Hall (75 min)**, trim Nishiki Market rest to **75 min**, and trim Gion dinner to **65 min** so you arrive at Kyoto Station with a **+55 min** buffer before the 19:00 Shinkansen.',
        '',
        '```json',
        JSON.stringify(
          {
            patchOps: [
              {
                op: 'replace_stop',
                stopId: 'kyoto-stop-2',
                replacement: {
                  name: 'Kyoto Railway & Heritage Pavilion (Indoor)',
                  category: 'Museum',
                  durationMin: 75,
                  transitFromPrevMin: 30,
                  openMin: 570,
                  closeMin: 1050,
                  closedDays: ['Wed'],
                  indoor: true,
                  wheelchairFriendly: true,
                  walkingBurden: 'low',
                  notes: 'Elevator access throughout; flat indoor concourse.',
                },
              },
              {
                op: 'replace_stop',
                stopId: 'kyoto-stop-3',
                replacement: {
                  name: 'Sanjusangendo Flat Temple Hall',
                  category: 'Temple',
                  durationMin: 75,
                  transitFromPrevMin: 20,
                  openMin: 510,
                  closeMin: 1020,
                  closedDays: [],
                  indoor: true,
                  wheelchairFriendly: true,
                  walkingBurden: 'low',
                  notes: 'Wheelchair-accessible flat wooden corridor; minimal steps.',
                },
              },
              {
                op: 'update_duration',
                stopId: 'kyoto-stop-4',
                durationMin: 75,
              },
              {
                op: 'update_duration',
                stopId: 'kyoto-stop-5',
                durationMin: 65,
              },
            ],
          },
          null,
          2
        ),
        '```',
      ].join('\n');
    }

    if (lower.includes('swiss-stop-3') || lower.includes('lauterbrunnen')) {
      return [
        'Cloud Fallback Analysis (Gemini via Firebase AI Logic):',
        '',
        'Replaced closed Thursday Murren promenade with **Lauterbrunnen Covered Station Cafe (Step-Free)** and shortened Schilthorn peak dwell to catch the 18:30 InterCity Express cleanly.',
        '',
        '```json',
        JSON.stringify(
          {
            patchOps: [
              {
                op: 'update_duration',
                stopId: 'swiss-stop-2',
                durationMin: 135,
              },
              {
                op: 'replace_stop',
                stopId: 'swiss-stop-3',
                replacement: {
                  name: 'Grutschalp Panorama Terrace (Indoor)',
                  category: 'Alpine Viewpoint',
                  durationMin: 75,
                  transitFromPrevMin: 25,
                  openMin: 510,
                  closeMin: 1080,
                  closedDays: [],
                  indoor: true,
                  wheelchairFriendly: true,
                  walkingBurden: 'low',
                  notes: 'Direct platform access with warm indoor waiting lounge.',
                },
              },
            ],
          },
          null,
          2
        ),
        '```',
      ].join('\n');
    }

    return [
      'Cloud Fallback Analysis (Gemini via Firebase AI Logic):',
      '',
      'Swapped exposed outdoor park loop for an indoor wheelchair-accessible gallery so the itinerary stays dry and catches the 20:00 High-Speed Rail return.',
      '',
      '```json',
      JSON.stringify(
        {
          patchOps: [
            {
              op: 'replace_stop',
              stopId: 'taipei-stop-2',
              replacement: {
                name: 'Syntrend & Songshan Indoor Atrium',
                category: 'Indoor Cultural Hall',
                durationMin: 75,
                transitFromPrevMin: 20,
                openMin: 600,
                closeMin: 1260,
                closedDays: [],
                indoor: true,
                wheelchairFriendly: true,
                walkingBurden: 'low',
                notes: 'Covered walkways, baby nursing rooms, and elevator access.',
              },
            },
          ],
        },
        null,
        2
      ),
      '```',
    ].join('\n');
  }

  if (lower.includes('image') || lower.includes('sign') || lower.includes('notice')) {
    return [
      'Sign & Notice Analysis (Cloud Fallback):',
      '- **Hours**: Open daily 09:30-17:30 (last entry 17:00); closed Wednesdays.',
      '- **Accessibility**: Step-free side ramp and elevator available near East Gate.',
      '- **Schedule Fit**: Safe for Tuesday family itinerary with senior parents; no stair conflict.',
    ].join('\n');
  }

  return [
    'Trip Concierge Summary (Cloud Fallback):',
    '- **Priority Alert**: Kyoto National Museum is closed on Tuesdays (`Tue`), and Kiyomizu-dera has a steep approach flagged for senior knees.',
    '- **Pacing**: Nishiki Covered Market offers seated indoor tea breaks from 16:20-17:50.',
    '- **Next Action**: Switch to the **Optimizer** tab to generate a verified Keep/Discard conflict fix.',
  ].join('\n');
}

export function startCloudEmulatorServer(port = DEFAULT_PORT) {
  const requests = [];

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Firebase-AppCheck, X-Firebase-Appid, x-goog-api-client, x-goog-api-key, Authorization'
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, requestsCount: requests.length }));
      return;
    }

    if (req.method === 'GET' && req.url === '/_requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requests }));
      return;
    }

    if (req.method === 'POST' && req.url === '/_reset') {
      requests.length = 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let parsed = {};
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = {};
      }

      const appCheckHeader = req.headers['x-firebase-appcheck'] || null;
      const googApiClient = req.headers['x-goog-api-client'] || null;
      const promptParts = [];
      for (const content of parsed.contents || []) {
        for (const part of content.parts || []) {
          if (typeof part.text === 'string') promptParts.push(part.text);
        }
      }
      const promptText = promptParts.join('\n');

      requests.push({
        url: req.url,
        hasAppCheckHeader: Boolean(appCheckHeader),
        appCheckHeader,
        googApiClient,
        timestamp: Date.now(),
      });

      const fullText = buildItineraryAwareResponse(promptText);
      const isStream = (req.url || '').includes('streamGenerateContent');

      if (isStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const segments = fullText.match(/[\s\S]{1,80}/g) || [fullText];
        segments.forEach((seg, idx) => {
          const isLast = idx === segments.length - 1;
          const payload = {
            candidates: [
              {
                index: 0,
                content: {
                  role: 'model',
                  parts: [{ text: seg }],
                },
                ...(isLast ? { finishReason: 'STOP' } : {}),
              },
            ],
          };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: fullText }],
              },
              finishReason: 'STOP',
            },
          ],
        })
      );
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
        getRequests: () => [...requests],
        resetRequests: () => {
          requests.length = 0;
        },
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}

const entryArg = (process.argv[1] || '').replace(/\\/g, '/');
if (entryArg && (import.meta.url === `file://${entryArg}` || entryArg.endsWith('local-cloud-emulator.mjs'))) {
  startCloudEmulatorServer().then((handle) => {
    console.log(`Local Firebase AI Logic cloud emulator listening at ${handle.url}`);
  });
}
