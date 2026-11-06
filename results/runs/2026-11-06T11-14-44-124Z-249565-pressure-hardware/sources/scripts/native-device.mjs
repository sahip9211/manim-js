import { existsSync } from 'node:fs';
import { create, globals } from 'webgpu';

export async function nativeDevice(software = false) {
  if (software) {
    const icd = process.env.LEAN_JS_SWIFTSHADER_ICD ?? '/usr/lib/chromium/vk_swiftshader_icd.json';
    if (!existsSync(icd)) throw new Error('Set LEAN_JS_SWIFTSHADER_ICD to your SwiftShader Vulkan ICD JSON');
    process.env.VK_ICD_FILENAMES = icd;
  }
  Object.assign(globalThis, globals);
  const adapterName = !software ? process.env.LEAN_JS_ADAPTER : undefined;
  const gpu = create(software ? ['backend=vulkan'] : adapterName ? [`adapter=${adapterName}`] : []);
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter');
  if (adapter.info.isFallbackAdapter && !software) throw new Error('Software adapter detected. Run explicitly with --software; refusing to label it as hardware.');
  const features = adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
  const device = await adapter.requestDevice({ requiredFeatures: features });
  return { gpu, adapter, device, metadata: {
    runtime: 'Node + Dawn (not browser)', softwareRequested: software, requestedAdapter: adapterName ?? null,
    adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter },
    features: [...adapter.features], timestamps: features.length > 0,
  } };
}
