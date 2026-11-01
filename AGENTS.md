# AGENTS.md - Contrato do Canal de Instalação

## Propósito
Repositório estático do canal público de instalação do ContaBase.
Servido via Cloudflare Pages em `get-contabase.pages.dev`.
Domínio futuro: `get.contabase.net`.

## Regras de Canal

### Canal pode mudar; versão fixa nunca muda
- `public/install.sh` (canal recomendado) pode ser atualizado para apontar para versões mais novas.
- `public/beta/install.sh` (canal beta) pode ser atualizado.
- `public/stable/install.sh` só deve existir quando houver release stable real.
- `public/vX.Y.Z/install.sh` e `public/vX.Y.Z-beta.N/install.sh` (versões fixas) são **imutáveis** depois de publicados. Nunca sobrescrever.

### Branch não é fonte pública de instalação
- Canal nunca aponta para `main`, `beta`, `dev`, `stable` ou `latest`.
- Canal sempre aponta para **tag/release** SemVer pública existente.

### Versionamento
- Beta: `vMAJOR.MINOR.PATCH-beta.N`
- Stable: `vMAJOR.MINOR.PATCH`
- Nunca usar `-internal` em versão pública.
- Nunca usar `latest`, `main`, `beta`, `dev` ou `stable` como versão fixa.

### Script de instalação real
- Código real de instalação está no repositório `contabase-app/contabase` (público).
- `install.sh` deste canal baixa o `install.sh` real da tag correspondente e executa localmente.
- O caminho é: `https://raw.githubusercontent.com/contabase-app/contabase/<VERSAO>/scripts/install.sh`
- Nunca incorporar lógica de instalação real aqui.

### Proibições
- Nunca apontar instalação para branch.
- Nunca sobrescrever versão fixa já publicada.
- Nunca publicar versão com `-internal`.
- Nunca usar `curl | bash` internamente.
- Nunca alterar repositórios `contabase-dev` ou `contabase` (público).

### Fluxo futuro
1. Publicar release no `contabase` (tag, release, workflow, GHCR).
2. Atualizar canal neste repositório para apontar para a nova tag.
3. `channels.json` será adicionado no futuro para gerenciar canais mutáveis.
4. GitHub Actions podem ser adicionados no futuro para automação.

### Domínios
- `get-contabase.pages.dev` é provisório.
- `get.contabase.net` será o domínio definitivo.

### Scripts deste repositório
- `public/install.sh` — bootstrap do canal recomendado.
- `public/beta/install.sh` — bootstrap do canal beta.
- `public/stable/install.sh` — bootstrap do canal stable (futuro).
- `public/vX.Y.Z/install.sh` — versões fixas (futuro).

---

## Atualização da demonstração interativa do ContaBase

Esta seção é operacional. Ela documenta a demonstração navegável da seção `#telas` de `public/index.html`, os arquivos gerados e o procedimento reproduzível de atualização.

### Última atualização

- Commit de origem: `a64d70c3b7f59fb97e628ea03e0141f0aa039050` (`style: refine transaction cards, bank logos and mobile swipe hints`).
- Versão lida de `VERSION`: `v1.0.0-beta.7`.
- Mês de referência: `2026-11`.
- Telas publicadas: **8** (Painel, Lançamentos, Contas, Cartões, Faturas, Metas e Reservas, Relatórios, Multiusuário).
- Capturas de fallback: **16** (8 telas × desktop/mobile).
- Investimentos: removido da demonstração porque a interface atual não o expõe (`CONTABASE_FEATURE_INVESTMENTS=false`; `/investimentos` responde 404).

### Arquitetura

