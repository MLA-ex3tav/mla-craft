// MLA Craft MCSR Co-op wrapper v1
// Generated into an opted-in server directory. Start with: node server.js
// No npm dependencies. Dynamic imports work with either CommonJS or ESM parents.
(async () => {
  const { spawn } = await import('node:child_process');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { createInterface } = await import('node:readline');
  const { randomBytes } = await import('node:crypto');
  const root = await fs.realpath(path.dirname(path.resolve(process.argv[1])));
  const config = JSON.parse(await fs.readFile(path.join(root, 'mcsr-launch.json'), 'utf8'));
  if (typeof config.java !== 'string' || !Array.isArray(config.args) || !config.args.every(x => typeof x === 'string')) {
    throw new Error('Configuración MCSR inválida.');
  }
  let child = null;
  let stopping = false;
  let shutdownTimer;
  let lock;
  const lockPath = path.join(root, '.mcsr.lock');
  try { lock = await fs.open(lockPath, 'wx'); }
  catch { throw new Error('Ya hay un wrapper MCSR activo o quedó .mcsr.lock. Comprueba los procesos antes de retirar el bloqueo.'); }
  await lock.writeFile(String(process.pid));

  const log = message => console.log(`[MLA MCSR] ${message}`);
  const input = createInterface({ input: process.stdin, terminal: false });
  function send(command) {
    if (child && !child.stdin.destroyed && child.stdin.writable) child.stdin.write(`${command}\n`);
  }
  function shutdown(force = false) {
    stopping = true;
    if (!child) return;
    if (force) { child.kill('SIGKILL'); return; }
    send('stop');
    if (!shutdownTimer) shutdownTimer = setTimeout(() => child?.kill('SIGKILL'), 25000);
  }
  input.on('line', line => {
    const command = line.trim().replace(/^\//, '');
    if (command === '__MLA_MCSR_SHUTDOWN__') shutdown();
    else if (command === '__MLA_MCSR_FORCE_STOP__') shutdown(true);
    else send(command);
  });
  input.on('close', () => shutdown());
  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());

  // Never traverse a junction/symlink, even if it occurs inside world.
  async function validateTree(target) {
    const stat = await fs.lstat(target).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Se rechazó un enlace en el mundo: ${target}`);
    const real = await fs.realpath(target);
    if (real !== target || !real.startsWith(root + path.sep)) throw new Error('El mundo sale de la carpeta del servidor.');
    if (stat.isDirectory()) {
      for (const name of await fs.readdir(target)) await validateTree(path.join(target, name));
    }
  }
  async function configure() {
    const file = path.join(root, 'server.properties');
    const stat = await fs.lstat(file).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error('server.properties no puede ser un enlace.');
    const text = stat ? await fs.readFile(file, 'utf8') : '';
    const required = {
      'spawn-protection': '0', 'allow-flight': 'true', 'level-name': 'world',
      'level-seed': randomBytes(8).readBigInt64BE().toString(),
    };
    // Keep comments and unrelated settings, remove duplicate managed properties.
    const lines = text.split(/\r?\n/).filter(line => {
      const match = line.match(/^\s*([^#!\s=:]+)\s*(?:[=:]|\s)/);
      return !match || !(match[1] in required);
    });
    for (const [key, value] of Object.entries(required)) lines.push(`${key}=${value}`);
    await fs.writeFile(file, lines.join('\n') + '\n');
  }
  function runJava() {
    return new Promise((resolve, reject) => {
      let ready = false;
      let cleanStop = false;
      child = spawn(config.java, config.args, { cwd: root, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const current = child;
      current.stdin.on('error', error => { if (error.code !== 'EPIPE') log(error.message); });
      current.once('error', reject);
      for (const [stream, output] of [[current.stdout, process.stdout], [current.stderr, process.stderr]]) {
        const reader = createInterface({ input: stream });
        reader.on('line', line => {
          output.write(line + '\n');
          // Match actual server logger messages, not chat text containing "Done".
          const message = line.match(/^\[[^\]]+\] \[(?:Server thread|main)\/INFO\](?: \[[^\]]+\])?: (.*)$/)?.[1];
          if (!ready && message && /^Done \([^)]+\)!/.test(message)) {
            ready = true;
            if (!stopping) { send('save-off'); log('Servidor listo; save-off enviado.'); }
          }
          if (message === 'Stopping server') cleanStop = true;
        });
      }
      // close waits for process termination AND drained stdout/stderr.
      current.once('close', (code, signal) => {
        child = null;
        clearTimeout(shutdownTimer);
        shutdownTimer = undefined;
        resolve({ code, signal, ready, cleanStop });
      });
    });
  }

  try {
    const world = path.join(root, 'world');
    await validateTree(world);
    while (!stopping) {
      await configure();
      if (stopping) break;
      log('STARTING');
      const result = await runJava();
      if (stopping) break;
      if (result.code !== 0 || result.signal || !result.ready || !result.cleanStop) {
        throw new Error('Java terminó sin un cierre limpio tras el arranque. Se conserva world y se detiene el bucle.');
      }
      await validateTree(world);
      if (stopping) break;
      log('Eliminando world para la siguiente partida…');
      await fs.rm(world, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      // The next iteration writes a new random seed before launching Java.
    }
  } finally {
    input.close();
    process.stdin.pause();
    clearTimeout(shutdownTimer);
    await lock.close();
    await fs.unlink(lockPath);
  }
})().catch(error => { console.error(`[MLA MCSR] ${error.message}`); process.exitCode = 1; });
