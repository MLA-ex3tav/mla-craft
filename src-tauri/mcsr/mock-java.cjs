const fs = require('node:fs');
const readline = require('node:readline');
const boot = Number(fs.existsSync('boots') ? fs.readFileSync('boots', 'utf8') : 0) + 1;
fs.writeFileSync('boots', String(boot));
fs.mkdirSync('world', { recursive: true });
fs.writeFileSync(`world/boot-${boot}`, 'world data');
if (process.argv.includes('crash')) process.exit(1);
console.log('[00:00:00] [Server thread/INFO]: <Player> Done (1s)! fake chat');
console.log('[00:00:00] [Server thread/INFO]: Done (0.1s)! For help, type "help"');
const input = readline.createInterface({ input: process.stdin });
input.on('line', command => {
  if (command === 'save-off') console.log('[MOCK] SAVE-OFF ' + boot);
  if (command === 'crash') process.exit(1);
  if (command === 'stop') {
    console.log('[00:00:00] [Server thread/INFO]: Stopping server');
    input.close();
    process.exit(0);
  }
});
