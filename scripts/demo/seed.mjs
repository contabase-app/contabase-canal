import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadPlaywright, log, sqliteJson } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "demo-data.json");

export async function setupDemo({ base, statePath, setupToken, email, password, name }) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(base + "/setup", { waitUntil: "networkidle" });
    await page.fill('input[name="setup_token"]', setupToken);
    await page.fill('input[name="name"]', name);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.selectOption('select[name="workspace_type"]', "personal");
    await Promise.all([
      page.waitForURL(base + "/", { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await context.storageState({ path: statePath });
    log("setup inicial concluído");
  } finally {
    await browser.close();
  }
}

export async function seedDemo({ base, dbPath, statePath, reference, email, password }) {
  const data = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: statePath,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const cookie = (await context.cookies(base)).find((item) => item.name === "contabase_csrf");
    if (!cookie) throw new Error("cookie CSRF ausente após o setup");
    const csrf = cookie.value;
    const request = context.request;
    const q = (sql) => sqliteJson(dbPath, sql);

    async function postForm(url, fields) {
      const res = await request.post(base + url, {
        form: fields,
        headers: { "X-CSRF-Token": csrf, "HX-Request": "true" },
        maxRedirects: 0,
      });
      return { status: res.status(), body: await res.text(), location: res.headers()["location"] || "" };
    }
    async function postMultipart(url, fields) {
      const res = await request.post(base + url, {
        multipart: fields,
        headers: { "X-CSRF-Token": csrf, "HX-Request": "true" },
      });
      return { status: res.status(), body: await res.text() };
    }
    function check(name, result, expectedText) {
      const ok = result.status === 200 && (!expectedText || result.body.includes(expectedText));
      if (!ok) {
        throw new Error(`${name} falhou (HTTP ${result.status}): ${result.body.slice(0, 280).replace(/\s+/g, " ")}`);
      }
    }

    const workspace = q("select id, name, theme_token from workspaces limit 1")[0];
    if (!workspace) throw new Error("workspace não encontrado após o setup");

    let result = await postForm("/admin/reautenticar", { current_password: password, return_to: "/admin/workspaces" });
    if (result.status !== 200) throw new Error("reautenticação administrativa falhou");
    result = await postForm("/admin/workspaces/editar", {
      workspace_id: workspace.id,
      name: data.workspace.name,
      description: data.workspace.description,
      type: "personal",
      theme_token: workspace.theme_token || "violeta",
      company_name: "",
      cnpj_cpf: "",
      address: "",
      phone: "",
      logo_light_url: "",
      logo_dark_url: "",
    });
    check("renomear workspace", result, "Workspace atualizado com sucesso");

    for (const account of data.accounts) {
      result = await postForm("/configuracoes/contas", {
        type: account.type,
        icon: "",
        initial_balance: account.initialBalance,
        provider_slug: account.provider,
        provider_custom_name: "",
        color: "",
      });
      check("criar conta " + account.name, result, "Conta criada com sucesso");
    }
    const accountRows = q("select id, name, type, color, icon, provider_slug from accounts where type != 'CREDIT_CARD' order by created_at");
    for (const account of accountRows) {
      const desired = data.accounts.find((item) => item.type === account.type)?.name || account.name;
      result = await postForm(`/configuracoes/contas/${account.id}/salvar`, {
        name: desired,
        type: account.type,
        color: account.color || "#6B7280",
        icon: account.icon || "",
        provider_slug: account.provider_slug || "",
        provider_custom_name: "",
      });
      if (result.status !== 200) throw new Error("renomear conta falhou: " + desired);
    }
    const checking = q("select id from accounts where type='CHECKING' limit 1")[0];
    if (!checking) throw new Error("conta corrente não encontrada");
    for (const card of data.cards) {
      result = await postForm("/configuracoes/cartoes", {
        credit_limit: card.limit,
        closing_day: card.closingDay,
        due_day: card.dueDay,
        default_payment_account_id: checking.id,
        provider_slug: card.provider,
        provider_custom_name: "",
        icon: "",
        color: "",
      });
      check("criar cartão " + card.name, result, "Cartão criado com sucesso");
    }
    const cardRows = q("select id, name, color, icon, provider_slug from accounts where type='CREDIT_CARD' order by created_at");
    for (const row of cardRows) {
      const card = data.cards.find((item) => item.provider === row.provider_slug);
      if (!card) continue;
      result = await postForm(`/configuracoes/cartoes/${row.id}/salvar`, {
        name: card.name,
        credit_limit: card.limit,
        closing_day: card.closingDay,
        due_day: card.dueDay,
        default_payment_account_id: checking.id,
        color: row.color || "#6B7280",
        icon: row.icon || "",
        provider_slug: row.provider_slug || "",
      });
      if (result.status !== 200) throw new Error("renomear cartão falhou: " + card.name);
    }

    const categoryRows = q("select id, name from categories");
    const accountRows2 = q("select id, name from accounts");
    const category = (name) => {
      const row = categoryRows.find((item) => item.name === name);
      if (!row) throw new Error("categoria ausente: " + name);
      return row.id;
    };
    const account = (name) => {
      const row = accountRows2.find((item) => item.name === name);
      if (!row) throw new Error("conta ausente: " + name);
      return row.id;
    };

    const baseFields = {
      destino_conta_id: "",
      escopo_edicao: "single",
      invoice_assignment_mode: "auto",
      permitir_excedente_caixinha: "0",
      anotacoes: "",
      contact_id: "",
      due_date: "",
      fatura_offset: "auto",
      parcelada: "off",
      parcelas: "2",
      lancamento_fixo: "off",
      recorrencia: "MONTHLY",
      total_occurrences: "",
      categoria_type: "EXPENSE",
      origem_tipo: "conta",
    };
    let txOk = 0;
    for (const [index, item] of data.transactions.entries()) {
      const month = reference.months[item.monthIndex];
      if (!month) throw new Error("mês de fixture inválido: " + item.monthIndex);
      const date = `${month}-${String(item.day).padStart(2, "0")}`;
      const payload = {
        ...baseFields,
        tipo: item.type,
        valor: item.amount,
        descricao: item.description,
        data: date,
        origem_conta_id: account(item.account),
        destino_conta_id: item.destination ? account(item.destination) : "",
        status_pagamento: item.status,
        categoria_id: item.category ? category(item.category) : "",
        categoria_type: item.type === "receita" ? "INCOME" : "EXPENSE",
        origem_tipo: item.origin === "cartao" ? "cartao" : "conta",
        parcelada: item.installments > 0 ? "on" : "off",
        parcelas: item.installments > 0 ? String(item.installments) : "2",
      };
      const res = await postMultipart("/transacoes", payload);
      const error = res.body.includes("border-rose-500/35") && res.body.includes("lancamento-form-error");
      if (res.status !== 200 || error) {
        throw new Error(`lançamento ${index + 1} (${item.description}, ${date}) falhou: ${res.body.slice(0, 220).replace(/\s+/g, " ")}`);
      }
      txOk++;
    }

    const invoiceRows = q(`select i.id as invoice_id, i.account_id, i.reference, date(i.due_date,'unixepoch') as due
      from invoices i where i.status='CLOSED' and i.reference < '${reference.key}' order by i.reference`);
    for (const invoice of invoiceRows) {
      result = await postForm("/cartoes/faturas/pagar", {
        invoice_id: invoice.invoice_id,
        account_id: invoice.account_id,
        payment_mode: "settle",
        confirm_settle: "1",
        payment_account_id: checking.id,
        payment_date: invoice.due,
      });
      if (result.status !== 200) throw new Error("pagamento de fatura falhou: " + invoice.reference);
    }

    for (const limit of data.limits) {
      result = await postForm("/metas/limite", {
        limit_id: "",
        tipo: "EXPENSE",
        category_id: category(limit.category),
        max_amount_monthly: limit.amount,
        icon_key: "gauge",
      });
      check("limite " + limit.category, result);
    }
    for (const box of data.boxes) {
      result = await postForm("/metas/caixinha", {
        box_id: "",
        tipo: "EXPENSE",
        name: box.name,
        category_id: "",
        target_amount: box.target,
        monthly_recharge: box.monthly,
        target_month: `${reference.targetYear}-${box.targetMonth}`,
        monthly_yield_rate: "0",
        icon_key: box.icon,
      });
      check("reserva " + box.name, result);
    }
    const boxRows = q("select id, name from boxes");
    for (const box of data.boxes) {
      const row = boxRows.find((item) => item.name === box.name);
      if (!row) throw new Error("reserva não encontrada: " + box.name);
      for (const amount of box.contributions) {
        result = await postForm("/metas/caixinha/aporte", {
          box_id: row.id,
          amount,
          _from_sheet: "0",
          note: "Aporte mensal programado",
        });
        if (result.status !== 200) throw new Error("aporte falhou: " + box.name);
      }
    }

    result = await postForm("/admin/reautenticar", { current_password: password, return_to: "/admin/usuarios" });
    if (result.status !== 200) throw new Error("reautenticação de usuários falhou");
    const demoUser = q("select id from users where email = ?".replace("?", `'${email.replaceAll("'", "''")}'`))[0];
    result = await postForm("/admin/usuarios/salvar", {
      user_id: demoUser.id,
      name: "Equipe Horizonte",
      email,
      role: "ADMIN",
      status: "active",
      workspace_ids: workspace.id,
      [`workspace_roles[${workspace.id}]`]: "ADMIN",
    });
    check("renomear usuário demo", result, "Usuário salvo com sucesso");
    for (const user of data.users) {
      result = await postForm("/admin/usuarios/salvar", {
        user_id: "",
        name: user.name,
        email: user.email,
        role: user.role,
        status: "pending",
        workspace_ids: workspace.id,
        [`workspace_roles[${workspace.id}]`]: user.role,
      });
      check("usuário " + user.name, result, "Usuário salvo com sucesso");
    }

    // Fixture metadata only: make the six-month chart cover the whole window.
    const accountIds = q("select id from accounts where type in ('CHECKING','SAVINGS','INVESTMENT')");
    for (const row of accountIds) {
      execSql(dbPath, `UPDATE accounts SET created_at = ${Number(reference.backdateUnix)} WHERE id = '${row.id.replaceAll("'", "''")}'`);
    }
    // Fixture metadata only: stable created_at ordering for list pages.
    execSql(dbPath, "UPDATE transactions SET created_at = 1700000000 + rowid, updated_at = 1700000000 + rowid");

    const summary = {
      workspace: data.workspace.name,
      accounts: q("select count(*) as c from accounts where type != 'CREDIT_CARD'")[0]?.c || 0,
      cards: q("select count(*) as c from accounts where type = 'CREDIT_CARD'")[0]?.c || 0,
      transactions: txOk,
      paidInvoices: invoiceRows.length,
      limits: data.limits.length,
      boxes: data.boxes.length,
      users: q("select count(*) as c from users")[0]?.c || 0,
    };
    log(`dados sintéticos prontos: ${JSON.stringify(summary)}`);
    await context.storageState({ path: statePath });
    return summary;
  } finally {
    await browser.close();
  }
}

function execSql(dbPath, sql) {
  execFileSync("sqlite3", [dbPath, sql]);
}
