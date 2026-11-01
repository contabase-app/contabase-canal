import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir, ensureDir, loadPlaywright, log, removeDir, startStaticServer } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.join(HERE, "runtime");

const SCREENS = [
  { id: "painel", label: "Painel", route: "/", page: "painel.html", shot: true, prepare: "chart" },
  { id: "lancamentos", label: "Lançamentos", route: "/lancamentos", page: "lancamentos.html", shot: true },
  { id: "contas", label: "Contas", route: "/contas", page: "contas.html", shot: true },
  { id: "configuracoes-contas", route: "/configuracoes/contas", page: "configuracoes-contas.html", parent: "contas" },
  { id: "cartoes", label: "Cartões", route: "/configuracoes/cartoes", page: "cartoes.html", shot: true },
  { id: "faturas", label: "Faturas", route: "/faturas", page: "faturas.html", shot: true },
  { id: "metas", label: "Metas e Reservas", route: "/metas", page: "metas.html", shot: true, aliases: ["metas-reservas.html"] },
  { id: "metas-reservas", route: "/metas?aba=reservas", page: "metas-reservas.html", parent: "metas" },
  { id: "relatorios", label: "Relatórios", route: "/relatorios", page: "relatorios.html", shot: true, aliases: ["relatorios-extrato.html"] },
  { id: "relatorios-extrato", route: "/relatorios?tab=extrato", page: "relatorios-extrato.html", parent: "relatorios" },
  { id: "usuarios", label: "Multiusuário", route: "/admin/usuarios", page: "usuarios.html", shot: true },
];

const CSP = "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";

