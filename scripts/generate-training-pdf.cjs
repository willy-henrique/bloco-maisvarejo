const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'docs', 'manual-treinamento-mavo-gestao.md');
const htmlOut = path.join(root, 'docs', 'manual-treinamento-mavo-gestao.html');
const pdfOut = path.join(root, 'docs', 'manual-treinamento-mavo-gestao.pdf');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inCode = false;
  let code = [];

  function closeCode() {
    out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    code = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCode) {
        closeCode();
        inCode = false;
      } else {
        inCode = true;
      }
      i += 1;
      continue;
    }
    if (inCode) {
      code.push(line);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line.trim());
    if (image) {
      const alt = image[1].trim();
      const src = image[2].trim();
      out.push(
        `<figure><img src="${escapeHtml(encodeURI(src))}" alt="${escapeHtml(alt)}"><figcaption>${inline(alt)}</figcaption></figure>`,
      );
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slug(text);
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\|.+\|$/.test(line.trim()) && i + 1 < lines.length && /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim())) {
      const headers = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i += 1;
      }
      out.push('<table><thead><tr>');
      for (const h of headers) out.push(`<th>${inline(h)}</th>`);
      out.push('</tr></thead><tbody>');
      for (const row of rows) {
        out.push('<tr>');
        for (const cell of row) out.push(`<td>${inline(cell)}</td>`);
        out.push('</tr>');
      }
      out.push('</tbody></table>');
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      out.push('<ul>');
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\s*-\s+/, ''))}</li>`);
        i += 1;
      }
      out.push('</ul>');
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      out.push('<ol>');
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      out.push('</ol>');
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\|.+\|$/.test(lines[i].trim()) &&
      !lines[i].startsWith('```')
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  if (inCode) closeCode();
  return out.join('\n');
}

function chromePath() {
  const candidates = [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'google-chrome',
    'chromium',
    'chromium-browser',
  ];
  for (const candidate of candidates) {
    if (candidate.includes('/') && fs.existsSync(candidate)) return candidate;
    if (!candidate.includes('/')) {
      const found = spawnSync('which', [candidate], { encoding: 'utf8' });
      if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
    }
  }
  return null;
}

function toWindowsPath(filePath) {
  try {
    return execFileSync('wslpath', ['-w', filePath], { encoding: 'utf8' }).trim();
  } catch {
    return filePath;
  }
}

function fileUrl(filePath) {
  if (filePath.startsWith('/mnt/')) {
    const win = toWindowsPath(filePath).replace(/\\/g, '/');
    return encodeURI(`file:///${win}`);
  }
  return new URL(`file://${filePath}`).href;
}

const md = fs.readFileSync(input, 'utf8');
const body = renderMarkdown(md);
const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Manual de Treinamento para Usuarios - Mavo Gestao</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      background: #ffffff;
      font: 11.2pt/1.55 Arial, Helvetica, sans-serif;
    }
    h1, h2, h3, h4 { color: #0f172a; line-height: 1.2; page-break-after: avoid; }
    h1 { font-size: 29pt; margin: 0 0 14px; letter-spacing: -0.02em; }
    h2 { font-size: 18pt; margin: 28px 0 10px; padding-top: 4px; border-top: 1px solid #e5e7eb; }
    h3 { font-size: 13.5pt; margin: 20px 0 8px; }
    h4 { font-size: 12pt; margin: 14px 0 6px; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 12px 22px; padding: 0; }
    li { margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; page-break-inside: avoid; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
    th { background: #eef2ff; color: #111827; font-weight: 700; text-align: left; }
    tr:nth-child(even) td { background: #f9fafb; }
    code { font-family: Consolas, Monaco, monospace; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
    pre { background: #111827; color: #f9fafb; padding: 12px; border-radius: 6px; white-space: pre-wrap; page-break-inside: avoid; }
    figure { margin: 14px 0 22px; page-break-inside: avoid; }
    figure img {
      display: block;
      width: 100%;
      max-height: 190mm;
      object-fit: contain;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #020617;
    }
    figcaption {
      margin-top: 6px;
      color: #475569;
      font-size: 9.5pt;
      text-align: center;
    }
    .cover {
      min-height: 250mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border-left: 8px solid #2563eb;
      padding-left: 24px;
      page-break-after: always;
    }
    .cover .eyebrow {
      color: #2563eb;
      font-size: 10pt;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: .08em;
      margin-bottom: 16px;
    }
    .cover .subtitle {
      color: #475569;
      font-size: 14pt;
      max-width: 620px;
      margin-bottom: 26px;
    }
    .meta {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 6px 14px;
      color: #334155;
      font-size: 10.5pt;
      max-width: 620px;
    }
    .meta strong { color: #0f172a; }
    .toc {
      page-break-after: always;
      border: 1px solid #e5e7eb;
      background: #f8fafc;
      padding: 16px 18px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .toc h2 { border-top: 0; margin-top: 0; }
    .note {
      border-left: 4px solid #2563eb;
      background: #eff6ff;
      padding: 10px 12px;
      margin: 14px 0;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="eyebrow">Manual de treinamento</div>
    <h1>Manual de Treinamento para Usuarios - Mavo Gestao</h1>
    <p class="subtitle">Guia pratico para quem vai usar o sistema no dia a dia: Backlog, Estrategico, Gerencial, Operacional, Agenda, Chat e 5W2H CHAT.</p>
    <div class="meta">
      <strong>Projeto</strong><span>Mavo Gestão</span>
      <strong>Versao</strong><span>2.1.1</span>
      <strong>Objetivo</strong><span>Treinar usuarios no uso diario do sistema, sem conteudo tecnico de implementacao.</span>
    </div>
  </section>
  <section class="toc">
    <h2>Como usar este documento</h2>
    <p>Use este documento como roteiro de treinamento pratico. Ele explica o que fazer em cada tela, quando usar cada recurso e quais cuidados tomar na rotina.</p>
  </section>
  ${body}
</body>
</html>`;

fs.writeFileSync(htmlOut, html, 'utf8');

const browser = chromePath();
if (!browser) {
  console.log(`HTML gerado em ${htmlOut}`);
  console.log('Chrome/Chromium nao encontrado; PDF nao foi gerado automaticamente.');
  process.exit(0);
}

const pdfTarget = browser.endsWith('.exe') ? toWindowsPath(pdfOut) : pdfOut;
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfTarget}`,
  fileUrl(htmlOut),
];
const result = spawnSync(browser, args, { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Falha ao gerar PDF.\n');
  process.exit(result.status || 1);
}

console.log(`HTML gerado em ${htmlOut}`);
console.log(`PDF gerado em ${pdfOut}`);
