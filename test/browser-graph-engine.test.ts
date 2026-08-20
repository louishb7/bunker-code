import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import * as esbuild from 'esbuild';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import { buildProjectGraph, createImpactReport, createProjectDiagnostics } from '../packages/graph-engine/src/index.js';

const repoRoot = path.resolve('.');
const datasetPath = path.join(repoRoot, 'packages/analyzer-typescript');
const impactTarget = 'src/analysis-result.ts';

function encodeWebSocketFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const payloadLength = payload.length;
  let headerLength = 2;

  if (payloadLength >= 126 && payloadLength < 65536) {
    headerLength += 2;
  } else if (payloadLength >= 65536) {
    headerLength += 8;
  }

  const frame = Buffer.alloc(headerLength + 4 + payloadLength);
  frame[0] = 0x81;
  let offset = 1;

  if (payloadLength < 126) {
    frame[offset++] = 0x80 | payloadLength;
  } else if (payloadLength < 65536) {
    frame[offset++] = 0x80 | 126;
    frame.writeUInt16BE(payloadLength, offset);
    offset += 2;
  } else {
    frame[offset++] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(payloadLength), offset);
    offset += 8;
  }

  mask.copy(frame, offset);
  offset += 4;

  for (let index = 0; index < payloadLength; index += 1) {
    frame[offset + index] = payload[index] ^ mask[index % 4];
  }

  return frame;
}