function sanitizeInPage(cfg) {
  const doc = document;
  const routeMap = {
    "/": "painel.html",
    "/lancamentos": "lancamentos.html",
    "/contas": "contas.html",
    "/configuracoes/contas": "configuracoes-contas.html",
    "/configuracoes/cartoes": "cartoes.html",
    "/faturas": "faturas.html",
    "/metas": "metas.html",
    "/relatorios": "relatorios.html",
    "/admin/usuarios": "usuarios.html",
  };
  function mapHref(raw) {
    if (!raw) return null;
    if (raw.startsWith("#")) return raw;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return null;
    let url;
    try { url = new URL(raw, location.href); } catch { return null; }
    if (url.origin !== location.origin) return null;
    let file = routeMap[url.pathname] || null;
    if (url.pathname === "/metas") file = url.searchParams.get("aba") === "reservas" ? "metas-reservas.html" : "metas.html";
    if (url.pathname === "/relatorios") file = url.searchParams.get("tab") === "extrato" ? "relatorios-extrato.html" : "relatorios.html";
    return file;
  }

  doc.querySelectorAll("script,noscript").forEach((el) => el.remove());
  ["#htmx-indicator", "#global-feedback", "#bottom-sheet-container", "#picker-modal-container", "#workspaceDrawer", "#drawerBackdrop", "#payment-confirm-modal", "#global-confirm-modal", "#global-delete-scope-modal", "#invoice-move-scope-modal"].forEach((sel) => {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  });
  doc.querySelectorAll("[data-contabase-overlay]").forEach((el) => el.remove());
  doc.querySelectorAll('meta[name="csrf-token"], meta[name="htmx-config"], meta[http-equiv="refresh"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[rel="manifest"], link[rel="preload"], link[rel="preconnect"], link[rel="dns-prefetch"]').forEach((el) => el.remove());
  doc.querySelectorAll('input[name*="csrf"], input[name="request_id"], input[name*="token"]').forEach((el) => el.remove());
  doc.querySelectorAll(".cb-v2-setup-notice").forEach((el) => el.remove());
  doc.querySelectorAll("dialog:not([data-v2-menu-dialog])").forEach((el) => el.remove());

  doc.querySelectorAll('[hx-get*="/transacoes/nova"]').forEach((el) => {
    const action = el.getAttribute("hx-get") || "";
    if (/tipo=(receita|transferencia)/.test(action)) return;
    el.setAttribute("data-demo-new-transaction", "despesa");
  });

  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      if (n.startsWith("hx-") || n.startsWith("on") || n.includes("csrf") || n.includes("request-id") || n.includes("session")) el.removeAttribute(attr.name);
    }
  }

  doc.querySelectorAll("[data-v2-nav-group]").forEach((group) => {
    const toggle = group.querySelector("[data-v2-nav-group-toggle]");
    const panel = group.querySelector("[data-v2-nav-group-panel]");
    if (!toggle || !panel) return;
    group.classList.add("is-open");
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  });

  doc.querySelectorAll(".wallet-category-row").forEach((row) => {
    const name = row.querySelector(".wallet-category-head strong")?.textContent.trim() || "";
    if (!name) return;
    let hash = 2166136261;
    for (let i = 0; i < name.length; i++) {
      hash ^= name.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    row.setAttribute("data-tone", String(((hash >>> 0) % 5) + 1));
  });

  const footer = doc.querySelector(".cb-v2-footer");
  if (footer) {
    const clock = [...footer.querySelectorAll("p")].find((p) => p.textContent.includes("Sistema:"));
    if (clock) clock.textContent = `Sistema: ${cfg.footerTime} · America/Sao_Paulo`;
  }

  function replaceTab(id, href, active) {
    const el = doc.getElementById(id);
    if (!el) return;
    const a = doc.createElement("a");
    for (const attr of el.attributes) {
      const n = attr.name.toLowerCase();
      if (n === "type" || n === "role" || n === "aria-controls" || n === "aria-selected" || n.startsWith("hx-")) continue;
      a.setAttribute(attr.name, attr.value);
    }
    a.setAttribute("href", href);
    a.setAttribute("data-demo-nav", "");
    if (active) a.setAttribute("aria-current", "page");
    a.innerHTML = el.innerHTML;
    el.replaceWith(a);
  }

  doc.querySelectorAll('a[href^="?"]').forEach((a) => {
    if (a.classList.contains("reports-main-tab")) {
      const text = a.textContent.trim();
      if (/Extrato/i.test(text)) {
        a.setAttribute("href", "relatorios-extrato.html");
        a.setAttribute("data-demo-nav", "");
        if (cfg.screen === "relatorios-extrato") a.setAttribute("aria-current", "page");
      } else if (/Fluxo/i.test(text)) {
        a.setAttribute("href", "relatorios.html");
        a.setAttribute("data-demo-nav", "");
        if (cfg.screen === "relatorios") a.setAttribute("aria-current", "page");
      }
      return;
    }
    if (/Ver Extrato completo/i.test(a.textContent)) {
      a.setAttribute("href", "relatorios-extrato.html");
      a.setAttribute("data-demo-nav", "");
      return;
    }
    a.setAttribute("href", "#");
    a.setAttribute("data-demo-disabled", "");
    a.setAttribute("aria-disabled", "true");
  });

  doc.querySelectorAll("a[href]").forEach((a) => {
    if (a.hasAttribute("data-demo-nav") || a.hasAttribute("data-demo-disabled")) return;
    const raw = a.getAttribute("href");
    const mapped = mapHref(raw);
    a.removeAttribute("target");
    if (mapped && mapped !== "#") {
      a.setAttribute("href", mapped);
      a.setAttribute("data-demo-nav", "");
    } else if (raw && raw.startsWith("#")) {
      a.setAttribute("href", raw);
    } else {
      a.setAttribute("href", "#");
      a.setAttribute("data-demo-disabled", "");
      a.setAttribute("aria-disabled", "true");
    }
  });

  if (cfg.screen === "metas" || cfg.screen === "metas-reservas") {
    const tablist = doc.getElementById("metas-tabs")?.querySelector('[role="tablist"]');
    if (tablist) { tablist.removeAttribute("role"); tablist.setAttribute("role", "group"); }
    replaceTab("metas-tab-limites", "metas.html", cfg.screen === "metas");
    replaceTab("metas-tab-reservas", "metas-reservas.html", cfg.screen === "metas-reservas");
  }

  doc.querySelectorAll("form").forEach((form) => {
    form.setAttribute("action", "#");
    form.setAttribute("method", "get");
    form.setAttribute("data-demo-form", "");
    form.removeAttribute("enctype");
    form.removeAttribute("target");
  });
  doc.querySelectorAll('form button[type="submit"], form input[type="submit"], form button:not([type])').forEach((button) => {
    button.setAttribute("type", "button");
    button.setAttribute("data-demo-submit", "");
  });

  doc.body.setAttribute("data-demo-page", cfg.screen);
  if (cfg.parent) doc.body.setAttribute("data-demo-parent", cfg.parent);
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

function trimBlankIndent(html) {
  return html.replace(/^[ \t]+$/gm, "");
}

function injectHead(html) {
  const robots = '<meta name="robots" content="noindex,nofollow">';
  const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  let out = html;
  const charset = /<meta[^>]+charset[^>]*>/i.exec(out);
  if (charset) {
    out = out.slice(0, charset.index + charset[0].length) + robots + csp + out.slice(charset.index + charset[0].length);
  } else {
    out = out.replace(/<head[^>]*>/i, (m) => m + robots + csp);
  }
  const assets = '<link rel="stylesheet" href="demo.css"><link rel="stylesheet" href="assets/css/sheet-form.css"><script src="demo.js" defer></script>';
  return out.replace(/<\/head>/i, assets + "</head>");
}

function cleanHtml(html, base) {
  return html
    .replaceAll(base, "")
    .replaceAll("/assets/", "assets/")
    .replaceAll("/workspace/colors.css", "assets/workspace-colors.css");
}

async function renderForm(page, base, reference) {
  const response = await page.context().request.get(base + "/transacoes/nova?tipo=despesa", { headers: { "HX-Request": "true" } });
  if (!response.ok()) throw new Error("falha ao obter o formulário de lançamento: HTTP " + response.status());
  const raw = (await response.text()).replace(/<link[^>]*sheet-form\.css[^>]*>/gi, "");
  const rendered = await page.evaluate((html) => {
    const host = document.createElement("div");
    host.id = "demo-form-render-host";
    host.innerHTML = html;
    document.body.appendChild(host);
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
    return host.innerHTML;
  }, raw);
  const clean = await page.evaluate(({ html, fallbackDate }) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    host.querySelectorAll("script,noscript,link[rel=stylesheet]").forEach((el) => el.remove());
    host.querySelectorAll('input[name*="csrf"], input[name="request_id"], input[name*="token"]').forEach((el) => el.remove());
    for (const el of host.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        const n = attr.name.toLowerCase();
        if (n.startsWith("hx-") || n.startsWith("on")) el.removeAttribute(attr.name);
      }
    }
    host.querySelectorAll("form").forEach((form) => {
      form.setAttribute("action", "#");
      form.setAttribute("method", "get");
      form.setAttribute("data-demo-form", "");
      form.removeAttribute("enctype");
      form.removeAttribute("target");
    });
    host.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])').forEach((button) => {
      button.setAttribute("type", "button");
      button.setAttribute("data-demo-submit", "");
    });
    const date = host.querySelector("#dataLancamento");
    if (date) date.setAttribute("value", date.getAttribute("data-today-civil") || fallbackDate);
    const scope = host.querySelector(".sheet-lancamento-scope");
    if (scope) {
      scope.setAttribute("data-demo-lancamento-sheet", "despesa");
      const backdrop = scope.querySelector(":scope > .absolute");
      if (backdrop) backdrop.setAttribute("data-demo-lancamento-backdrop", "");
    }
    host.querySelectorAll("[src]").forEach((el) => el.setAttribute("src", (el.getAttribute("src") || "").replaceAll("/assets/", "assets/")));
    host.querySelectorAll("[srcset]").forEach((el) => el.setAttribute("srcset", (el.getAttribute("srcset") || "").replaceAll("/assets/", "assets/")));
    host.querySelectorAll("[style]").forEach((el) => el.setAttribute("style", (el.getAttribute("style") || "").replaceAll("/assets/", "assets/")));
    host.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href === "/configuracoes/contas") a.setAttribute("href", "configuracoes-contas.html");
      else if (href === "/contas") a.setAttribute("href", "contas.html");
      else if (href === "/metas") a.setAttribute("href", "metas.html");
      else if (href.startsWith("/assets/")) a.setAttribute("href", href.replace("/assets/", "assets/"));
      else if (href && !href.startsWith("#")) { a.setAttribute("href", "#"); a.setAttribute("data-demo-disabled", ""); }
    });
    return host.innerHTML;
  }, { html: rendered, fallbackDate: reference.firstDay });
  return `<div id="demo-lancamento-container" hidden>${clean}</div>`;
}

