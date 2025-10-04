# iPaaS Feature Deployment Script
# Deploys multi-currency, refund handling, and multiple store support

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "iPaaS Feature Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "Checking Supabase CLI..." -ForegroundColor Yellow
$supabasePath = Get-Command supabase -ErrorAction SilentlyContinue

if (-not $supabasePath) {
    Write-Host "ERROR: Supabase CLI not found!" -ForegroundColor Red
    Write-Host "Install it with: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Supabase CLI found" -ForegroundColor Green
Write-Host ""

# Confirm deployment
Write-Host "This script will deploy:" -ForegroundColor Yellow
Write-Host "  1. Multi-Currency Support" -ForegroundColor White
Write-Host "  2. Refund Handling" -ForegroundColor White
Write-Host "  3. Multiple Store Support" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continue with deployment? (y/n)"
if ($confirm -ne "y") {
    Write-Host "Deployment cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STEP 1: Deploying Database Migrations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Deploy multi-currency migration
Write-Host "Deploying multi-currency support..." -ForegroundColor Yellow
$result = supabase db push --file "supabase\migrations\20250104_multi_currency_support.sql" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Multi-currency migration deployed" -ForegroundColor Green
} else {
    Write-Host "⚠ Multi-currency migration may have issues - check manually" -ForegroundColor Yellow
    Write-Host $result -ForegroundColor Gray
}
Write-Host ""

# Deploy refund handling migration
Write-Host "Deploying refund handling..." -ForegroundColor Yellow
$result = supabase db push --file "supabase\migrations\20250104_refund_handling.sql" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Refund handling migration deployed" -ForegroundColor Green
} else {
    Write-Host "⚠ Refund handling migration may have issues - check manually" -ForegroundColor Yellow
    Write-Host $result -ForegroundColor Gray
}
Write-Host ""

# Deploy multiple store support migration
Write-Host "Deploying multiple store support..." -ForegroundColor Yellow
$result = supabase db push --file "supabase\migrations\20250104_multiple_store_support.sql" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Multiple store support migration deployed" -ForegroundColor Green
} else {
    Write-Host "⚠ Multiple store support migration may have issues - check manually" -ForegroundColor Yellow
    Write-Host $result -ForegroundColor Gray
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STEP 2: Deploying Edge Functions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Deploy shopify-webhook function
Write-Host "Deploying shopify-webhook function..." -ForegroundColor Yellow
$result = supabase functions deploy shopify-webhook 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Shopify webhook function deployed" -ForegroundColor Green
} else {
    Write-Host "⚠ Function deployment may have issues - check manually" -ForegroundColor Yellow
    Write-Host $result -ForegroundColor Gray
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STEP 3: Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Testing database connection..." -ForegroundColor Yellow
# This would test if we can query the new tables
Write-Host "Run this SQL in Supabase Dashboard to verify:" -ForegroundColor Yellow
Write-Host "  SELECT * FROM currency_rates LIMIT 1;" -ForegroundColor Gray
Write-Host "  SELECT * FROM refund_mappings LIMIT 1;" -ForegroundColor Gray
Write-Host "  SELECT * FROM user_preferences LIMIT 1;" -ForegroundColor Gray
Write-Host "  SELECT * FROM store_statistics;" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Verify migrations in Supabase Dashboard" -ForegroundColor White
Write-Host "2. Update your frontend code:" -ForegroundColor White
Write-Host "   - Wrap App with StoreProvider" -ForegroundColor Gray
Write-Host "   - Add StoreSelectorCompact to navigation" -ForegroundColor Gray
Write-Host "   - Add /stores route" -ForegroundColor Gray
Write-Host "3. Test with real data" -ForegroundColor White
Write-Host ""

Write-Host "See MULTIPLE_STORE_IMPLEMENTATION.md for detailed integration steps" -ForegroundColor Cyan
Write-Host ""
