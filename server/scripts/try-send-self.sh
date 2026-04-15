#!/bin/bash
set -uo pipefail
ACT="/opt/homebrew/lib/node_modules/@larksuite/cli/bin/lark-cli"
OUT="${TMPDIR:-/tmp}/lark_send_try.txt"
PARAMS='{"receive_id_type":"open_id"}'
DATA='{"receive_id":"ou_333311bc7d65b56626beea49018f48af","msg_type":"text","content":"{\"text\":\"【本地测试】给自己\"}"}'
rm -f "$OUT"
set +e
"$ACT" api GET /open-apis/im/v1/chats --as user --format json >"${OUT}.get" 2>&1
echo "GET exit=$? GET bytes=$(wc -c <"${OUT}.get")"
head -c 200 "${OUT}.get"; echo

"$ACT" api POST /open-apis/im/v1/messages \
  --as user \
  --params "$PARAMS" \
  --data "$DATA" \
  --format json --dry-run >"${OUT}.dry" 2>&1
echo "DRY exit=$? DRY bytes=$(wc -c <"${OUT}.dry")"
head -c 400 "${OUT}.dry"; echo

"$ACT" api POST /open-apis/im/v1/messages \
  --as user \
  --params "$PARAMS" \
  --data "$DATA" \
  --format json >"$OUT" 2>&1
echo "POST exit=$?"
echo "POST bytes=$(wc -c <"$OUT")"
xxd "$OUT" | head
cat "$OUT"
