import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
async function fixture(t, extra = []) {
  const root = await fs.mkdtemp(path.join(here, '.test-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      child.stdin.write('__MLA_MCSR_FORCE_STOP__\n');
      await Promise.race([new Promise(resolve => child.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    assert.equal(path.dirname(root), here);
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.copyFile(path.join(here, 'server.js'), path.join(root, 'server.js'));
  await fs.writeFile(path.join(root, 'mcsr-launch.json'), JSON.stringify({ java: process.execPath, args: [path.join(here, 'mock-java.cjs'), ...extra] }));
  await fs.writeFile(path.join(root, 'server.properties'), 'spawn-protection=16\nallow-flight=false\nlevel-name=old\nlevel-seed=fixed\nserver-port=25566\nspawn-protection=12\n');
  return { root, start() {
    child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const done = new Promise(resolve => child.once('close', resolve));
    return { child, done, output: () => output, async wait(text) {
      const deadline = Date.now() + 5000;
      while (!output.includes(text)) {
        if (Date.now() > deadline || child.exitCode !== null) throw new Error(`Missing ${text}: ${output}`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } };
  } };
}

test('clean /stop resets only world, changes seed, sends save-off once per boot; app stop preserves world', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'mods'));
  await fs.writeFile(path.join(f.root, 'mods/keep.jar'), 'keep');
  const run = f.start();
  await run.wait('[MOCK] SAVE-OFF 1');
  const first = await fs.readFile(path.join(f.root, 'server.properties'), 'utf8');
  assert.match(first, /spawn-protection=0/);
  assert.match(first, /allow-flight=true/);
  assert.match(first, /level-name=world/);
  assert.match(first, /server-port=25566/);
  assert.equal(first.match(/spawn-protection=/g).length, 1);
  run.child.stdin.write('/stop\n');
  await run.wait('[MOCK] SAVE-OFF 2');
  assert.deepEqual(await fs.readdir(path.join(f.root, 'world')), ['boot-2']);
  assert.equal(await fs.readFile(path.join(f.root, 'mods/keep.jar'), 'utf8'), 'keep');
  const second = await fs.readFile(path.join(f.root, 'server.properties'), 'utf8');
  assert.notEqual(first.match(/level-seed=(.*)/)[1], second.match(/level-seed=(.*)/)[1]);
  run.child.stdin.write('__MLA_MCSR_SHUTDOWN__\n');
  assert.equal(await run.done, 0);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'world')), ['boot-2']);
  assert.equal(run.output().match(/\[MOCK\] SAVE-OFF/g).length, 2);
  assert.equal(await fs.readFile(path.join(f.root, 'boots'), 'utf8'), '2');
});

test('startup crash preserves world and never loops', { timeout: 10000 }, async t => {
  const f = await fixture(t, ['crash']);
  const run = f.start();
  assert.equal(await run.done, 1);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'world')), ['boot-1']);
  assert.equal(await fs.readFile(path.join(f.root, 'boots'), 'utf8'), '1');
});

test('crash after readiness does not delete a world', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const run = f.start();
  await run.wait('[MOCK] SAVE-OFF 1');
  run.child.stdin.write('crash\n');
  assert.equal(await run.done, 1);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'world')), ['boot-1']);
});

test('world junction is rejected without modifying its target', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const target = path.join(f.root, 'external-world');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'keep'), 'safe');
  try { await fs.symlink(target, path.join(f.root, 'world'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'ENOTSUP') { t.skip('This filesystem does not permit junction/symlink creation.'); return; }
    throw error;
  }
  const run = f.start();
  assert.equal(await run.done, 1);
  assert.equal(await fs.readFile(path.join(target, 'keep'), 'utf8'), 'safe');
});

test('closing app input stops Java without a reset', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const run = f.start();
  await run.wait('[MOCK] SAVE-OFF 1');
  run.child.stdin.end();
  assert.equal(await run.done, 0);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'world')), ['boot-1']);
});


test('force stop reaps Java and preserves world', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const run = f.start();
  await run.wait('[MOCK] SAVE-OFF 1');
  run.child.stdin.write('__MLA_MCSR_FORCE_STOP__\n');
  assert.equal(await run.done, 0);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'world')), ['boot-1']);
});

test('second wrapper is rejected while first owns the directory', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const run = f.start();
  await run.wait('[MOCK] SAVE-OFF 1');
  const duplicate = spawn(process.execPath, ['server.js'], { cwd: f.root, windowsHide: true, stdio: 'ignore' });
  const code = await new Promise(resolve => duplicate.once('close', resolve));
  assert.equal(code, 1);
  assert.equal(await fs.readFile(path.join(f.root, 'boots'), 'utf8'), '1');
  run.child.stdin.write('__MLA_MCSR_SHUTDOWN__\n');
  assert.equal(await run.done, 0);
});
