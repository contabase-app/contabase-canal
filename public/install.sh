#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# install.sh — Bootstrap do canal recomendado do ContaBase
#
# Baixa o install.sh real do repositorio publico contabase-app/contabase
# da tag informada por CONTABASE_VERSION ou DEFAULT_VERSION e executa localmente.
#
# Uso:
#   curl -fsSLo /tmp/contabase-install.sh https://get-contabase.pages.dev/install.sh && bash /tmp/contabase-install.sh
#   curl -fsSLo /tmp/contabase-install.sh https://get-contabase.pages.dev/install.sh && CONTABASE_VERSION=v0.2.0 bash /tmp/contabase-install.sh
# ==============================================================================

DEFAULT_VERSION="v0.1.0-beta.1"
PUBLIC_RAW_BASE="https://raw.githubusercontent.com/contabase-app/contabase"

say() { printf '%s\n' "$*"; }
die() { say "Erro: $*"; exit 1; }

TMP_SCRIPT=""
trap 'rm -f "${TMP_SCRIPT:-}"' EXIT

resolve_version() {
  CONTABASE_VERSION="${CONTABASE_VERSION:-$DEFAULT_VERSION}"
  export CONTABASE_VERSION

  case "$CONTABASE_VERSION" in
    *-internal*)
      die "Versoes com -internal sao privadas e nao podem usar o bootstrap publico."
      ;;
  esac

  if [[ ! "$CONTABASE_VERSION" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; then
    die "CONTABASE_VERSION nao e uma tag SemVer publica valida: ${CONTABASE_VERSION}"
  fi

  case "$CONTABASE_VERSION" in
    main|beta|dev|stable|latest)
      die "Nao e permitido usar branch (${CONTABASE_VERSION}) como versao de instalacao. Use uma tag SemVer publica."
      ;;
  esac
}

download_installer() {
  local url

  if ! command -v curl >/dev/null 2>&1; then
    die "curl e obrigatorio para baixar o instalador."
  fi

  url="${PUBLIC_RAW_BASE}/${CONTABASE_VERSION}/scripts/install.sh"
  TMP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/contabase-installer.XXXXXX")"

  say "Baixando instalador do ContaBase ${CONTABASE_VERSION}..."
  if ! curl --fail --location --silent --show-error \
    --proto '=https' --tlsv1.2 \
    "$url" -o "$TMP_SCRIPT"; then
    rm -f "$TMP_SCRIPT"
    die "Nao foi possivel baixar o instalador de ${CONTABASE_VERSION}."
  fi

  CONTABASE_INSTALLER_PATH="$TMP_SCRIPT"
  export CONTABASE_INSTALLER_PATH
}

main() {
  resolve_version
  download_installer

  say "Executando instalador do ContaBase ${CONTABASE_VERSION}..."
  bash "$CONTABASE_INSTALLER_PATH" "$@"
}

main "$@"
