# ============================================================================
# deploy-producao.ps1 — sobe a Monitoria de Qualidade no servidor (SVR-RCJP)
#
# RODAR COMO ADMINISTRADOR (o daemon do PM2 deste servidor roda elevado; sem
# elevação o pm2 responde "connect EPERM //./pipe/rpc.sock").
#
# Pré-requisitos já feitos antes de rodar:
#   - deploy\criar-banco.sql executado no pgAdmin4 (role + banco)
#   - npm run instalar e npm run build na raiz (dist pronto)
#   - backend\.env de produção preenchido (porta 3008)
#
# Uso:
#   1ª vez ...........: powershell -ExecutionPolicy Bypass -File deploy-producao.ps1
#   após cadastrar no hub: powershell -ExecutionPolicy Bypass -File deploy-producao.ps1 -ModuleId <UUID>
# ============================================================================
param([string]$ModuleId)

$ErrorActionPreference = 'Stop'
$Raiz    = 'D:\Monitoria'
$EnvFile = Join-Path $Raiz 'backend\.env'
$PmHome  = 'C:\Users\RovalConnecta\.pm2'
$Pm2Cmd  = 'C:\Users\RovalConnecta\AppData\Roaming\npm\pm2.cmd'
$App     = 'monitoria-qualidade'
$Porta   = 3008

$ehAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ehAdmin) { Write-Host 'ERRO: rode este script como Administrador (o PM2 do servidor exige).' -ForegroundColor Red; exit 1 }

# PM2_HOME explícito, como nos scripts de boot — evita daemon fantasma com home divergente
$env:PM2_HOME = $PmHome

# ── Modo 2: gravar o ROVAL_MODULE_ID depois do cadastro no hub ──────────────
if ($ModuleId) {
  if ($ModuleId -notmatch '^[0-9a-fA-F-]{36}$') { Write-Host "ERRO: '$ModuleId' nao parece um UUID." -ForegroundColor Red; exit 1 }
  $c = Get-Content $EnvFile -Raw
  $c = $c -replace '(?m)^ROVAL_MODULE_ID=.*$', "ROVAL_MODULE_ID=$ModuleId"
  Set-Content -Path $EnvFile -Value $c -Encoding utf8
  Write-Host "OK: ROVAL_MODULE_ID gravado no .env"
  $ErrorActionPreference = 'Continue'
  cmd /c "`"$Pm2Cmd`" restart $App"
  Write-Host "OK: $App reiniciado. Teste o SSO pelo card no hub." -ForegroundColor Green
  exit 0
}

# ── Modo 1: primeira subida ─────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) { Write-Host "ERRO: $EnvFile nao existe." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $Raiz 'backend\dist\main.js'))) { Write-Host 'ERRO: backend nao compilado (npm run build na raiz).' -ForegroundColor Red; exit 1 }

Write-Host '== 1/5 Migrations (cria as tabelas) =='
Set-Location $Raiz
npm run banco:migrar
if ($LASTEXITCODE -ne 0) { Write-Host 'ERRO na migration. O banco foi criado no pgAdmin (deploy\criar-banco.sql)?' -ForegroundColor Red; exit 1 }

Write-Host '== 2/5 Seed (admin local, lojas, checklists v1, parametros) =='
npm run banco:seed
if ($LASTEXITCODE -ne 0) { Write-Host 'ERRO no seed.' -ForegroundColor Red; exit 1 }

Write-Host '== 3/5 Mapa de portas dos scripts de boot do PM2 =='
$old = "'chamados-ti'=3007 }"
$new = "'chamados-ti'=3007; '$App'=$Porta }"
foreach ($f in 'C:\ProgramData\RovalOps\pm2\pm2-boot-resurrect.ps1', 'C:\ProgramData\RovalOps\pm2\pm2-healthcheck.ps1') {
  $c = Get-Content $f -Raw
  if ($c.Contains("'$App'")) { Write-Host "  ja atualizado: $f" }
  elseif ($c.Contains($old)) { Set-Content -Path $f -Value $c.Replace($old, $new) -Encoding utf8; Write-Host "  OK: $f" }
  else { Write-Host "  AVISO: padrao nao encontrado em $f - adicione '$App'=$Porta ao `$Portas na mao." -ForegroundColor Yellow }
}

Write-Host '== 4/5 Firewall (porta 3008 na rede interna) =='
if (Get-NetFirewallRule -DisplayName 'Monitoria de Qualidade 3008' -ErrorAction SilentlyContinue) {
  Write-Host '  regra ja existe'
} else {
  New-NetFirewallRule -DisplayName 'Monitoria de Qualidade 3008' -Direction Inbound -Protocol TCP -LocalPort $Porta -Action Allow | Out-Null
  Write-Host '  OK: regra criada'
}

Write-Host '== 5/5 PM2 =='
# pm2 escreve avisos no stderr; no PS 5.1 + ErrorActionPreference Stop isso vira
# erro fatal quando redirecionado. Por isso as chamadas vao via cmd /c.
$ErrorActionPreference = 'Continue'
cmd /c "`"$Pm2Cmd`" describe $App >nul 2>nul"
if ($LASTEXITCODE -eq 0) {
  cmd /c "`"$Pm2Cmd`" restart $App"
} else {
  cmd /c "`"$Pm2Cmd`" start `"$(Join-Path $Raiz 'ecosystem.config.cjs')`""
}
if ($LASTEXITCODE -ne 0) { Write-Host 'ERRO ao subir no PM2.' -ForegroundColor Red; exit 1 }
cmd /c "`"$Pm2Cmd`" save"
$ErrorActionPreference = 'Stop'

Start-Sleep -Seconds 5
try {
  $r = Invoke-WebRequest -Uri "http://localhost:$Porta" -UseBasicParsing -TimeoutSec 10
  Write-Host ("OK: http://localhost:{0} respondeu {1}" -f $Porta, $r.StatusCode) -ForegroundColor Green
} catch {
  Write-Host "AVISO: porta $Porta ainda nao respondeu - veja: pm2 logs $App --lines 30" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Proximo passo: cadastrar no RovalConnecta (Gestao de Sistemas):' -ForegroundColor Cyan
Write-Host '  Rota ................: http://192.168.1.4:3008'
Write-Host '  URL de sincronizacao : http://192.168.1.4:3008/api/sync/users'
Write-Host '  Segredo HMAC ........: COLAR o valor de ROVAL_SYNC_SECRET do backend\.env (nao clicar em Gerar)'
Write-Host '  Depois: deploy-producao.ps1 -ModuleId <UUID do sistema criado>'
