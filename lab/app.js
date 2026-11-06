import { makeGrid } from '../experiments/grid/model.js';
import { createGridRenderer, strategies } from '../experiments/grid/webgpu.js';
import { createFrameLoop } from '../src/index.js';

const canvas = document.querySelector('#view');
const status = document.querySelector('#status');
const select = document.querySelector('#strategy');
const phaseInput = document.querySelector('#phase');
const playButton = document.querySelector('#play');
const loadButton = document.querySelector('#load');
select.replaceChildren(
  ...strategies.map((value) =>
    Object.assign(document.createElement('option'), { textContent: value, value }),
  ),
);
select.value = 'vertex';
let device,
  renderer,
  context,
  lastTime = null,
  phase = 0.8,
  intersecting = true;
const loop = createFrameLoop((time) => {
  if (!renderer) return;
  if (loop.playing && lastTime !== null)
    phase = (phase + Math.min((time - lastTime) / 1000, 0.1)) % (2 * Math.PI);
  lastTime = time;
  renderer.draw(phase);
  if (loop.playing) phaseInput.value = phase;
});
function visibility() {
  lastTime = null;
  loop.setVisible(intersecting && !document.hidden);
}
const observer = new IntersectionObserver((entries) => {
  intersecting = entries[0].isIntersecting;
  visibility();
});
observer.observe(canvas);
document.addEventListener('visibilitychange', visibility);

async function load() {
  loadButton.disabled = true;
  loop.pause();
  playButton.textContent = 'Play';
  try {
    if (!device) {
      if (!navigator.gpu)
        throw new Error('WebGPU unavailable. Use a browser with WebGPU on HTTPS or localhost.');
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter.');
      device = await adapter.requestDevice();
      device.addEventListener('uncapturederror', (event) => {
        loop.pause();
        status.textContent = event.error.message;
      });
      device.lost.then((info) => {
        loop.pause();
        status.textContent = `Device lost: ${info.message}. Reload to recover.`;
      });
      context = canvas.getContext('webgpu');
      context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'opaque',
      });
    }
    renderer?.dispose();
    renderer = null;
    renderer = await createGridRenderer(device, makeGrid(65), select.value, {
      width: canvas.width,
      height: canvas.height,
      format: navigator.gpu.getPreferredCanvasFormat(),
      presentView: () => context.getCurrentTexture().createView(),
    });
    status.textContent = JSON.stringify(renderer.metadata, null, 2);
    loop.invalidate();
  } catch (error) {
    status.textContent = String(error);
  } finally {
    loadButton.disabled = false;
  }
}
loadButton.addEventListener('click', load);
phaseInput.addEventListener('input', () => {
  phase = Number(phaseInput.value);
  loop.invalidate();
});
playButton.addEventListener('click', () => {
  if (!renderer) return;
  lastTime = null;
  if (loop.playing) loop.pause();
  else loop.play();
  playButton.textContent = loop.playing ? 'Pause' : 'Play';
});
window.addEventListener(
  'pagehide',
  () => {
    loop.dispose();
    observer.disconnect();
    renderer?.dispose();
    device?.destroy();
  },
  { once: true },
);
// Automation can use the modules without initializing a separate preview device.
if (!new URLSearchParams(location.search).has('bench')) load();
else status.textContent = 'Benchmark mode: preview disabled.';
