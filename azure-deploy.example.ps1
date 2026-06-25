# ── strenth-web — Azure Container Apps Deployment ─────────────────────────────
#
# SETUP (one-time):
#   1. Copy this file:  cp azure-deploy.example.ps1 azure-deploy.ps1
#   2. Fill in the SECRETS section below with your real values
#   3. azure-deploy.ps1 is in .gitignore — never commit it
#   4. Run: .\azure-deploy.ps1
#
# For CI/CD use GitHub Actions (.github/workflows/deploy.yml) instead.
# ─────────────────────────────────────────────────────────────────────────────

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Config (safe to commit) ───────────────────────────────────────────────────
$SUBSCRIPTION_ID = "613527b7-804f-4693-ac2a-c9edadf241bb"
$LOCATION        = "centralindia"
$RESOURCE_GROUP  = "bom-tool-rg"
$ACR_NAME        = "bomtoolregistry"
$CONTAINER_ENV   = "bom-tool-env"
$API_APP         = "strenth-web"
$IMAGE_TAG       = git rev-parse --short HEAD 2>$null ?? "latest"

# ── SECRETS — fill these in, never commit ────────────────────────────────────
# Get these from Azure Key Vault or ask the team lead
$POSTGRES_PASSWORD      = ""   # Azure Postgres password
$SECRET_KEY             = ""   # App secret key (random 64-char hex)
$ANTHROPIC_API_KEY      = ""   # https://console.anthropic.com
$MOUSER_API_KEY         = ""   # https://developer.mouser.com
$DIGIKEY_CLIENT_ID      = ""   # https://developer.digikey.com
$DIGIKEY_CLIENT_SECRET  = ""
$ELEMENT14_API_KEY      = ""   # https://partner.element14.com
$VITE_GOOGLE_CLIENT_ID  = ""   # https://console.cloud.google.com
# ─────────────────────────────────────────────────────────────────────────────

if (-not $ANTHROPIC_API_KEY) {
    Write-Error "ANTHROPIC_API_KEY is empty. Fill in the SECRETS section first."
    exit 1
}

function Log($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

$ACR_LOGIN_SERVER = "$ACR_NAME.azurecr.io"
$FULL_IMAGE       = "${ACR_LOGIN_SERVER}/strenth-web:${IMAGE_TAG}"

Log "Setting subscription"
az account set --subscription $SUBSCRIPTION_ID

Log "Logging in to ACR"
az acr login --name $ACR_NAME

Log "Building Docker image: $FULL_IMAGE"
docker build `
    --build-arg VITE_BOM_API_URL="https://bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io" `
    --build-arg VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" `
    --build-arg VITE_ADMIN_EMAILS="admin@strenth.ai,suraj@strenth.ai" `
    --build-arg VITE_ALLOWED_EMAIL_DOMAINS="strenth.ai" `
    -t $FULL_IMAGE .

Log "Pushing to ACR"
docker push $FULL_IMAGE

Log "Updating Container App: $API_APP"
az containerapp update `
    --name $API_APP `
    --resource-group $RESOURCE_GROUP `
    --image $FULL_IMAGE

$FQDN = $(az containerapp show --name $API_APP --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn --output tsv)

Log "Done!"
Write-Host "  Live: https://$FQDN" -ForegroundColor Green
