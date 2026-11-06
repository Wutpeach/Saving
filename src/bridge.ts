import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export type Command = 'host-info' | 'project-info';
export type Result = { protocol: 1; requestId: string; ok: boolean; data?: unknown;
  error?: { code: string; message: string }; ipcDirectory?: string };
export class BridgeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function jsxLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
async function powershell(script: string): Promise<string> {
  const encoded = Buffer.from('[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ' + script, 'utf16le').toString('base64');
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 15000, encoding: 'utf8' });
  return stdout.trim();
}
export async function scriptArgument(launcherPath: string): Promise<string> {
  if (!/\s/.test(launcherPath)) return launcherPath;
  // AE 26.3 silently ignores quoted -r paths containing spaces on the tested Windows host.
  const shortPath = await powershell("$ErrorActionPreference = 'Stop'; (New-Object -ComObject Scripting.FileSystemObject).GetFile('" + launcherPath.replace(/'/g, "''") + "').ShortPath");
  if (!shortPath || /\s/.test(shortPath)) throw new BridgeError('AE_SCRIPT_PATH_UNSUPPORTED',
    'AE requires a script path without spaces. Use --ipc-dir with a space-free path on this volume (8.3 short names are unavailable).');
  return shortPath;
}
export async function runningAE(): Promise<{ pid: number; executable: string }[]> {
  if (process.platform !== 'win32') throw new BridgeError('UNSUPPORTED_PLATFORM', 'Only Windows is supported in this phase');
  const stdout = await powershell("$ErrorActionPreference = 'Stop'; @(Get-CimInstance Win32_Process -Filter \"Name = 'AfterFX.exe'\" | Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress");
  const parsed = stdout ? JSON.parse(stdout) : [];
  return (Array.isArray(parsed) ? parsed : [parsed]).map(p => ({ pid: p.ProcessId, executable: p.ExecutablePath }));
}
export function selectAE(processes: { pid: number; executable: string }[]): { pid: number; executable: string } {
  if (!processes.length) throw new BridgeError('AE_NOT_RUNNING', 'Start After Effects before calling Saving');
  if (processes.length !== 1) throw new BridgeError('AE_MULTIPLE_INSTANCES', 'Multiple AE processes found; reliable instance targeting is not supported');
  if (!processes[0].executable) throw new BridgeError('AE_PATH_UNAVAILABLE', 'Cannot read the running AE executable path');
  return processes[0];
}
export async function waitForResult(file: string, requestId: string, deadline: number, launchError: () => Error | undefined = () => undefined): Promise<Result> {
  while (Date.now() < deadline) {
    let content: string;
    try { content = await readFile(file, 'utf8'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const failure = launchError();
      if (failure) throw new BridgeError('AE_LAUNCH_FAILED', failure.message);
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
      continue;
    }
    let result: Result;
    try { result = JSON.parse(content.replace(/^﻿/, '')); } catch {
      throw new BridgeError('INVALID_RESPONSE', 'AE returned invalid JSON');
    }
    if (!result || result.protocol !== 1 || result.requestId !== requestId || typeof result.ok !== 'boolean' ||
        (result.ok ? !Object.hasOwn(result, 'data') : typeof result.error?.code !== 'string' || typeof result.error?.message !== 'string'))
      throw new BridgeError('INVALID_RESPONSE', 'AE response identity or shape does not match the request');
    return result;
  }
  throw new BridgeError('AE_TIMEOUT', 'No matching AE completion receipt before deadline; execution is unconfirmed. Check AE dialogs and scripting file access.');
}
export async function callAE(command: Command, requestId: string, timeoutMs: number, ipcRoot = path.join(tmpdir(), 'Saving IPC')): Promise<Result> {
  const ae = selectAE(await runningAE());
  const directory = path.resolve(ipcRoot, requestId);
  await mkdir(directory, { recursive: true });
  const launcherPath = path.join(directory, 'request.jsx');
  await writeFile(launcherPath, '', 'utf8');
  const argument = await scriptArgument(launcherPath);
  const deadline = Date.now() + timeoutMs;
  const request = { protocol: 1, requestId, command, deadline };
  const responsePath = path.join(directory, 'response.json');
  const hostPath = fileURLToPath(new URL('./host/operations.jsx', import.meta.url));
  const launcher = '$.evalFile(new File(' + jsxLiteral(hostPath) + '));\nSavingHost.run(' + jsxLiteral(request) + ', ' + jsxLiteral(responsePath) + ');\n';
  await writeFile(path.join(directory, 'request.json'), JSON.stringify(request, null, 2), 'utf8');
  await writeFile(launcherPath, launcher, 'utf8');
  let launchError: Error | undefined;
  const child = spawn(ae.executable, ['-r', argument], { windowsHide: true, stdio: 'ignore' });
  child.on('error', error => { launchError = error; });
  child.unref();
  // The launcher can exit before AE runs the script. Only the receipt confirms completion.
  try {
    return { ...await waitForResult(responsePath, requestId, deadline, () => launchError), ipcDirectory: directory };
  } catch (error) {
    if (error instanceof BridgeError) return { protocol: 1, requestId, ok: false,
      error: { code: error.code, message: error.message }, ipcDirectory: directory };
    throw error;
  }
}
