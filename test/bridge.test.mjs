import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { waitForResult, jsxLiteral, selectAE } from '../dist/bridge.js';
import { parseArgs } from '../dist/cli.js';

test('arguments reject invalid, missing, duplicate and unsafe timeout values', () => {
  assert.deepEqual(parseArgs(['host-info']), { command: 'host-info', timeoutMs: 10000, ipcRoot: undefined });
  for (const args of [[], ['exec'], ['host-info', '--timeout-ms', 'NaN'], ['host-info', '--timeout-ms', '0'],
    ['host-info', '--ipc-dir'], ['host-info', '--timeout-ms', '300001'],
    ['host-info', '--ipc-dir', 'a', '--ipc-dir', 'b']]) assert.throws(() => parseArgs(args));
});

test('JSX literal preserves Unicode, spaces, quotes, slashes and line separators', () => {
  const name = '中文 空格 " \\ \n\t' + String.fromCharCode(0x2028, 0x2029);
  assert.equal(vm.runInNewContext(jsxLiteral(name)), name);
  assert.ok(!jsxLiteral(name).includes(String.fromCharCode(0x2028)));
});

test('AE selection refuses absent, multiple and inaccessible instances without launching', () => {
  const instance = { pid: 123, executable: 'C:/Adobe/AfterFX.exe' };
  assert.deepEqual(selectAE([instance]), instance);
  assert.throws(() => selectAE([]), { code: 'AE_NOT_RUNNING' });
  assert.throws(() => selectAE([instance, { ...instance, pid: 456 }]), { code: 'AE_MULTIPLE_INSTANCES' });
  assert.throws(() => selectAE([{ pid: 123, executable: null }]), { code: 'AE_PATH_UNAVAILABLE' });
});

test('receipt is required: late completion, BOM, wrong identity, malformed shape and timeout', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'saving-test-'));
  try {
    const file = path.join(directory, 'response.json');
    const result = { protocol: 1, requestId: 'right', ok: true, data: { name: '中文 空格' } };
    const pending = waitForResult(file, 'right', Date.now() + 1000);
    setTimeout(() => writeFile(file, '\uFEFF' + JSON.stringify(result)), 80);
    assert.deepEqual(await pending, result);
    await assert.rejects(waitForResult(file, 'wrong', Date.now() + 1000), { code: 'INVALID_RESPONSE' });
    await writeFile(file, JSON.stringify({ ...result, data: undefined }));
    await assert.rejects(waitForResult(file, 'right', Date.now() + 1000), { code: 'INVALID_RESPONSE' });
    await writeFile(file, '{broken');
    await assert.rejects(waitForResult(file, 'right', Date.now() + 1000), { code: 'INVALID_RESPONSE' });
    await writeFile(file, 'null');
    await assert.rejects(waitForResult(file, 'right', Date.now() + 1000), { code: 'INVALID_RESPONSE' });
    await rm(file);
    await assert.rejects(waitForResult(file, 'right', Date.now() + 25), { code: 'AE_TIMEOUT' });
    await assert.rejects(waitForResult(file, 'right', Date.now() + 1000, () => new Error('launch failed')), { code: 'AE_LAUNCH_FAILED' });
  } finally { await rm(directory, { recursive: true }); }
});

test('shared ES3 host handles no comp, Unicode, expired/unknown requests and script errors', async () => {
  const source = await readFile('src/host/operations.jsx', 'utf8');
  const context = vm.createContext({ app: { version: 'test', buildName: '中文 " \\ \n', buildNumber: 1,
    isoLanguage: 'zh_CN', project: { file: null, numItems: 0, dirty: false, activeItem: null } }, CompItem: function () {} });
  vm.runInContext(source, context);
  const request = { protocol: 1, requestId: 'unit', deadline: Date.now() + 10000, command: 'host-info' };
  const run = () => JSON.parse(context.SavingHost.execute(request));
  assert.equal(run().data.buildName, context.app.buildName);
  request.command = 'project-info';
  assert.equal(run().data.activeComposition, null);
  request.command = 'unknown';
  assert.equal(run().error.code, 'UNKNOWN_COMMAND');
  request.deadline = 0;
  assert.equal(run().error.code, 'REQUEST_EXPIRED');
  request.deadline = Date.now() + 10000;
  request.command = 'host-info';
  Object.defineProperty(context.app, 'version', { get() { throw new Error('测试脚本错误'); } });
  assert.equal(run().error.code, 'AE_SCRIPT_ERROR');
});
