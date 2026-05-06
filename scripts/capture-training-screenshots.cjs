const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
const profileDir = path.join(root, '.tmp', `chrome-training-capture-${process.pid}-${Date.now()}`);
const baseUrl = process.env.MAVO_CAPTURE_URL || 'http://localhost:3000/';
const email = process.env.MAVO_CAPTURE_EMAIL;
const password = process.env.MAVO_CAPTURE_PASSWORD;
const port = Number(process.env.MAVO_CAPTURE_PORT || 9433);

if (!email || !password) {
  console.error('Defina MAVO_CAPTURE_EMAIL e MAVO_CAPTURE_PASSWORD para capturar telas autenticadas.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toWindowsPath(filePath) {
  if (process.platform === 'win32') return filePath;
  try {
    return execFileSync('wslpath', ['-w', filePath], { encoding: 'utf8' }).trim();
  } catch {
    return filePath;
  }
}

function chromePath() {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : [
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

class SimpleWebSocket {
  constructor(rawUrl) {
    this.rawUrl = rawUrl;
    this.buffer = Buffer.alloc(0);
    this.handshakeDone = false;
    this.fragments = [];
    this.fragmentOpcode = null;
    this.connect();
  }

  connect() {
    const url = new URL(this.rawUrl);
    const isSecure = url.protocol === 'wss:';
    const portNum = Number(url.port || (isSecure ? 443 : 80));
    const socket = (isSecure ? tls : net).connect(portNum, url.hostname, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const request = [
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n');
      socket.write(request);
    });
    this.socket = socket;
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (error) => this.onerror?.(error));
    socket.on('close', () => this.onclose?.());
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshakeDone) {
      const idx = this.buffer.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const header = this.buffer.subarray(0, idx).toString('utf8');
      if (!/^HTTP\/1\.1 101/i.test(header)) {
        this.onerror?.(new Error(`Handshake WebSocket invalido: ${header.split('\r\n')[0]}`));
        return;
      }
      this.handshakeDone = true;
      this.buffer = this.buffer.subarray(idx + 4);
      this.onopen?.();
    }
    this.parseFrames();
  }

  parseFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let len = second & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        len = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + len) return;
      let payload = Buffer.from(this.buffer.subarray(offset, offset + len));
      this.buffer = this.buffer.subarray(offset + len);
      if (masked && mask) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      }
      if (opcode === 8) {
        this.close();
        return;
      }
      if (opcode === 9) {
        this.writeFrame(payload, 0x0a);
        continue;
      }
      if (opcode === 1 && fin) {
        this.onmessage?.({ data: payload.toString('utf8') });
        continue;
      }
      if (opcode === 1 && !fin) {
        this.fragmentOpcode = opcode;
        this.fragments = [payload];
        continue;
      }
      if (opcode === 0) {
        this.fragments.push(payload);
        if (fin) {
          const joined = Buffer.concat(this.fragments);
          this.fragments = [];
          this.fragmentOpcode = null;
          this.onmessage?.({ data: joined.toString('utf8') });
        }
      }
    }
  }

  writeFrame(data, opcode = 1) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | payload.length;
    } else if (payload.length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const maskedPayload = Buffer.from(payload);
    for (let i = 0; i < maskedPayload.length; i += 1) maskedPayload[i] ^= mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }

  send(data) {
    this.writeFrame(data, 1);
  }

  close() {
    try {
      this.socket.end();
      this.socket.destroy();
    } catch {}
  }
}

