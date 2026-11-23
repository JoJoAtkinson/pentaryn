#!/bin/bash
# Start (or restart) a headless Chrome on BOSS's Windows side with the real GPU (GTX 1660 Ti, ANGLE D3D11)
# and expose its CDP port to WSL at http://<WSL gateway>:9334 (netsh portproxy + firewall rule "pentaryn CDP from WSL (test harness)").
# Usage: wingpu-start.sh  → prints the browserURL. Connect with puppeteer-core: puppeteer.connect({ browserURL }).
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
GW=$(ip route | awk '/default/{print $3}')
cd /mnt/c/Windows
$PS -NoProfile -Command "Set-Location C:\\
Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ? { \$_.CommandLine -match 'pt-gpu' } | % { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
\$d=\"\$env:LOCALAPPDATA\\Temp\\pt-gpu\"; New-Item -ItemType Directory -Force \$d | Out-Null
Start-Process 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -ArgumentList '--headless=new','--remote-debugging-port=9333','--remote-allow-origins=*',\"--user-data-dir=\$d\",'--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--mute-audio','--window-size=1600,1000','about:blank'
netsh interface portproxy delete v4tov4 listenaddress=$GW listenport=9334 2>\$null | Out-Null
netsh interface portproxy add v4tov4 listenaddress=$GW listenport=9334 connectaddress=127.0.0.1 connectport=9333 | Out-Null" 2>&1 | tr -d '\r' | grep -v '^\s*$'
for i in $(seq 1 20); do curl -s -m 2 http://$GW:9334/json/version >/dev/null && break; sleep 1; done
curl -s -m 3 http://$GW:9334/json/version | grep -q Browser && echo "browserURL http://$GW:9334" || { echo "FAILED to reach Windows Chrome"; exit 1; }