- **Origem:** páginas SSR reais renderizadas a partir de um checkout isolado do `contabase-dev`, com banco sintético próprio. Nada é servido pelo Go depois da geração.
- **HTML interativo:** `public/demo/*.html` contém o HTML/CSS real sanitizado. O diretório `public/demo/assets/` contém apenas CSS, fontes, branding e logos de instituições necessários ao snapshot. O JavaScript da aplicação, HTMX, sessões e chamadas de backend são removidos.
- **Screenshots:** `public/screenshots/desktop/*.webp` e `public/screenshots/mobile/*.webp` são capturas fullPage das mesmas páginas estáticas, usadas como fallback e referência visual.
- **Landing page:** `public/assets/demo-preview.js` e `demo-preview.css` controlam dispositivo, seletor de tela, moldura, scroll interno e fallback. `public/demo/preview-data.js` é gerado a partir de `manifest.json` e alimenta o seletor sem fetch.
- **Iframe:** o iframe usa `sandbox="allow-scripts allow-same-origin"` e um CSP restritivo (`connect-src 'none'`, `form-action 'none'`). O `allow-same-origin` é necessário para fontes e para o iframe reportar a tela atual ao seletor. Não há scripts da aplicação; só `demo.js`.
- **Desktop:** referência 1440×900, escala uniforme para a largura da seção, scroll interno no iframe.
- **Mobile:** referência 390×844, moldura de smartphone centralizada, versão responsiva real, scroll interno. Em telas pequenas a moldura reduz a altura para preservar a navegação da landing page.
- **Persistência:** a tela selecionada é mantida em memória ao alternar Desktop/Mobile; abas internas (Reservas/Extrato) também são preservadas porque o caminho atual do iframe é mantido.

### Telas e arquivos

| Tela | Rota real | Arquivo |
|---|---|---|
| Painel | `/` | `public/demo/painel.html` |
| Lançamentos | `/lancamentos` | `public/demo/lancamentos.html` |
| Contas | `/contas` | `public/demo/contas.html` |
| Contas (Configurações) | `/configuracoes/contas` | `public/demo/configuracoes-contas.html` (página extra, não é uma das 8 capturas) |
| Cartões | `/configuracoes/cartoes` | `public/demo/cartoes.html` |
| Faturas | `/faturas` | `public/demo/faturas.html` |
| Metas e Reservas | `/metas` e `?aba=reservas` | `public/demo/metas.html` e `metas-reservas.html` |
| Relatórios | `/relatorios` e `?tab=extrato` | `public/demo/relatorios.html` e `relatorios-extrato.html` |
| Multiusuário | `/admin/usuarios` | `public/demo/usuarios.html` |

O menu lateral principal aponta `Contas` para `/contas` (obrigações do período). O submenu `Configurações → Contas` aponta para a página de gestão de contas.

### Formulário de lançamento

- O fragmento real de `GET /transacoes/nova?tipo=despesa` é capturado, sanitizado e embutido em todas as páginas em `#demo-lancamento-container`.
- `demo.js` abre o formulário ao clicar em `Novo lançamento`, `Nova Despesa` ou no FAB quando esses controles têm `data-demo-new-transaction`.
- O formulário é somente visual: botões de salvar são `type="button"`, formulários têm `action="#"`, submits são bloqueados e o CSP impede `form-action`.
- A data inicial vem de `data-today-civil` do próprio formulário. O formulário usa a conta padrão do servidor (Conta Nubank).
- Limitações: apenas a variante **Nova despesa** é embutida; as abas Receita/Transferir, os seletores de conta/categoria, anexos e parcelamento não executam a lógica da aplicação. A demonstração é declaradamente parcial.

### Procedimento de atualização

Pré-requisitos:

- Go instalado e compatível com o `go.mod` do ContaBase.
- Node.js 22+ e `sqlite3` disponíveis no PATH.
- Playwright instalado:
  ```bash
  npm install --prefix scripts/demo
  npx playwright install chromium
  ```
  O script também aceita `NODE_PATH` apontando para uma instalação existente do Playwright.

Escolher um commit aprovado do ContaBase:

```bash
git -C ../contabase-dev log --oneline -n 10
```

Executar a atualização (não usa nem altera o worktree principal):

```bash
node scripts/demo/refresh-contabase-demo.mjs \
  --source ../contabase-dev \
  --commit <sha-aprovado>
```

O script:

1. Verifica o repositório e o commit.
2. Cria um worktree descartável, fixa o listener em `127.0.0.1` e compila o binário.
3. Sobe o ContaBase com banco, `DATA_DIR` e uploads temporários, com `CONTABASE_FEATURE_INVESTMENTS=false`.
4. Executa o setup inicial, reinicia sem o token de setup, cria os dados sintéticos e reinicia uma vez para a recarga automática das reservas.
5. Renderiza as telas reais, sanitiza o HTML, embute o formulário de lançamento, copia os assets e gera as capturas WebP.
6. Valida páginas, links, formulários inertes, ausência de chamadas privadas, 8 telas e 16 capturas.
7. Atualiza somente `public/demo/` e `public/screenshots/desktop|mobile/`.
8. Valida a landing page após a sincronização.
9. Remove worktree, banco, runtime e processos temporários.

