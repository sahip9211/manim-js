import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { nativeDevice } from '../lib/native-device.mjs';
import { png } from '../lib/png.mjs';

// Executes the actual classic-script bundle with a native GPU and a minimal host.
// This verifies packaging + WGSL rendering, NOT real browser/DOM compatibility.
const software = process.argv.includes('--software');
// The native binding's GPU owner must outlive asynchronous ProcessEvents calls.
const native = await nativeDevice(software);
const { device, adapter, metadata } = native;
const report = {
  ...metadata,
  status: 'running',
  host: 'Node VM with simulated canvas/scheduler and real Dawn WebGPU',
  checks: [],
};
let texture, grid;
try {
  const errors = [];
  device.addEventListener('uncapturederror', (e) => errors.push(e.error.message));
  let nextId = 0;
  const callbacks = new Map(),
    listeners = new Map();
  const context = {
    configure() {
      texture = device.createTexture({
        size: [640, 480],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    },
    getCurrentTexture() {
      return texture;
    },
    unconfigure() {},
  };
  const canvas = {
    width: 640,
    height: 480,
    getContext: (name) => (name === 'webgpu' ? context : null),
    ownerDocument: {
      hidden: false,
      addEventListener: (key, f) => listeners.set(key, f),
      removeEventListener: (key) => listeners.delete(key),
    },
  };
  const sandbox = vm.createContext({
    performance,
    console,
    GPUBufferUsage,
    GPUTextureUsage,
    GPUMapMode,
    navigator: {
      gpu: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'rgba8unorm' },
    },
    requestAnimationFrame: (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => callbacks.delete(id),
  });
  // Use the existing device so readback and rendering share the same queue.
  sandbox.navigator.gpu.requestAdapter = async () => ({ requestDevice: async () => device });
  new vm.Script(await readFile('dist/manim.js', 'utf8'), {
    filename: 'dist/manim.js',
  }).runInContext(sandbox);
  assert.equal(typeof sandbox.ManimJS.createFrameLoop, 'function');
  assert.equal(typeof sandbox.ManimJS.experimental.createGrid, 'function');
  grid = await sandbox.ManimJS.experimental.createGrid(canvas, { backend: 'webgpu', size: 33 });
  assert.equal(callbacks.size, 1);
  const tick = (time) => {
    const [id, callback] = callbacks.entries().next().value;
    callbacks.delete(id);
    callback(time);
  };
  tick(0);
  assert.equal(callbacks.size, 0);
  report.checks.push('classic script global + one static frame + idle scheduling');
  const buffer = device.createBuffer({
    size: 640 * 480 * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 640 * 4 }, [640, 480]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const pixels = new Uint8Array(buffer.getMappedRange()).slice();
    let foreground = 0;
    for (let i = 1; i < pixels.length; i += 4) if (pixels[i] > 80) foreground++;
    assert.ok(foreground > 1000);
    report.foregroundPixels = foreground;
    await writeFile('results/standalone-native.png', png(pixels, 640, 480));
    report.checks.push('bundled WGSL compiles and renders nonempty image through Dawn');
  } finally {
    buffer.destroy();
  }
  grid.set({ phase: 2.4, amplitude: -0.25 });
  grid.set({ phase: 0.7 });
  assert.equal(callbacks.size, 1);
  tick(16);
  assert.throws(() => grid.set({ amplitude: 1 }));
  grid.play();
  tick(32);
  assert.equal(callbacks.size, 1);
  grid.pause();
  assert.equal(callbacks.size, 0);
  canvas.ownerDocument.hidden = true;
  listeners.get('visibilitychange')();
  grid.set({ phase: 0.4 });
  assert.equal(callbacks.size, 0);
  canvas.ownerDocument.hidden = false;
  listeners.get('visibilitychange')();
  assert.equal(callbacks.size, 1);
  tick(48);
  await device.queue.onSubmittedWorkDone();
  grid.dispose();
  grid.dispose();
  assert.equal(listeners.size, 0);
  assert.equal(callbacks.size, 0);
  assert.throws(() => grid.set({ phase: 1 }));
  report.checks.push('coalescing, playback, visibility, parameter bounds and disposal');
  const esm = await import('../../dist/manim.module.js');
  assert.equal(typeof esm.experimental.createGrid, 'function');
  report.checks.push('self-contained ES module imports');
  assert.deepEqual(errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  grid?.dispose();
  texture?.destroy();
  device.destroy();
  assert.ok(native.gpu);
  await writeFile('results/standalone-native.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
}
