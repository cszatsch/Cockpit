#!/usr/bin/env bash
# check-domains.sh — definitive domain registration status via WHOIS, with RDAP fallback.
#
# Usage:
#   bash check-domains.sh [-t com,ai,co,io] [-j 16] [-r] name [name ...]
#   printf 'name1\nname2\n' | bash check-domains.sh -t com,ai
#
# Options:
#   -t TLDS   comma-separated TLDs to check (default: com,ai,co,io)
#   -j N      parallel checks (default: 16)
#   -r        raw TSV output (domain, status, method) instead of the markdown grid
#
# Status values: AVAILABLE | REGISTERED | UNKNOWN
#   AVAILABLE   WHOIS says no match, or the TLD's RDAP registry returned 404
#   REGISTERED  WHOIS returned registration data, or the RDAP registry returned 200
#   UNKNOWN     no authoritative answer (timeout, rate limit, TLD with no WHOIS or RDAP route);
#               check manually, never treat as available
#
# "REGISTERED" does not mean a live website. Many registered domains are parked or for sale.
# Requires: whois, curl, perl (all present on macOS and most Linux). No API keys.

set -u

TLDS="com,ai,co,io"
JOBS=16
RAW=0

while getopts ":t:j:r" opt; do
  case "$opt" in
    t) TLDS="$OPTARG" ;;
    j) JOBS="$OPTARG" ;;
    r) RAW=1 ;;
    *) echo "usage: $0 [-t com,ai,co,io] [-j N] [-r] name [name ...]" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

# Names from args, else from stdin (one per line).
NAMES=("$@")
if [ ${#NAMES[@]} -eq 0 ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && NAMES+=("$line")
  done
fi
if [ ${#NAMES[@]} -eq 0 ]; then
  echo "no names given" >&2
  exit 2
fi

# Normalize a brand name to a domain label: transliterate accents (Café → cafe, Søren → soren), lowercase,
# strip everything but a-z 0-9 and hyphen. The grid shows the label beside the name when they differ.
normalize() {
  printf '%s' "$1" \
    | perl -CS -MUnicode::Normalize -pe '$_ = NFD($_); s/\p{Mn}//g; tr/\x{d8}\x{f8}\x{c6}\x{e6}\x{df}\x{141}\x{142}/OoAasLl/' \
    | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9-]//g' -e 's/^-*//' -e 's/-*$//'
}

# Registry WHOIS servers. Empty means "no WHOIS; go straight to RDAP".
whois_server() {
  case "$1" in
    com|net) echo "whois.verisign-grs.com" ;;
    org)     echo "whois.pir.org" ;;
    io)      echo "whois.nic.io" ;;
    ai)      echo "whois.nic.ai" ;;
    co)      echo "whois.registry.co" ;;
    ly)      echo "whois.nic.ly" ;;
    is)      echo "whois.isnic.is" ;;
    me)      echo "whois.nic.me" ;;
    so)      echo "whois.nic.so" ;;
    tv)      echo "whois.nic.tv" ;;
    sh)      echo "whois.nic.sh" ;;
    gg)      echo "whois.gg" ;;
    xyz)     echo "whois.nic.xyz" ;;
    us)      echo "whois.nic.us" ;;
    it)      echo "whois.nic.it" ;;
    to)      echo "whois.tonic.to" ;;
    app|dev) echo "RDAP" ;;   # Google registry WHOIS is not publicly reachable; RDAP is
    *)       echo "" ;;
  esac
}

# Classify a WHOIS response body. Prints AVAILABLE, REGISTERED, or nothing if unrecognized.
# The REGISTERED pattern is limited to fields that appear only in a domain record. The IANA
# server's record for a TLD (which the whois client prints before following a referral) has
# "domain:", "nserver:", "status: ACTIVE" and "created:" lines, so none of those may count.
classify_whois() {
  if printf '%s' "$1" | grep -qiE 'no match|not found|no entries found|does not exist|no object found|domain not found|no data found|status: free|status: +available|is available|not been registered'; then
    echo AVAILABLE; return
  fi
  if printf '%s' "$1" | grep -qiE 'domain name:|registry domain id|creation date:|expire date:|^registrar:|registrant:|registered on'; then
    echo REGISTERED; return
  fi
}