O script **não** altera `public/index.html`, `AGENTS.md`, `_headers` nem outras seções da landing page. Personalizações da landing devem ser feitas manualmente.

Modo de validação (não publica):

```bash
node scripts/demo/refresh-contabase-demo.mjs --check \
  --source ../contabase-dev \
  --commit <sha-aprovado>
```

O `--check` regenera tudo em diretório temporário, normaliza UUIDs/timestamps, compara assets exatamente e compara capturas com tolerância mínima de antialiasing. Ele não sobrescreve o publicado.

Período demonstrativo:

- O script sempre usa o mês corrente (`America/Sao_Paulo`). Rode-o novamente no início de cada mês para manter os gráficos, faturas e o mês corrente preenchidos.
- `--reference-month` com um mês diferente do corrente é rejeitado de propósito, porque as telas do app usam a data real do servidor.
- O fixture está em `scripts/demo/fixtures/demo-data.json`; os lançamentos usam `monthIndex` relativo (0 = cinco meses atrás, 5 = mês corrente), não datas absolutas.
- O `created_at` das contas é ajustado apenas como metadado de fixture para cobrir os seis meses do gráfico.

Adicionar uma nova tela:

1. Adicione uma entrada em `SCREENS` no `scripts/demo/generate.mjs` com `id`, `label`, `route`, `page`, `shot` e `aliases` quando houver abas.
2. Garanta que a rota existe no ContaBase; não invente telas.
3. Se a tela depender de uma aba interna, gere a página variante e adicione o alias.
4. Rode o script. O seletor da landing page é populado automaticamente por `preview-data.js`; não é necessário editar `index.html`.
5. Se a nova tela tiver formulário/modal próprio, estenda a sanitização e o `demo.js`.

Validar visualmente:

```bash
python3 -m http.server 8787 --bind 127.0.0.1 --directory public
```

Abra `http://127.0.0.1:8787/` e `/demo/painel.html`. Confira console, rede, abas internas, menu mobile, scroll, formulário de lançamento e ausência de Investimentos. O teste automatizado da landing page também é executado no fim do script.

### Segurança

- Nunca use banco DEV, produção, `data/`, `backups/`, `uploads/` ou dados reais.
- Nunca publique sessões, cookies, tokens, CSRF, banco SQLite ou logs.
- Nunca adicione backend, API, formulário com ação real ou chamadas ao servidor Go.
- Nunca altere regras financeiras, migrations ou saldos do ContaBase.
- Nunca execute commit, push, tag, release ou deploy automaticamente.
- O HTML gerado não contém `127.0.0.1`, `localhost`, `csrf`, `request_id` ou URLs internas.
- `_headers` define CSP restritivo e `X-Robots-Tag: noindex, nofollow` para `/demo/*`, e `frame-ancestors 'self'`. O `X-Frame-Options` global é `SAMEORIGIN`; a landing page continua protegida por `frame-ancestors 'none'`.

### Manutenção e limitações conhecidas

- Não edite manualmente `public/demo/`, `public/demo/manifest.json`, `preview-data.js` ou `public/screenshots/`; são gerados.
- Os assets da aplicação são copiados de `assets/css`, `assets/fonts`, `assets/branding`, `assets/institutions` e arquivos raiz. O JavaScript da aplicação não é copiado.
- `demo.js` é único e cuida de menu mobile, grupos do menu, abas estáticas, formulário de lançamento e bloqueio de ações.
- As abas Metas (Reservas) e Relatórios (Extrato) são páginas estáticas reais. Previsão, Diário, PDF/CSV, filtros de mês e detalhes de investimento ficam inertes.
- O formulário de lançamento é somente a variante Nova despesa; salvar, anexar, parcelar, trocar conta/categoria e alternar tipo não executam operações.
- As capturas mobile são fullPage com a barra inferior fixa reposicionada para o fim da imagem; as capturas não incluem animações.
- Os aliases de aba usam a captura da tela principal como fallback.
- O `--check` tolera diferenças mínimas de antialiasing (limite muito baixo) e falha para qualquer mudança de dado, ordem, asset ou dimensão.
