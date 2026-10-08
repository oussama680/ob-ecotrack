@echo off
cd /d C:\OBShopify\ob-ecotrack
if not exist logs mkdir logs
node scripts\samex-sync-worker.mjs >> logs\samex-auto-sync.log 2>&1
