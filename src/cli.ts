#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { BridgeError, callAE, type Command, type Result } from './bridge.js';

export function parseArgs(args: string[]): { command: Command; timeoutMs: number; ipcRoot?: string } {
  const [command, ...options] = args;
  if (command !== 'host-info' && command !== 'project-info')
    throw new BridgeError('INVALID_ARGUMENT', 'Use host-info or project-info');
  let timeoutMs = 10000;
  let ipcRoot: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < options.length; i += 2) {
    const flag = options[i], value = options[i + 1];
    if (!value || seen.has(flag)) throw new BridgeError('INVALID_ARGUMENT', 'Missing or duplicate option: ' + flag);
    seen.add(flag);
    if (flag === '--timeout-ms' && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 300000) timeoutMs = Number(value);
    else if (flag === '--ipc-dir') ipcRoot = value;
    else throw new BridgeError('INVALID_ARGUMENT', 'Unknown option or invalid value: ' + flag);
  }
  return { command, timeoutMs, ipcRoot };
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).length === 1 && process.argv[2] === '--help') {
    console.log('saving <host-info|project-info> [--timeout-ms 10000] [--ipc-dir <directory>]\nWindows; AE must already be running. Outputs one JSON receipt. Exit: 0 success, 1 failure.');
  } else {
    const requestId = randomUUID();
    let result: Result;
    try {
      const args = parseArgs(process.argv.slice(2));
      result = await callAE(args.command, requestId, args.timeoutMs, args.ipcRoot);
    } catch (error) {
      result = { protocol: 1, requestId, ok: false, error: {
        code: error instanceof BridgeError ? error.code : 'CLI_ERROR', message: error instanceof Error ? error.message : String(error)
      } };
    }
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  }
}
