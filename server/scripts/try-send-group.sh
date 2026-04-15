#!/bin/bash
set -uo pipefail
ACT="/opt/homebrew/lib/node_modules/@larksuite/cli/bin/lark-cli"
OUT="${TMPDIR:-/tmp}/lark_post_group.txt"
CHAT_ID=$("$ACT" api GET /open-apis/im/v1/chats --as user --format json 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['items'][0]['chat_id'])")
echo "Using chat_id=$CHAT_ID"
PARAMS='{"receive_id_type":"chat_id"}'
DATA=$(python3 -c "import json; cid='$CHAT_ID'; t='【本地测试】发到会话（群或话题群）'; print(json.dumps({'receive_id':cid,'msg_type':'text','content':json.dumps({'text':t},ensure_ascii=False)},ensure_ascii=False))")
rm -f "$OUT"
set +e
"$ACT" api POST /open-apis/im/v1/messages --as user --params "$PARAMS" --data "$DATA" --format json >"$OUT" 2>&1
echo "POST exit=$? bytes=$(wc -c <"$OUT")"
cat "$OUT"
