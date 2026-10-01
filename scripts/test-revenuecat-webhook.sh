#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:2645/v1/app}"
WEBHOOK_SECRET="${2:-dev-revenuecat-webhook-secret}"
USER_ID="${3:-190969f3-6066-43dd-8ea0-700c616462a6}"
PRODUCT_ID="${4:-menu_assist_premium_monthly}"
EVENT_TYPE="${5:-INITIAL_PURCHASE}"

EVENT_ID="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
NOW_MS="$(python -c 'import time; print(int(time.time()*1000))')"
EXPIRES_MS="$(python -c 'import time; print(int((time.time()+14*86400)*1000))')"

URL="${BASE_URL%/}/internal/revenuecat/webhook"

echo "POST $URL"
echo "Event id: $EVENT_ID"
echo "User id:  $USER_ID"

curl -sS -X POST "$URL" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"api_version\": \"1.0\",
    \"event\": {
      \"id\": \"$EVENT_ID\",
      \"type\": \"$EVENT_TYPE\",
      \"app_user_id\": \"$USER_ID\",
      \"product_id\": \"$PRODUCT_ID\",
      \"entitlement_ids\": [\"premium\"],
      \"period_type\": \"TRIAL\",
      \"environment\": \"SANDBOX\",
      \"event_timestamp_ms\": $NOW_MS,
      \"purchased_at_ms\": $NOW_MS,
      \"expiration_at_ms\": $EXPIRES_MS,
      \"will_renew\": true
    }
  }" | python -m json.tool
