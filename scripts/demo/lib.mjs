import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    throw new Error(
      "Playwright não encontrado. Execute `npm install --prefix scripts/demo` e `npx playwright install chromium` antes de atualizar a demonstração."
    );
  }
}

export function log(message) {
  process.stdout.write(`[demo] ${message}\n`);
}

export function parseArgs(argv) {
  const args = { check: false, keepTemp: false, source: null, commit: null, referenceMonth: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--keep-temp") args.keepTemp = true;
    else if (arg === "--source") args.source = argv[++i];
    else if (arg === "--commit") args.commit = argv[++i];
    else if (arg === "--reference-month") args.referenceMonth = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return args;
}

export function usage() {
  return `Uso: node scripts/demo/refresh-contabase-demo.mjs [opções]

  --source <caminho>       Repositório fonte do ContaBase (padrão: ../contabase-dev)
  --commit <sha>           Commit aprovado usado no snapshot (padrão: a64d70c3)
  --reference-month YYYY-MM  Mês de referência; por padrão usa o mês atual
  --check                  Gera em diretório temporário e compara com o publicado
  --keep-temp              Mantém worktree e runtime para depuração
  -h, --help               Mostra esta ajuda`;
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function referenceInfo(rawMonth = null, now = new Date()) {
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  if (rawMonth) {
    const match = /^(\d{4})-(\d{2})$/.exec(rawMonth);
    if (!match) throw new Error(`Mês de referência inválido: ${rawMonth}. Use YYYY-MM.`);
    year = Number(match[1]);
    month = Number(match[2]);
  }
  const months = [];
  for (let delta = -5; delta <= 0; delta++) {
    const item = addMonths(year, month, delta);
    months.push(monthKey(item.year, item.month));
  }
  const current = monthKey(year, month);
  const firstDay = `${current}-01`;
  const firstDayBR = `01/${String(month).padStart(2, "0")}/${year}`;
  const windowStart = addMonths(year, month, -6);
  const backdate = new Date(windowStart.year, windowStart.month - 1, 1, 12, 0, 0);
  return {
    year,
    month,
    key: current,
    months,
    label: `${MONTHS[month - 1]} de ${year}`,
    firstDay,
    firstDayBR,
    backdateUnix: Math.floor(backdate.getTime() / 1000),
    targetYear: year + 1,
    reportRoute: `/relatorios?tab=caixa&modo=realizado&mes=${month}&ano=${year}`,
    extratoRoute: `/relatorios?tab=extrato&mes=${month}&ano=${year}`,
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export async function waitForHealth(base, timeoutMs = 30000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(base + "/health", { redirect: "manual" });
      if (res.ok) return;
      lastError = new Error("HTTP " + res.status);
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  throw new Error(`ContaBase temporário não respondeu em ${base}: ${lastError?.message || "timeout"}`);
}

export function sqliteJson(dbPath, sql) {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" }).trim();
  return out ? JSON.parse(out) : [];
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function copyDir(src, dst, options = {}) {
  const { skipNames = [] } = options;
  ensureDir(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || skipNames.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to, options);
    else fs.copyFileSync(from, to);
  }
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
};

export async function startStaticServer(root) {
  const port = await freePort();
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = path.normalize(path.join(root, pathname));
      if (!file.startsWith(path.normalize(root))) {
        res.writeHead(403).end("forbidden");
        return;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500).end("internal error");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function normalizeHtml(html) {
  return html
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{10,13}\b/g, "<timestamp>")
    .replace(/\r\n/g, "\n");
}

export function listFiles(root) {
  const out = [];
  function walk(dir, rel = "") {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const child = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, childRel);
      else out.push(childRel);
    }
  }
  walk(root);
  return out.sort();
}
