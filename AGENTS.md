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
