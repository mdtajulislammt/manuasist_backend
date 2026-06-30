# RevenueCat webhook setup (Menu Assist)

This guide connects RevenueCat purchase events to the application-service so
`GET /v1/app/membership/me` reflects subscription state after Test Store or
real store purchases.

## Endpoint

| Item | Value |
|------|-------|
| **Method** | `POST` |
| **Production URL** | `https://menu-assist.anikstudio.com/v1/app/internal/revenuecat/webhook` |
| **Local via gateway** | `http://localhost:2645/v1/app/internal/revenuecat/webhook` |
| **Local via ngrok** | `https://<subdomain>.ngrok-free.app/v1/app/internal/revenuecat/webhook` |
| **Auth** | `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` |

The route is **public** (no JWT). Security is the shared webhook secret only.

Gateway strips `/v1/app` and forwards to application-service at
`/internal/revenuecat/webhook`.

## 1. Set the webhook secret in backend

In `apps/application-service/.env` (or root `.env` / docker-compose):

```env
REVENUECAT_WEBHOOK_SECRET=your-long-random-secret-here
REVENUECAT_ENTITLEMENT_ID=premium
```

Use the **same exact value** in the RevenueCat dashboard authorization header
(see step 2). If the env var is empty, the endpoint accepts all requests
(dev-only; set a secret in every deployed environment).

**Docker compose default (local):** `dev-revenuecat-webhook-secret`

## 2. Configure webhook in RevenueCat dashboard

1. Open [RevenueCat](https://app.revenuecat.com) → your project
2. **Integrations** → **Webhooks** → **Add new configuration**
3. Fill in:

| Field | Recommended value |
|-------|-------------------|
| **Name** | `Menu Assist production` (or `local ngrok`) |
| **URL** | `https://menu-assist.anikstudio.com/v1/app/internal/revenuecat/webhook` |
| **Authorization header** | `Bearer <REVENUECAT_WEBHOOK_SECRET>` |
| **Environment** | **Sandbox** (for Test Store) and **Production** when live |
| **Apps** | All apps or your Flutter app |
| **Events** | Enable subscription lifecycle events (at minimum): |

   - `INITIAL_PURCHASE`
   - `RENEWAL`
   - `CANCELLATION`
   - `EXPIRATION`
   - `UNCANCELLATION`
   - `BILLING_ISSUE` (optional)

4. Save and use **Send test webhook** if available.

## 3. Local development with ngrok

RevenueCat requires a **public HTTPS** URL.

```powershell
# Terminal 1 — stack running (gateway on 2645)
npm run dev

# Terminal 2 — expose gateway
ngrok http 2645
```

Use the ngrok HTTPS URL:

```
https://abcd-1234.ngrok-free.app/v1/app/internal/revenuecat/webhook
```

Create a **separate** RevenueCat webhook configuration for local dev, or
temporarily change the production webhook URL while testing.

## 4. Test the endpoint locally (no RevenueCat)

**PowerShell:**

```powershell
.\scripts\test-revenuecat-webhook.ps1 `
  -BaseUrl "http://localhost:2645/v1/app" `
  -WebhookSecret "dev-revenuecat-webhook-secret" `
  -UserId "190969f3-6066-43dd-8ea0-700c616462a6"
```

**Bash:**

```bash
./scripts/test-revenuecat-webhook.sh \
  "http://localhost:2645/v1/app" \
  "dev-revenuecat-webhook-secret" \
  "190969f3-6066-43dd-8ea0-700c616462a6"
```

Expected response:

```json
{
  "success": true,
  "message": "RevenueCat event processed",
  "data": {
    "eventId": "...",
    "eventType": "INITIAL_PURCHASE",
    "userId": "190969f3-6066-43dd-8ea0-700c616462a6",
    "status": "ACTIVE"
  }
}
```

## 5. Verify after Test Store purchase

Replace `USER_ID` with the auth UUID (`Purchases.getAppUserID()`).

### A. Database (application-service DB)

```sql
-- Webhook received
SELECT id, event_type, user_id, received_at
FROM application_revenuecat_webhook_events
WHERE user_id = 'USER_ID'
ORDER BY received_at DESC
LIMIT 5;

-- Entitlement updated
SELECT user_id, entitlement_key, status, product_id, expires_at, will_renew
FROM application_user_entitlements
WHERE user_id = 'USER_ID';
```

### B. API

```http
GET /v1/app/membership/me
Authorization: Bearer <user-jwt>
```

Expected after purchase:

- `accessSource`: `"subscription"`
- `status`: `"TRIALING"` or `"ACTIVE"`
- `showManageSubscription`: `true`
- `showCancelSubscription`: `true`

## 6. Flutter / RevenueCat requirements

- `Purchases.logIn(authUserUuid)` before purchase (same UUID as webhook `app_user_id`)
- Test Store purchases only fire webhooks if the webhook config includes **Sandbox**
- After purchase, wait 1–2s then refresh `/membership/me`

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `401 Invalid RevenueCat webhook secret` | Secret mismatch between dashboard and `REVENUECAT_WEBHOOK_SECRET` |
| `400 app user id missing` | RevenueCat payload format; check application-service logs |
| Webhook never arrives | ngrok down, wrong URL, or firewall |
| RC shows premium, `/me` unchanged | `app_user_id` ≠ auth UUID, or webhook not reaching backend |
| Duplicate events | Normal — handler is idempotent by `event.id` |

## Related env vars

| Variable | Purpose |
|----------|---------|
| `REVENUECAT_WEBHOOK_SECRET` | Webhook `Authorization` validation |
| `REVENUECAT_ENTITLEMENT_ID` | Default entitlement key (`premium`) |
| `REVENUECAT_MANAGEMENT_URL` | Optional; Flutter should use Customer Center instead |
