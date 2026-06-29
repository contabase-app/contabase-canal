#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# install.sh - Bootstrap do canal beta do ContaBase
#
# Resolve public/channels/beta.json e baixa o install.sh real da tag publica.
# CONTABASE_VERSION permite instalar uma versao especifica/pinned.
# ==============================================================================

CHANNEL="beta"
CHANNEL_BASE="${CONTABASE_CHANNEL_BASE:-https://get-contabase.pages.dev}"
PUBLIC_RAW_BASE="${CONTABASE_RAW_BASE:-https://raw.githubusercontent.com/contabase-app/contabase}"

say() { printf '%s\n' "$*"; }
die() { say "Erro: $*"; exit 1; }

TMP_SCRIPT=""
TMP_MANIFEST=""
trap 'rm -f "${TMP_SCRIPT:-}" "${TMP_MANIFEST:-}"' EXIT

is_public_semver() {
  local value="$1"
  [[ "$value" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]
}

json_string_value() {
  local key="$1"
  local file="$2"
  tr '\n' ' ' < "$file" | sed -nE 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p'
}

json_number_value() {
  local key="$1"
  local file="$2"
  tr '\n' ' ' < "$file" | sed -nE 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p'
}

validate_version() {
  case "$CONTABASE_VERSION" in
    *-internal*)
      die "Versoes com -internal sao privadas e nao podem usar o bootstrap publico."
      ;;
    main|beta|dev|stable|latest)
      die "Nao e permitido usar branch (${CONTABASE_VERSION}) como versao de instalacao. Use uma tag SemVer publica."
      ;;
  esac

  is_public_semver "$CONTABASE_VERSION" || die "CONTABASE_VERSION nao e uma tag SemVer publica valida: ${CONTABASE_VERSION}"
}

resolve_manifest_version() {
  local manifest_url schema manifest_channel version

  command -v curl >/dev/null 2>&1 || die "curl e obrigatorio para baixar o manifest."

  manifest_url="${CHANNEL_BASE%/}/channels/${CHANNEL}.json"
  TMP_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/contabase-channel.XXXXXX")"

  say "Resolvendo canal ${CHANNEL}: ${manifest_url}"
  local curl_args=(--fail --location --silent --show-error)
  if [ "${CONTABASE_ALLOW_INSECURE_CHANNEL:-0}" != "1" ]; then
    curl_args+=(--proto '=https' --tlsv1.2)
  fi
  if ! curl "${curl_args[@]}" "$manifest_url" -o "$TMP_MANIFEST"; then
    die "Nao foi possivel baixar o manifest do canal ${CHANNEL}."
  fi

  schema="$(json_number_value schema_version "$TMP_MANIFEST")"
  manifest_channel="$(json_string_value channel "$TMP_MANIFEST")"
  version="$(json_string_value version "$TMP_MANIFEST")"

  [ "$schema" = "1" ] || die "Manifest beta com schema_version invalido."
  [ "$manifest_channel" = "$CHANNEL" ] || die "Manifest beta declara canal '${manifest_channel}'."
  [ -n "$version" ] || die "Manifest beta nao possui versao publicada."

  CONTABASE_VERSION="$version"
  validate_version
  case "$CONTABASE_VERSION" in
    v*-beta.*) ;;
    *) die "Manifest beta apontou para versao nao beta: ${CONTABASE_VERSION}" ;;
  esac
  CONTABASE_CHANNEL="$CHANNEL"
}

resolve_version() {
  if [ -n "${CONTABASE_VERSION:-}" ]; then
    validate_version
    CONTABASE_CHANNEL="pinned"
  else
    resolve_manifest_version
  fi
  export CONTABASE_VERSION CONTABASE_CHANNEL
}

download_installer() {
  local url

  command -v curl >/dev/null 2>&1 || die "curl e obrigatorio para baixar o instalador."

  url="${PUBLIC_RAW_BASE}/${CONTABASE_VERSION}/scripts/install.sh"
  TMP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/contabase-installer.XXXXXX")"

  say "Baixando instalador do ContaBase ${CONTABASE_VERSION} (canal ${CONTABASE_CHANNEL})..."
  local curl_args=(--fail --location --silent --show-error)
  if [ "${CONTABASE_ALLOW_INSECURE_CHANNEL:-0}" != "1" ]; then
    curl_args+=(--proto '=https' --tlsv1.2)
  fi
  if ! curl "${curl_args[@]}" "$url" -o "$TMP_SCRIPT"; then
    die "Nao foi possivel baixar o instalador de ${CONTABASE_VERSION}."
  fi

  CONTABASE_INSTALLER_PATH="$TMP_SCRIPT"
  export CONTABASE_INSTALLER_PATH
}

main() {
  resolve_version
  if [ "${CONTABASE_BOOTSTRAP_RESOLVE_ONLY:-0}" = "1" ]; then
    say "Install resolvido: canal=${CONTABASE_CHANNEL} versao=${CONTABASE_VERSION}"
    return 0
  fi
  download_installer

  say "Executando instalador do ContaBase ${CONTABASE_VERSION}..."
  bash "$CONTABASE_INSTALLER_PATH" "$@"
}

main "$@"