# One lookup. Prints: domain<TAB>STATUS<TAB>method
check_one() {
  local domain="$1"
  local tld="${domain##*.}"
  local server out verdict
  server="$(whois_server "$tld")"

  if [ "$server" != "RDAP" ]; then
    # 1. Registry WHOIS, if we know the server.
    if [ -n "$server" ]; then
      out="$(perl -e 'alarm 12; exec @ARGV' whois -h "$server" "$domain" 2>/dev/null)"
      verdict="$(classify_whois "${out:-}")"
      if [ -n "$verdict" ]; then printf '%s\t%s\twhois\n' "$domain" "$verdict"; return; fi
    fi

    # 2. The whois client's own routing, which follows the IANA referral. Covers TLDs not in
    #    the map and a registry host that failed to resolve.
    out="$(perl -e 'alarm 15; exec @ARGV' whois "$domain" 2>/dev/null)"
    verdict="$(classify_whois "${out:-}")"
    if [ -n "$verdict" ]; then printf '%s\t%s\twhois-referral\n' "$domain" "$verdict"; return; fi
  fi

  # 3. RDAP via the rdap.org bootstrap, following its redirect to the registry.
  #    A 404 is authoritative only if we actually reached a registry; a 404 from rdap.org
  #    itself means it has no route for this TLD, which is UNKNOWN, not available.
  local resp code url
  resp="$(curl -sL -o /dev/null -w '%{http_code} %{url_effective}' --max-time 15 "https://rdap.org/domain/$domain" 2>/dev/null)"
  code="${resp%% *}"
  url="${resp#* }"
  case "$url" in
    https://rdap.org/*|http://rdap.org/*|"")
      printf '%s\tUNKNOWN\trdap-no-route-%s\n' "$domain" "${code:-none}"; return ;;
  esac
  case "$code" in
    404) printf '%s\tAVAILABLE\trdap\n' "$domain" ;;
    200) printf '%s\tREGISTERED\trdap\n' "$domain" ;;
    *)   printf '%s\tUNKNOWN\trdap-http-%s\n' "$domain" "${code:-none}" ;;
  esac
}
export -f check_one classify_whois whois_server

# Build the domain list.
DOMAINS=()
IFS=',' read -r -a TLD_ARR <<< "$TLDS"
for raw in "${NAMES[@]}"; do
  label="$(normalize "$raw")"
  [ -z "$label" ] && continue
  for tld in "${TLD_ARR[@]}"; do
    DOMAINS+=("${label}.${tld}")
  done
done

# Two names that normalize to the same label ("Sift Works", "SiftWorks") are looked up once; the grid maps the result back to both.
RESULTS="$(printf '%s\n' "${DOMAINS[@]}" | sort -u | xargs -P "$JOBS" -I{} bash -c 'check_one "$1"' _ {} | sort)"

if [ "$RAW" -eq 1 ]; then
  printf '%s\n' "$RESULTS"
  exit 0
fi

# Markdown grid: one row per name, one column per TLD.
{
  printf '%s' '| Name |'
  for tld in "${TLD_ARR[@]}"; do printf ' .%s |' "$tld"; done
  printf '\n%s' '|---|'
  for _ in "${TLD_ARR[@]}"; do printf '%s' '---|'; done
  printf '\n'
  for raw in "${NAMES[@]}"; do
    label="$(normalize "$raw")"
    [ -z "$label" ] && continue
    shown="$raw"
    if [ "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d ' ')" != "$label" ]; then shown="$raw ($label)"; fi
    printf '| %s |' "$shown"
    for tld in "${TLD_ARR[@]}"; do
      status="$(printf '%s\n' "$RESULTS" | awk -F'\t' -v d="${label}.${tld}" '$1==d {print $2}')"
      case "$status" in
        AVAILABLE)  cell="✅ available" ;;
        REGISTERED) cell="❌ registered" ;;
        *)          cell="❓ unknown" ;;
      esac
      printf ' %s |' "$cell"
    done
    printf '\n'
  done
}