function createWebSocket(url) {
  if (typeof WebSocket !== 'undefined') return new WebSocket(url);
  return new SimpleWebSocket(url);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = createWebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('Timeout conectando ao Chrome DevTools.')), 15000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Erro ao abrir WebSocket do Chrome DevTools.'));
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
    });
  }

  handleMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method && this.waiters.has(msg.method)) {
      const waiters = this.waiters.get(msg.method);
      this.waiters.delete(msg.method);
      waiters.forEach((resolve) => resolve(msg.params || {}));
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Timeout em ${method}`));
      }, 30000);
    });
  }

  waitForEvent(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(method) || [];
      list.push(resolve);
      this.waiters.set(method, list);
      setTimeout(() => reject(new Error(`Timeout aguardando ${method}`)), timeout);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function waitForJson(url, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`Chrome DevTools nao respondeu em ${url}`);
}

async function evalJs(client, expression, awaitPromise = true) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Erro em Runtime.evaluate');
  }
  return result.result?.value;
}

async function waitFor(client, expression, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await evalJs(client, `Boolean(${expression})`).catch(() => false);
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}

async function clickByText(client, label) {
  return evalJs(
    client,
    `(() => {
      const wanted = ${JSON.stringify(label)};
      const norm = (s) => String(s || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/\\s+/g, ' ')
        .trim();
      const target = norm(wanted);
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const hit = candidates.find((el) => norm(el.innerText || el.textContent).includes(target));
      if (!hit) return false;
      hit.click();
      return true;
    })()`,
  );
}

async function screenshot(client, name) {
  await sleep(1000);
  const shot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`screenshot: ${path.relative(root, file)}`);
}

async function main() {
  const browser = chromePath();
  if (!browser) throw new Error('Chrome ou Edge nao encontrado.');

  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const userDataDir = browser.endsWith('.exe') ? toWindowsPath(profileDir) : profileDir;
  const chrome = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1440,1000',
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    baseUrl,
  ], { stdio: 'ignore' });

  let pageClient;
  let browserClient;
  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json`);
    const page = targets.find((target) => target.type === 'page') || targets[0];
    if (!page?.webSocketDebuggerUrl) throw new Error('Nenhuma pagina do Chrome encontrada.');

    browserClient = new CdpClient(version.webSocketDebuggerUrl);
    await browserClient.connect();
    pageClient = new CdpClient(page.webSocketDebuggerUrl);
    await pageClient.connect();
    await pageClient.send('Page.enable');
    await pageClient.send('Runtime.enable');
    await pageClient.send('Network.enable');
    await pageClient.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pageClient.send('Page.bringToFront');

    await waitFor(pageClient, `document.readyState === 'complete' || document.readyState === 'interactive'`);
    await waitFor(pageClient, `document.querySelector('input[type="email"]') && document.querySelector('input[type="password"]')`);
    await screenshot(pageClient, '01-login.png');

    await evalJs(pageClient, `(() => {
      const email = ${JSON.stringify(email)};
      const password = ${JSON.stringify(password)};
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set ||
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue(document.querySelector('input[type="email"]'), email);
      setValue(document.querySelector('input[type="password"]'), password);
      document.querySelector('form button[type="submit"], form button')?.click();
      return true;
    })()`);

    await waitFor(pageClient, `document.body.innerText.includes('Backlog') && document.body.innerText.includes('Mavo Gestão')`, 45000);
    await sleep(2500);
    await evalJs(pageClient, `(() => {
      const norm = (s) => String(s || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/\\s+/g, ' ')
        .trim();
      const btn = Array.from(document.querySelectorAll('button'))
        .find((el) => norm(el.innerText || el.textContent).includes('agora nao'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`).catch(() => false);
    await sleep(800);
    await screenshot(pageClient, '02-backlog.png');

    const screens = [
      ['estrategico', '03-estrategico.png', 'Estratégico'],
      ['gerencial', '04-gerencial.png', 'Tático'],
      ['operacional', '05-operacional.png', 'Operacional'],
      ['desempenho', '06-desempenho.png', 'Desempenho'],
      ['roadmap', '07-roadmap.png', 'Roadmap'],
      ['agenda', '08-agenda.png', 'Agenda'],
      ['chat', '09-chat.png', 'Chat'],
      ['5w2h chat', '10-5w2h-chat.png', '5W2H CHAT'],
    ];

    for (const [button, file, marker] of screens) {
      const clicked = await clickByText(pageClient, button);
      if (!clicked) {
        console.log(`aviso: botao nao encontrado: ${button}`);
        continue;
      }
      await sleep(1800);
      await screenshot(pageClient, file);
    }

    await browserClient.send('Browser.close').catch(() => {});
  } finally {
    pageClient?.close();
    browserClient?.close();
    if (!chrome.killed) chrome.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
