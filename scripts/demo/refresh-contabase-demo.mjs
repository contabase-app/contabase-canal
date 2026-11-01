#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  copyDir,
  ensureDir,
  freePort,
  listFiles,
  loadPlaywright,
  log,
  normalizeHtml,
  parseArgs,
  referenceInfo,
  removeDir,
  sleep,
  sqliteJson,
  startStaticServer,
  usage,
  waitForHealth,
} from "./lib.mjs";
import { seedDemo, setupDemo } from "./seed.mjs";
import { generateDemo, SCREENS } from "./generate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const DEFAULT_SOURCE = path.resolve(REPO_ROOT, "..", "contabase-dev");
const DEFAULT_COMMIT = "a64d70c3b7f59fb97e628ea03e0141f0aa039050";
const DEMO_EMAIL = "demo@exemplo.test";
const DEMO_PASSWORD = "DemoLocal!2026";
const AUTH_KEY = crypto.randomBytes(32).toString("base64");
const MASTER_KEY = crypto.randomBytes(16).toString("hex");

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: options.stdio || "pipe", ...options });
}

function startApp({ binary, cwd, env, logPath }) {
  const out = fs.openSync(logPath, "a");
  const child = spawn(binary, [], {
    cwd,
    env,
    stdio: ["ignore", out, out],
    detached: false,
  });
  fs.closeSync(out);
  return child;
}

async function stopApp(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) return;
    await sleep(150);
  }
  child.kill("SIGKILL");
  await sleep(200);
}

function appEnv({ port, runtime, keepSetupToken, setupToken }) {
  const env = {
    ...process.env,
    APP_ENV: "development",
    APP_DEBUG: "false",
    PORT: String(port),
    DATABASE_URL: `file:${path.join(runtime, "data", "contabase.db")}`,
    DATA_DIR: path.join(runtime, "data"),
    UPLOADS_DIR: path.join(runtime, "uploads"),
    APP_BASE_URL: `http://127.0.0.1:${port}`,
    CONTABASE_ACCESS_MODE: "local",
    CONTABASE_TIMEZONE: "America/Sao_Paulo",
    TZ: "America/Sao_Paulo",
    CONTABASE_FEATURE_INVESTMENTS: "false",
    CONTABASE_FEATURE_INVESTMENT_OPERATIONS: "false",
    CONTABASE_FEATURE_INVESTMENT_SETTLEMENTS: "false",
    AUTH_ENCRYPTION_KEY: AUTH_KEY,
    SECURITY_MASTER_KEY: MASTER_KEY,
    DISABLE_ADMIN_2FA_OVERRIDE: "false",
    ALLOWED_HOSTS: "",
    TRUSTED_PROXIES: "",
  };
  if (keepSetupToken) env.CONTABASE_SETUP_TOKEN = setupToken;
  return env;
}

