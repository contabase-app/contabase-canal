# ContaBase — Canal de Instalação

Canal público de instalação do [ContaBase](https://github.com/contabase-app/contabase).

## Uso

```bash
curl -fsSLo /tmp/contabase-install.sh https://get-contabase.pages.dev/install.sh && bash /tmp/contabase-install.sh
```

Ou com versão específica:

```bash
curl -fsSLo /tmp/contabase-install.sh https://get-contabase.pages.dev/install.sh && CONTABASE_VERSION=vX.Y.Z bash /tmp/contabase-install.sh
```

A versão exata servida por cada canal está definida no respectivo `install.sh`.

## Canais

| Canal | URL |
|-------|-----|
| Recomendado | `/install.sh` |
| Beta | `/beta/install.sh` |
| Stable | `/stable/install.sh` _(futuro)_ |

## Como funciona

1. `install.sh` deste repositório baixa o `install.sh` real do repositório público do ContaBase na tag correspondente.
2. Executa localmente com `bash`.
3. O script real faz a triagem entre Docker, source ou release.

## Repositórios

- **Código fonte:** [contabase-app/contabase](https://github.com/contabase-app/contabase)
- **Canal de instalação:** [contabase-app/contabase-canal](https://github.com/contabase-app/contabase-canal)
