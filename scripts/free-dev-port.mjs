// Frees the dev server port before `npm run dev` / `npm run tauri dev` starts.
//
// On Windows, Ctrl+C kills the npm/tauri parents but the children sometimes survive:
// the previous Vite keeps holding the port and the dev `mla-craft.exe` keeps its window
// open. The next launch then fails with "Port 9999 is already in use".
// Running this first makes a new dev session self-healing instead of requiring a manual
// cleanup. It only touches the dev port listener and the dev binary under target/debug.
import { execFileSync } from "node:child_process";

// Keep in sync with server.port in vite.config.ts.
const PORT = 9999;
const DEV_EXE = "mla-craft.exe";

const ps = `
$pids = New-Object System.Collections.Generic.List[int]
$owners = @(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($o in $owners) { if ($o -gt 0) { $pids.Add([int]$o) } }
$exes = @(Get-CimInstance Win32_Process -Filter "Name='${DEV_EXE}'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -like '*\\target\\debug\\*' } |
  Select-Object -ExpandProperty ProcessId)
foreach ($e in $exes) { if ($e -gt 0) { $pids.Add([int]$e) } }
$unique = @($pids | Select-Object -Unique)
foreach ($p in $unique) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
if ($unique.Count -gt 0) { "liberado: PID " + ($unique -join ", ") } else { "puerto ${PORT} libre" }
`;

let output = "no se pudo comprobar";
try {
  output = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    timeout: 20000,
  }).trim();
} catch (error) {
  // A dev convenience must never block starting the app.
  output = "aviso: no se pudo liberar el puerto (" + error.message.split("\n")[0] + ")";
}

console.log("[dev] " + output);