async function validateStatic(outDir, reference) {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer(outDir);
  const browser = await chromium.launch({ headless: true });
  const pages = fs.readdirSync(path.join(outDir, "demo")).filter((file) => file.endsWith(".html")).sort();
  const failures = [];
  try {
    for (const [label, viewport, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "pt-BR", colorScheme: "dark", isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
      const page = await context.newPage();
      for (const file of pages) {
        const errors = [];
        const failed = [];
        const requests = [];
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("requestfailed", (r) => failed.push(r.url()));
        page.on("request", (r) => requests.push(r.url()));
        await page.goto(`${server.base}/demo/${file}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(250);
        const info = await page.evaluate(() => ({
          title: document.title,
          h1: document.querySelector("h1")?.innerText || "",
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          navs: [...document.querySelectorAll("[data-demo-nav]")].map((a) => a.getAttribute("href")),
          forms: [...document.querySelectorAll("form")].map((f) => f.getAttribute("action")),
          scripts: [...document.querySelectorAll("script")].map((s) => s.getAttribute("src")),
          html: document.documentElement.outerHTML,
          investments: document.querySelectorAll('[data-v2-nav-section="investments"], a[href="investimentos.html"]').length,
        }));
        const missing = info.navs.filter((href) => href && !href.startsWith("#") && !href.startsWith("http") && !fs.existsSync(path.join(outDir, "demo", href)));
        const badForms = info.forms.filter((action) => action !== "#");
        const badScripts = info.scripts.filter((src) => src !== "demo.js");
        const badTokens = /127\.0\.0\.1|localhost|csrf|request_id/i.test(info.html);
        const privateRequests = requests.filter((url) => {
          const p = new URL(url).pathname;
          return !p.startsWith("/demo/") && p !== "/favicon.ico";
        });
        if (errors.length || failed.length || info.overflow || missing.length || badForms.length || badScripts.length || badTokens || privateRequests.length) {
          failures.push({ label, file, errors, failed, overflow: info.overflow, missing, badForms, badScripts, badTokens, privateRequests });
        }
        page.removeAllListeners();
      }
      // Form opening on the transactions page.
      await page.goto(`${server.base}/demo/lancamentos.html`, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);
      const trigger = page.locator("[data-demo-new-transaction]:visible").first();
      if (!(await trigger.count())) failures.push({ label, file: "lancamentos.html", form: "trigger ausente" });
      else {
        await trigger.click();
        await page.waitForTimeout(350);
        const form = await page.evaluate(() => ({
          hidden: document.getElementById("demo-lancamento-container")?.hidden,
          title: document.querySelector("#lancamento-sheet-title")?.textContent,
          date: document.querySelector("#dataLancamento")?.value,
          saveType: document.querySelector("#demo-lancamento-container button[data-demo-submit]")?.getAttribute("type"),
          submits: document.querySelectorAll('#demo-lancamento-container button[type="submit"]').length,
        }));
        if (form.hidden || form.title !== "Nova despesa" || form.saveType !== "button" || form.submits !== 0) failures.push({ label, file: "lancamentos.html", form });
        const close = page.locator('#demo-lancamento-container [data-onclick="closeBottomSheet"]').first();
        if (await close.count()) await close.click();
        await page.waitForTimeout(200);
      }
      // Tabs navigation.
      await page.goto(`${server.base}/demo/metas.html`, { waitUntil: "networkidle" });
      await page.locator("#metas-tab-reservas").click();
      await page.waitForURL(/metas-reservas\.html/);
      await page.goto(`${server.base}/demo/relatorios.html`, { waitUntil: "networkidle" });
      await page.locator("a.reports-main-tab").filter({ hasText: "Extrato" }).first().click();
      await page.waitForURL(/relatorios-extrato\.html/);
      // Contas must be the obligations page.
      await page.goto(`${server.base}/demo/contas.html`, { waitUntil: "networkidle" });
      const contas = await page.evaluate(() => ({ h1: document.querySelector("h1")?.innerText, text: document.body.innerText.includes("Obrigações do período") }));
      if (contas.h1 !== "Contas" || !contas.text) failures.push({ label, file: "contas.html", contas });
      // Mobile menu.
      if (mobile) {
        await page.goto(`${server.base}/demo/painel.html`, { waitUntil: "networkidle" });
        await page.locator("[data-v2-menu-trigger]").first().click();
        await page.waitForTimeout(250);
        const open = await page.evaluate(() => !!document.querySelector("[data-v2-menu-dialog]")?.open);
        if (!open) failures.push({ label, file: "painel.html", menu: "não abriu" });
      }
      await context.close();
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "demo", "manifest.json"), "utf8"));
    if (manifest.screens.length !== 8 || manifest.screens.some((screen) => screen.id === "investimentos")) {
      failures.push({ manifest: "esperadas 8 telas sem Investimentos", screens: manifest.screens.map((s) => s.id) });
    }
    for (const screen of manifest.screens) {
      for (const device of ["desktop", "mobile"]) {
        const file = path.join(outDir, "screenshots", device, `${screen.id}.webp`);
        if (!fs.existsSync(file)) {
          failures.push({ screenshot: file, error: "ausente" });
          continue;
        }
        try {
          const out = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
          const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
          const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
          const expected = device === "desktop" ? 1440 : 390;
          if (width !== expected || !height) failures.push({ screenshot: file, width, height, expected });
        } catch (error) {
          failures.push({ screenshot: file, error: "não foi possível ler dimensões (sips)" });
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures.length) throw new Error("validação estática falhou:\n" + JSON.stringify(failures.slice(0, 8), null, 2));
  log(`validação estática OK: ${pages.length} páginas, 8 telas × 2 capturas`);
}

async function waitIframe(page, device, suffix, kind) {
  await page.waitForFunction(({ device, suffix, kind }) => {
    const el = document.querySelector(`[data-demo-frame="${device}"]`);
    if (!el) return false;
    try {
      const win = el.contentWindow;
      if (!win || !win.location.pathname.endsWith("/" + suffix)) return false;
      if (win.document.readyState === "loading") return false;
      if (kind === "mobile" && win.innerWidth > 500) return false;
      if (kind === "desktop" && win.innerWidth < 1000) return false;
      return true;
    } catch (error) { return false; }
  }, { device, suffix, kind }, { timeout: 20000 });
  const handle = await page.locator(`[data-demo-frame="${device}"]`).elementHandle();
  return handle.contentFrame();
}

async function validateLanding(reference) {
  const { chromium } = loadPlaywright();
  const server = await startStaticServer(PUBLIC_DIR);
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const [label, viewport, mobile] of [["desktop", { width: 1440, height: 1000 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "pt-BR", colorScheme: "dark", isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      const failed = [];
      page.on("console", (m) => { if (m.type() === "error" && !/wa\.alpesdata\.app|vitals\.js/i.test(m.text())) errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("requestfailed", (r) => { if (!/wa\.alpesdata\.app|vitals\.js/i.test(r.url())) failed.push(r.url()); });
      await page.goto(`${server.base}/index.html#telas`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      await page.locator("#telas").scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      const base = await page.evaluate(() => ({
        options: [...document.querySelectorAll("[data-demo-screen-select] option")].map((o) => o.value),
        invests: !!document.querySelector('[data-demo-screen-select] option[value="investimentos"]'),
        lede: document.querySelector("#telas .section-lede")?.textContent || "",
        desktopPressed: document.querySelector('[data-demo-device="desktop"]')?.getAttribute("aria-pressed"),
        mobilePressed: document.querySelector('[data-demo-device="mobile"]')?.getAttribute("aria-pressed"),
      }));
      if (base.options.length !== 8 || base.invests || !base.lede.includes("Demonstração parcial") || !base.lede.includes("não é a versão completa")) {
        failures.push({ label, base });
      }
      const device = mobile ? "mobile" : "desktop";
      const kind = mobile ? "mobile" : "desktop";
      let frame = await waitIframe(page, device, "painel.html", kind);
      const noInvest = await frame.evaluate(() => document.querySelectorAll('[data-v2-nav-section="investments"], a[href="investimentos.html"]').length);
      if (noInvest) failures.push({ label, navInvest: noInvest });
      await page.selectOption("[data-demo-screen-select]", "contas");
      frame = await waitIframe(page, device, "contas.html", kind);
      const contas = await frame.evaluate(() => ({
        h1: document.querySelector("h1")?.innerText,
        text: document.body.innerText.includes("Obrigações do período"),
        main: [...document.querySelectorAll(".cb-v2-nav-link")].filter((a) => a.textContent.trim() === "Contas").map((a) => ({ href: a.getAttribute("href"), active: a.classList.contains("is-active") })),
        settings: [...document.querySelectorAll(".cb-v2-nav-sub-link")].filter((a) => a.textContent.trim() === "Contas").map((a) => a.getAttribute("href")),
      }));
      if (contas.h1 !== "Contas" || !contas.text || !contas.main.some((item) => item.href === "contas.html" && item.active) || !contas.settings.includes("configuracoes-contas.html")) {
        failures.push({ label, contas });
      }
      await page.selectOption("[data-demo-screen-select]", "lancamentos");
      frame = await waitIframe(page, device, "lancamentos.html", kind);
      if (mobile) {
        await page.evaluate(() => { const phone = document.querySelector(".lp-demo-phone"); if (phone) phone.scrollIntoView({ block: "center" }); });
        await page.waitForTimeout(300);
      }
      const trigger = frame.locator('[data-demo-new-transaction]:visible').first();
      if (!(await trigger.count())) failures.push({ label, form: "trigger ausente" });
      else {
        await trigger.click();
        await page.waitForTimeout(500);
        const form = await frame.evaluate(() => ({
          hidden: document.getElementById("demo-lancamento-container")?.hidden,
          title: document.querySelector("#lancamento-sheet-title")?.textContent,
          date: document.querySelector("#dataLancamento")?.value,
          saveType: document.querySelector("#demo-lancamento-container button[data-demo-submit]")?.getAttribute("type"),
          submits: document.querySelectorAll('#demo-lancamento-container button[type="submit"]').length,
        }));
        if (form.hidden || form.title !== "Nova despesa" || form.saveType !== "button" || form.submits !== 0) failures.push({ label, form });
        const close = frame.locator('#demo-lancamento-container [data-onclick="closeBottomSheet"]').first();
        if (await close.count()) await close.click();
      }
      if (errors.length || failed.length) failures.push({ label, errors, failed });
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures.length) throw new Error("validação da landing page falhou:\n" + JSON.stringify(failures.slice(0, 8), null, 2));
  log("validação da landing page OK: 8 telas, sem Investimentos, Contas em /contas, formulário de lançamento");
}

async function compareTrees(outDir) {
  const differences = [];
  const webpPairs = [];
  const pairs = [
    ["demo", path.join(outDir, "demo"), path.join(PUBLIC_DIR, "demo")],
    ["screenshots/desktop", path.join(outDir, "screenshots", "desktop"), path.join(PUBLIC_DIR, "screenshots", "desktop")],
    ["screenshots/mobile", path.join(outDir, "screenshots", "mobile"), path.join(PUBLIC_DIR, "screenshots", "mobile")],
  ];
  for (const [label, nextRoot, currentRoot] of pairs) {
    const next = listFiles(nextRoot);
    const current = listFiles(currentRoot);
    const all = [...new Set([...next, ...current])].sort();
    for (const rel of all) {
      const nextFile = path.join(nextRoot, rel);
      const currentFile = path.join(currentRoot, rel);
      if (!fs.existsSync(currentFile)) { differences.push(`${label}/${rel}: ausente no publicado`); continue; }
      if (!fs.existsSync(nextFile)) { differences.push(`${label}/${rel}: ausente na regeneração`); continue; }
      if (rel.endsWith(".html")) {
        const a = normalizeHtml(fs.readFileSync(currentFile, "utf8"));
        const b = normalizeHtml(fs.readFileSync(nextFile, "utf8"));
        if (a !== b) {
          let i = 0;
          while (i < a.length && i < b.length && a[i] === b[i]) i++;
          differences.push(`${label}/${rel}: HTML normalizado difere em ${i}: atual=${JSON.stringify(a.slice(i, i + 180))} novo=${JSON.stringify(b.slice(i, i + 180))}`);
        }
      } else {
        const a = fs.readFileSync(currentFile);
        const b = fs.readFileSync(nextFile);
        if (!a.equals(b)) {
          if (rel.endsWith(".webp")) webpPairs.push([`${label}/${rel}`, currentFile, nextFile]);
          else differences.push(`${label}/${rel}: bytes diferem`);
        }
      }
    }
  }
  if (webpPairs.length) {
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      for (const [label, currentFile, nextFile] of webpPairs) {
        const a = fs.readFileSync(currentFile).toString("base64");
        const b = fs.readFileSync(nextFile).toString("base64");
        const result = await page.evaluate(async ({ a, b }) => {
          async function load(data) {
            const img = new Image();
            img.src = "data:image/webp;base64," + data;
            await img.decode();
            return img;
          }
          const first = await load(a);
          const second = await load(b);
          if (first.naturalWidth !== second.naturalWidth || first.naturalHeight !== second.naturalHeight) {
            return { size: [first.naturalWidth, first.naturalHeight, second.naturalWidth, second.naturalHeight] };
          }
          const canvas = document.createElement("canvas");
          canvas.width = first.naturalWidth;
          canvas.height = first.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(first, 0, 0);
          const one = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(second, 0, 0);
          const two = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0, max = 0;
          for (let i = 0; i < one.length; i += 4) {
            const delta = Math.max(Math.abs(one[i] - two[i]), Math.abs(one[i + 1] - two[i + 1]), Math.abs(one[i + 2] - two[i + 2]));
            if (delta > 8) { count++; if (delta > max) max = delta; }
          }
          return { width: canvas.width, height: canvas.height, pixels: canvas.width * canvas.height, count, max };
        }, { a, b });
        if (result.size) {
          differences.push(`${label}: dimensões diferem ${JSON.stringify(result.size)}`);
          continue;
        }
        const allowed = Math.max(100, Math.floor(result.pixels * 0.00005));
        if (result.count > allowed || result.max > 32) differences.push(`${label}: ${result.count} px diferem (máx ${result.max}, limite ${allowed})`);
        else log(`${label}: ruído de renderização tolerado (${result.count} px, máx ${result.max})`);
      }
    } finally {
      await browser.close();
    }
  }
  return differences;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage() + "\n");
    return;
  }
  const source = path.resolve(args.source || DEFAULT_SOURCE);
  const commit = args.commit || DEFAULT_COMMIT;
  const reference = referenceInfo();
  if (args.referenceMonth && args.referenceMonth !== reference.key) {
    throw new Error("A demonstração usa o mês corrente. Execute novamente no mês desejado em vez de forçar --reference-month.");
  }
  if (!fs.existsSync(source)) throw new Error("Repositório fonte não encontrado: " + source);
  try {
    run("git", ["-C", source, "cat-file", "-e", `${commit}^{commit}`]);
  } catch (error) {
    throw new Error("Commit não encontrado no repositório fonte: " + commit);
  }
  for (const [command, args0] of [["go", ["version"]], ["sqlite3", ["-version"]], ["node", ["--version"]]]) {
    try { run(command, args0); } catch { throw new Error(`Dependência ausente: ${command}`); }
  }
  loadPlaywright();

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "contabase-demo-refresh-"));
  const worktree = path.join(tempRoot, "src");
  const runtime = path.join(tempRoot, "runtime");
  const statePath = path.join(runtime, "state.json");
  const outDir = path.join(runtime, args.check ? "check-output" : "output");
  const setupToken = crypto.randomBytes(32).toString("hex");
  ensureDir(runtime);
  ensureDir(path.join(runtime, "data"));
  ensureDir(path.join(runtime, "uploads"));
  let app = null;
  let appPort = null;
  const appLog = path.join(runtime, "app.log");
  try {
    log(`fonte ${source} @ ${commit}`);
    log(`mês de referência ${reference.key}`);
    run("git", ["-C", source, "worktree", "add", "--detach", worktree, commit], { stdio: "inherit" });
    const mainGo = path.join(worktree, "cmd", "server", "main.go");
    const sourceCode = fs.readFileSync(mainGo, "utf8");
    if (!sourceCode.includes('newHTTPServer(":"+port')) throw new Error("não foi possível localizar o listener do servidor para fixar em 127.0.0.1");
    fs.writeFileSync(mainGo, sourceCode.replace('newHTTPServer(":"+port', 'newHTTPServer("127.0.0.1:"+port'));
    const version = fs.readFileSync(path.join(worktree, "VERSION"), "utf8").trim();
    log("compilando ContaBase temporário");
    run("go", ["build", "-o", path.join(runtime, "contabase"), "./cmd/server"], { cwd: worktree, stdio: "inherit" });

    appPort = await freePort();
    const base = `http://127.0.0.1:${appPort}`;
    const envWithToken = appEnv({ port: appPort, runtime, keepSetupToken: true, setupToken });
    app = startApp({ binary: path.join(runtime, "contabase"), cwd: worktree, env: envWithToken, logPath: appLog });
    await waitForHealth(base);
    log("setup inicial do workspace sintético");
    await setupDemo({ base, statePath, setupToken, email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Horizonte Digital" });

    await stopApp(app);
    app = startApp({ binary: path.join(runtime, "contabase"), cwd: worktree, env: appEnv({ port: appPort, runtime, keepSetupToken: false, setupToken }), logPath: appLog });
    await waitForHealth(base);
    log("populando dados sintéticos");
    const summary = await seedDemo({ base, dbPath: path.join(runtime, "data", "contabase.db"), statePath, reference, email: DEMO_EMAIL, password: DEMO_PASSWORD });

    // A restart triggers the idempotent monthly reserve contribution before capture.
    await stopApp(app);
    app = startApp({ binary: path.join(runtime, "contabase"), cwd: worktree, env: appEnv({ port: appPort, runtime, keepSetupToken: false, setupToken }), logPath: appLog });
    await waitForHealth(base);
    let automaticReady = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rows = sqliteJson(path.join(runtime, "data", "contabase.db"), `select b.id,
        (select count(*) from box_virtual_ledger l where l.box_id=b.id and l.description='Aporte Automático') as c
        from boxes b`);
      if (rows.length && rows.every((row) => row.c === 1)) { automaticReady = true; break; }
      await sleep(250);
    }
    if (!automaticReady) throw new Error("a recarga automática das reservas não ficou estável em 10s");
    await sleep(300);

    log("gerando páginas estáticas e capturas");
    const manifest = await generateDemo({
      base,
      appSrc: worktree,
      outDir,
      statePath,
      reference,
      source: { commit, version },
    });
    await stopApp(app);
    app = null;

    await validateStatic(outDir, reference);
    if (args.check) {
      const differences = await compareTrees(outDir);
      if (differences.length) {
        throw new Error("--check encontrou diferenças:\n" + differences.slice(0, 30).join("\n"));
      }
      log("--check OK: regeneração idêntica ao publicado (HTML normalizado + assets/capturas exatos)");
      log(`resumo: ${JSON.stringify({ commit, version, reference: reference.key, screens: manifest.screens.length, summary })}`);
      return;
    }

    removeDir(path.join(PUBLIC_DIR, "demo"));
    copyDir(path.join(outDir, "demo"), path.join(PUBLIC_DIR, "demo"));
    removeDir(path.join(PUBLIC_DIR, "screenshots", "desktop"));
    removeDir(path.join(PUBLIC_DIR, "screenshots", "mobile"));
    copyDir(path.join(outDir, "screenshots", "desktop"), path.join(PUBLIC_DIR, "screenshots", "desktop"));
    copyDir(path.join(outDir, "screenshots", "mobile"), path.join(PUBLIC_DIR, "screenshots", "mobile"));
    for (const entry of fs.readdirSync(path.join(PUBLIC_DIR, "screenshots"), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".webp")) fs.rmSync(path.join(PUBLIC_DIR, "screenshots", entry.name), { force: true });
    }
    log("public/demo e public/screenshots atualizados");

    await validateLanding(reference);
    log(`resumo: ${JSON.stringify({ commit, version, reference: reference.key, screens: manifest.screens.length, summary })}`);
  } finally {
    if (app) await stopApp(app);
    try {
      run("git", ["-C", source, "worktree", "remove", "--force", worktree], { stdio: "ignore" });
    } catch (error) {
      log("aviso: não foi possível remover o worktree temporário: " + worktree);
    }
    if (args.keepTemp) {
      log("temporários mantidos em " + tempRoot);
    } else {
      removeDir(tempRoot);
    }
    if (appPort) {
      try { run("lsof", ["-nP", `-iTCP:${appPort}`, "-sTCP:LISTEN"]); } catch { /* port closed */ }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[demo] ERRO: ${error.message}\n`);
  process.exit(1);
});