async function pngToWebp(browser, pngPath, webpPath) {
  const page = await browser.newPage();
  try {
    const png = fs.readFileSync(pngPath);
    const b64 = png.toString("base64");
    const webpB64 = await page.evaluate(async ({ b64 }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", 0.9).split(",")[1];
    }, { b64 });
    fs.writeFileSync(webpPath, Buffer.from(webpB64, "base64"));
  } finally {
    await page.close();
  }
}

export async function generateDemo({ base, appSrc, outDir, statePath, reference, source }) {
  const { chromium } = loadPlaywright();
  const demoDir = path.join(outDir, "demo");
  const pngDir = path.join(outDir, "png");
  const screenshotsDir = path.join(outDir, "screenshots");
  removeDir(outDir);
  ensureDir(demoDir);
  ensureDir(path.join(demoDir, "assets"));
  ensureDir(pngDir);
  ensureDir(path.join(screenshotsDir, "desktop"));
  ensureDir(path.join(screenshotsDir, "mobile"));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: statePath,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const footerTime = `${reference.firstDayBR} 09:00`;
  try {
    for (const screen of SCREENS) {
      log("renderizando " + screen.id);
      await page.goto(base + screen.route, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      if (screen.prepare === "chart") {
        const evolution = page.locator("text=Ver evolução").first();
        if (await evolution.count()) {
          await evolution.click();
          await page.waitForTimeout(600);
          const sixMonths = page.locator("text=6 meses").first();
          if (await sixMonths.count()) { await sixMonths.click(); await page.waitForTimeout(1300); }
        }
      }
      const raw = await page.evaluate(sanitizeInPage, {
        screen: screen.id,
        parent: screen.parent || "",
        footerTime,
      });
      const html = injectHead(cleanHtml(raw, base));
      fs.writeFileSync(path.join(demoDir, screen.page), trimBlankIndent(html));
    }

    const formBlock = await renderForm(page, base, reference);
    for (const screen of SCREENS) {
      const file = path.join(demoDir, screen.page);
      const html = fs.readFileSync(file, "utf8");
      fs.writeFileSync(file, trimBlankIndent(html.replace("</body>", formBlock + "\n</body>")));
    }

    const colors = await context.request.get(base + "/workspace/colors.css");
    if (!colors.ok()) throw new Error("falha ao capturar workspace/colors.css");
    fs.writeFileSync(path.join(demoDir, "assets", "workspace-colors.css"), await colors.text());
    for (const dir of ["css", "fonts", "branding", "institutions"]) {
      copyDir(path.join(appSrc, "assets", dir), path.join(demoDir, "assets", dir));
    }
    for (const entry of fs.readdirSync(path.join(appSrc, "assets"), { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === ".DS_Store") continue;
      fs.copyFileSync(path.join(appSrc, "assets", entry.name), path.join(demoDir, "assets", entry.name));
    }
    fs.copyFileSync(path.join(RUNTIME, "demo.css"), path.join(demoDir, "demo.css"));
    fs.copyFileSync(path.join(RUNTIME, "demo.js"), path.join(demoDir, "demo.js"));

    const cssDir = path.join(demoDir, "assets", "css");
    for (const entry of fs.readdirSync(cssDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".css")) continue;
      const cssPath = path.join(cssDir, entry.name);
      const css = fs.readFileSync(cssPath, "utf8").replaceAll("/assets/", "../");
      fs.writeFileSync(cssPath, css);
    }

    const manifest = {
      source: { commit: source.commit, version: source.version },
      reference: { month: reference.key, label: reference.label },
      screens: SCREENS.filter((screen) => screen.shot).map((screen) => ({
        id: screen.id,
        label: screen.label,
        route: screen.route,
        page: "/demo/" + screen.page,
        aliases: (screen.aliases || []).map((alias) => "/demo/" + alias),
        screenshots: {
          desktop: "/screenshots/desktop/" + screen.id + ".webp",
          mobile: "/screenshots/mobile/" + screen.id + ".webp",
        },
      })),
    };
    fs.writeFileSync(path.join(demoDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(path.join(demoDir, "preview-data.js"), `window.CONTABASE_DEMO_DATA = ${JSON.stringify(manifest, null, 2)};\n`);

    const staticServer = await startStaticServer(outDir);
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "dark", reducedMotion: "reduce" });
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "dark", isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const desktopPage = await desktopCtx.newPage();
    const mobilePage = await mobileCtx.newPage();
    try {
      for (const screen of SCREENS.filter((item) => item.shot)) {
        const url = staticServer.base + "/demo/" + screen.page;
        await desktopPage.goto(url, { waitUntil: "networkidle" });
        await desktopPage.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}" });
        await desktopPage.evaluate(async () => {
          if (document.fonts) await document.fonts.ready;
          await Promise.all([...document.images].map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; })));
        });
        await desktopPage.waitForTimeout(300);
        await desktopPage.screenshot({ path: path.join(pngDir, `${screen.id}-desktop.png`), fullPage: true, animations: "disabled" });
        await mobilePage.goto(url, { waitUntil: "networkidle" });
        await mobilePage.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}" });
        await mobilePage.addStyleTag({ content: "body{position:relative!important;padding-bottom:180px!important}.cb-v2-bottom-nav{position:absolute!important;bottom:12px!important}.cb-v2-fab{position:absolute!important;bottom:96px!important}" });
        await mobilePage.evaluate(async () => {
          if (document.fonts) await document.fonts.ready;
          await Promise.all([...document.images].map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; })));
        });
        await mobilePage.waitForTimeout(300);
        await mobilePage.screenshot({ path: path.join(pngDir, `${screen.id}-mobile.png`), fullPage: true, animations: "disabled" });
      }
    } finally {
      await desktopCtx.close();
      await mobileCtx.close();
      await staticServer.close();
    }

    const webpPageBrowser = await chromium.launch({ headless: true });
    try {
      for (const screen of SCREENS.filter((item) => item.shot)) {
        for (const device of ["desktop", "mobile"]) {
          const pngPath = path.join(pngDir, `${screen.id}-${device}.png`);
          const webpPath = path.join(screenshotsDir, device, `${screen.id}.webp`);
          await pngToWebp(webpPageBrowser, pngPath, webpPath);
        }
      }
    } finally {
      await webpPageBrowser.close();
    }
    removeDir(pngDir);
    log(`demo gerada: ${manifest.screens.length} telas × 2 dispositivos`);
    return manifest;
  } finally {
    await context.close();
    await browser.close();
  }
}

export { SCREENS };
