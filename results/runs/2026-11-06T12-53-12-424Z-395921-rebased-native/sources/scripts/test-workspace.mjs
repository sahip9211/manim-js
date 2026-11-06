import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const testWindowClass = 'lean-js-benchmark';

// Isolate headed benchmarks without changing focus. Install the rule before
// windows map. Only this test-specific class matches; no config file is edited.
export async function prepareTestWorkspace(headed) {
  if (!headed || !process.env.HYPRLAND_INSTANCE_SIGNATURE) return null;
  const workspace = Number(process.env.LEAN_JS_TEST_WORKSPACE ?? 5);
  if (!Number.isInteger(workspace) || workspace < 1) throw new Error('Invalid test workspace');
  const lua = `hl.window_rule({ name = "lean-js-benchmark", match = { class = "^lean-js-benchmark$" }, workspace = "${workspace} silent", no_initial_focus = true, focus_on_activate = false, suppress_event = "activate activatefocus" })`;
  const { stdout } = await exec('hyprctl', ['eval', lua]);
  if (stdout.trim() !== 'ok') throw new Error(`Could not isolate test windows: ${stdout}`);
  return { workspace, silent: true, windowClass: testWindowClass, rule: lua };
}

export async function inspectTestWorkspace(placement) {
  if (!placement) return null;
  const { stdout } = await exec('hyprctl', ['clients', '-j']);
  const clients = JSON.parse(stdout).filter(x => x.class === testWindowClass);
  if (!clients.length || clients.some(x => x.workspace.id !== placement.workspace)) throw new Error('Test window did not map onto its requested workspace');
  const active = JSON.parse((await exec('hyprctl', ['activeworkspace', '-j'])).stdout);
  return { ...placement, observedWorkspaces: clients.map(x => x.workspace.id), activeWorkspace: active.id };
}
