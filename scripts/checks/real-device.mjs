import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

if (process.argv.includes('--help')) {
  console.log(
    'Run from a normal desktop terminal: npm run test:real -- --quick --system-firefox\nOmit --quick for full workloads. --headless is optional; headed browsers are the default.\n--system-firefox uses installed Firefox via BiDi; otherwise install Playwright Firefox.\n--experimental-webgpu opts into flags/preferences in temporary test profiles only.\nNo drivers, existing profiles, permissions or system settings are changed.',
  );
  process.exit(0);
}
const quick = process.argv.includes('--quick'),
  headed = !process.argv.includes('--headless');
const browserFlags = [
  ...(headed ? ['--headed'] : []),
  ...process.argv.filter((x) => ['--system-firefox', '--experimental-webgpu'].includes(x)),
];
const createdAt = new Date().toISOString(),
  directory = `results/runs/${createdAt.replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}-real-device`;
await mkdir(directory, { recursive: true });
const report = {
  createdAt,
  status: 'running',
  platform: os.platform(),
  release: os.release(),
  cpu: os.cpus()[0]?.model,
  headed,
  quick,
  browserFlags,
  steps: [],
  note: 'Runs on the machine that invokes this command. Hardware status comes from adapter/browser results; this launcher does not assume a real GPU is present.',
};
const tests = (await readdir('tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `tests/${name}`);
const steps = [
  ['unit-tests', ['--test', '--test-isolation=none', ...tests]],
  ['build', ['scripts/build.mjs']],
  ['browser-compatibility', ['scripts/checks/browsers.mjs', ...browserFlags]],
  [
    'browser-fluid',
    ['scripts/benchmarks/fluid-browser.mjs', ...browserFlags, ...(quick ? ['--quick'] : [])],
  ],
  [
    'browser-pressure',
    [
      'scripts/benchmarks/fluid-browser.mjs',
      '--pressure',
      ...browserFlags,
      ...(quick ? ['--quick'] : []),
    ],
  ],
  ['native-pressure', ['scripts/benchmarks/pressure.mjs', ...(quick ? ['--quick'] : [])]],
  ['summary', ['scripts/reports/runs.mjs']],
];
await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2) + '\n');
for (const [name, args] of steps) {
  console.log(`\nRunning ${name}`);
  const started = performance.now();
  const log = createWriteStream(`${directory}/${name}.log`);
  const outcome = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      log.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (error) => resolve({ exitCode: null, error: String(error) }));
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  await new Promise((resolve) => log.end(resolve));
  report.steps.push({ name, args, ...outcome, elapsedMs: performance.now() - started });
  await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2) + '\n');
  // A failed prerequisite should not produce misleading browser measurements.
  if (outcome.exitCode !== 0 && ['unit-tests', 'build'].includes(name)) break;
}
report.status =
  report.steps.length === steps.length && report.steps.every((x) => x.exitCode === 0)
    ? 'passed'
    : 'incomplete';
await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2) + '\n');
console.log(
  `\n${report.status}: ${directory}/result.json\nIndividual experiments retain telemetry in their own results/runs directories.`,
);
if (report.status !== 'passed') process.exitCode = 1;