function decodeWebSocketFrames(buffer: Buffer): { messages: string[]; remainder: Buffer } {
  const messages: string[] = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;

    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let mask: Buffer | undefined;
    if (masked) {
      if (offset + 4 > buffer.length) break;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (offset + length > buffer.length) break;
    let payload = buffer.subarray(offset, offset + length);
    offset += length;

    if (masked && mask) {
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    if (opcode === 1) {
      messages.push(payload.toString('utf8'));
    }

    if (!fin) {
      throw new Error('fragmented websocket frame not supported');
    }
  }

  return { messages, remainder: buffer.subarray(offset) };
}

class BiDiClient {
  private socket?: net.Socket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private buffer = Buffer.alloc(0);
  private handshake = '';
  private ready = false;

  constructor(private readonly host: string, private readonly port: number) {}

  async connect(): Promise<void> {
    this.socket = net.createConnection(this.port, this.host);
    const key = crypto.randomBytes(16).toString('base64');

    await new Promise<void>((resolve, reject) => {
      this.socket?.once('error', reject);
      this.socket?.once('connect', () => {
        this.socket?.write([
          'GET /session HTTP/1.1',
          `Host: ${this.host}:${this.port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Protocol: webdriver-bidi',
          '',
          '',
        ].join('\r\n'));
      });

      this.socket?.on('data', (chunk) => {
        if (!this.ready) {
          this.handshake += chunk.toString('utf8');

          if (!this.handshake.includes('\r\n\r\n')) {
            return;
          }

          const [header, rest] = this.handshake.split('\r\n\r\n');

          if (!header.startsWith('HTTP/1.1 101')) {
            reject(new Error(`WebSocket handshake failed: ${header}`));
            return;
          }

          this.ready = true;
          this.buffer = Buffer.concat([this.buffer, Buffer.from(rest ?? '', 'utf8')]);
          resolve();
          this.flushBuffer();
          return;
        }

        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.flushBuffer();
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.socket) {
      throw new Error('BiDi socket is not connected');
    }

    const id = this.nextId;
    this.nextId += 1;
    this.socket.write(encodeWebSocketFrame(JSON.stringify({ id, method, params })));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close(): void {
    this.socket?.end();
  }

  private flushBuffer(): void {
    const { messages, remainder } = decodeWebSocketFrames(this.buffer);
    this.buffer = remainder;

    for (const message of messages) {
      const parsed = JSON.parse(message) as { id?: number; error?: string; message?: string };

      if (parsed.id && this.pending.has(parsed.id)) {
        this.pending.get(parsed.id)?.resolve(parsed);
        this.pending.delete(parsed.id);
      }
    }
  }
}

async function startFirefox(port: number, profilePath: string): Promise<ReturnType<typeof spawn>> {
  const firefox = spawn(
    'firefox',
    ['--headless', '--no-remote', '--remote-debugging-port', String(port), '-profile', profilePath, 'about:blank'],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );

  firefox.stderr?.resume();
  return firefox;
}

async function waitForConnection(client: BiDiClient, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await client.connect();
      return;
    } catch {
      client.close();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error('Firefox BiDi did not become ready in time');
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate a free port'));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForBrowserResult(client: BiDiClient, context: string): Promise<{ result: unknown; error: string | null }> {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const response = await client.send('script.evaluate', {
      expression: 'JSON.stringify({ result: globalThis.__RESULT__ ?? null, error: globalThis.__ERROR__ ?? null })',
      target: { context },
      awaitPromise: true,
      resultOwnership: 'none',
      serializationOptions: { maxDomDepth: 1, maxObjectDepth: 1 },
    });
    const raw = response.result?.result;

    if (raw?.type === 'string') {
      const parsed = JSON.parse(raw.value) as { result: unknown; error: string | null };

      if (parsed.error) {
        return parsed;
      }

      if (parsed.result) {
        return parsed;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for browser result');
}

test('browser build reconstructs the snapshot boundary', { timeout: 60000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') {
    t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run the Firefox browser compatibility test.');
    return;
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-browser-test-'));
  const firefoxProfilePath = path.join(tempDir, 'firefox-profile');
  const browserHtmlPath = path.join(tempDir, 'index.html');
  const browserBundlePath = path.join(tempDir, 'spike.bundle.js');
  const analysis = analyzeProject(datasetPath);
  const snapshot = JSON.parse(JSON.stringify(analysis));
  const snapshotJson = JSON.stringify(snapshot);
  const browserTarget = impactTarget;

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });
  mkdirSync(firefoxProfilePath, { recursive: true });

  const nodeGraph = buildProjectGraph(snapshot);
  const nodeDiagnostics = createProjectDiagnostics(nodeGraph);
  const nodeImpact = createImpactReport(nodeGraph, browserTarget);

  const browserSource = `
    import { buildProjectGraph, createProjectDiagnostics, createImpactReport } from './packages/graph-engine/src/index.ts';

    try {
      const snapshot = JSON.parse(globalThis.__SNAPSHOT_JSON__);
      const target = globalThis.__TARGET__;
      const started = performance.now();
      const graphStarted = performance.now();
      const graph = buildProjectGraph(snapshot);
      const graphMs = performance.now() - graphStarted;
      const diagnosticsStarted = performance.now();
      const diagnostics = createProjectDiagnostics(graph);
      const diagnosticsMs = performance.now() - diagnosticsStarted;
      const impactStarted = performance.now();
      const impact = createImpactReport(graph, target);
      const impactMs = performance.now() - impactStarted;

      globalThis.__RESULT__ = {
        graph,
        diagnostics,
        impact,
        timings: {
          graphMs,
          diagnosticsMs,
          impactMs,
          totalMs: performance.now() - started,
        },
      };
    } catch (error) {
      globalThis.__ERROR__ = error instanceof Error ? (error.stack || error.message) : String(error);
    }
  `;

  await esbuild.build({
    stdin: {
      contents: browserSource,
      resolveDir: repoRoot,
      sourcefile: 'browser-spike.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outfile: browserBundlePath,
    metafile: true,
    sourcemap: false,
    minify: false,
  });

  const bundleText = readFileSync(browserBundlePath, 'utf8');
  assert.equal(bundleText.includes('node:fs') || bundleText.includes('node:path') || bundleText.includes('ts-morph'), false);
  assert.ok(statSync(browserBundlePath).size > 0);

  writeFileSync(
    browserHtmlPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <script>
      globalThis.__SNAPSHOT_JSON__ = ${JSON.stringify(snapshotJson)};
      globalThis.__TARGET__ = ${JSON.stringify(browserTarget)};
      globalThis.__RESULT__ = null;
      globalThis.__ERROR__ = null;
      window.addEventListener('error', (event) => {
        globalThis.__ERROR__ = event?.error ? (event.error.stack || String(event.error)) : String(event?.message || 'unknown error');
      });
    </script>
    <script type="module" src="./spike.bundle.js"></script>
  </head>
  <body>browser spike</body>
</html>
`,
  );

  const port = await getFreePort();
  const firefox = await startFirefox(port, firefoxProfilePath);
  const client = new BiDiClient('127.0.0.1', port);
  let sessionCreated = false;

  t.after(() => {
    firefox.kill('SIGTERM');
  });

  try {
    await waitForConnection(client);
    const session = await client.send('session.new', { capabilities: {} });
    assert.equal(session.type, 'success');
    sessionCreated = true;

    const tree = await client.send('browsingContext.getTree', { maxDepth: 1 });
    const context = tree.result.contexts[0]?.context;
    assert.ok(context);

    await client.send('browsingContext.navigate', {
      context,
      url: pathToFileURL(browserHtmlPath).href,
    });

    const browserResult = await waitForBrowserResult(client, context);
    assert.equal(browserResult.error, null);
    assert.ok(browserResult.result);

    const result = browserResult.result as {
      graph: unknown;
      diagnostics: unknown;
      impact: unknown;
      timings: { graphMs: number; diagnosticsMs: number; impactMs: number; totalMs: number };
    };

    assert.deepEqual(result.graph, nodeGraph);
    assert.deepEqual(result.diagnostics, nodeDiagnostics);
    assert.deepEqual(result.impact, nodeImpact);
    assert.ok(result.timings.graphMs >= 0);
    assert.ok(result.timings.diagnosticsMs >= 0);
    assert.ok(result.timings.impactMs >= 0);
    assert.ok(result.timings.totalMs >= 0);
    assert.deepEqual(nodeImpact.directDependents.map((node) => node.id), ['src/analyze-project.ts', 'src/index.ts']);
    assert.equal(nodeImpact.totalAffected, 2);
  } finally {
    if (sessionCreated) {
      await client.send('session.end', {}).catch(() => undefined);
    }

    client.close();
  }
});
