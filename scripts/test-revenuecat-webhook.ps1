param(
  [string]$BaseUrl = "http://localhost:5000/v1/app",
  [string]$WebhookSecret = "dev-revenuecat-webhook-secret",
  [string]$UserId = "190969f3-6066-43dd-8ea0-700c616462a6",
  [string]$ProductId = "menu_assist_premium_monthly",
  [string]$EventType = "INITIAL_PURCHASE"
)

$ErrorActionPreference = "Stop"

$eventId = [guid]::NewGuid().ToString()
$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$expiresMs = [DateTimeOffset]::UtcNow.AddDays(14).ToUnixTimeMilliseconds()

$body = @{
  api_version = "1.0"
  event = @{
    id = $eventId
    type = $EventType
    app_user_id = $UserId
    product_id = $ProductId
    entitlement_ids = @("premium")
    period_type = "TRIAL"
    environment = "SANDBOX"
    event_timestamp_ms = $nowMs
    purchased_at_ms = $nowMs
    expiration_at_ms = $expiresMs
    will_renew = $true
  }
} | ConvertTo-Json -Depth 6

$url = "$($BaseUrl.TrimEnd('/'))/internal/revenuecat/webhook"

Write-Host "POST $url"
Write-Host "Event id: $eventId"
Write-Host "User id:  $UserId"

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $url `
  -Headers @{ Authorization = "Bearer $WebhookSecret" } `
  -ContentType "application/json" `
  -Body $body

$response | ConvertTo-Json -Depth 6
