"""Vectorized animated surface rendered by the pinned, unmodified ManimGL checkout.

The timestamp render-pass wrapper follows manimlib/renderer/gpu.py (MIT,
Copyright (c) 2020-2026 3Blue1Brown LLC); see THIRD_PARTY_NOTICES.md.
"""
import argparse
import contextlib
import json
import os
from pathlib import Path
import resource
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--quick', action='store_true')
args = parser.parse_args()
# ManimGL parses argv when imported; the benchmark options belong to this runner.
sys.argv = [sys.argv[0]]
import numpy as np
import wgpu
from manimlib import Camera, Surface
from manimlib.renderer.gpu import RenderPass

root = Path(__file__).resolve().parents[2]
config = json.loads((root / 'experiments/parity/workload.json').read_text())
if args.quick:
    config.update(uSegments=128, vSegments=64, frames=16, rounds=1)
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
started = time.perf_counter()
report = dict(experiment='009-manim-parity', engine='manimgl', status='running',
              config=config, samples=[], errors=[], frames=[])

# Explicitly use the same integrated GPU used by the browser benchmark.
adapters = wgpu.gpu.enumerate_adapters_sync()
needle = os.environ.get('MANIM_JS_REFERENCE_ADAPTER', 'Intel').lower()
selected = next((a for a in adapters if needle in str(dict(a.info)).lower()), None)
if selected is None:
    raise RuntimeError('Requested reference adapter unavailable')
report['adapter'] = dict(selected.info)
original_request = selected.request_device_sync
features = ['timestamp-query'] if 'timestamp-query' in selected.features else []
selected.request_device_sync = lambda **kw: original_request(required_features=features, **kw)
wgpu.gpu.request_adapter_sync = lambda **kw: selected

nu, nv = config['uSegments'] + 1, config['vSegments'] + 1
u = np.linspace(0, 2 * np.pi, nu)[:, None]
v = np.linspace(0, 2 * np.pi, nv)[None, :]
cu, su, cv, sv = np.cos(u), np.sin(u), np.cos(v), np.sin(v)
s3, c3 = np.sin(3*u), np.cos(3*u)
s6v, c6v = np.sin(6*u + 2*v), np.cos(6*u + 2*v)
points = np.empty((nu, nv, 3), np.float32)
colors = np.empty((nu, nv, 4), np.float32)
colors[..., 0] = 0.25 + 0.3 * (cu + 1)
colors[..., 1] = 0.35 + 0.15 * (sv + 1)
colors[..., 2] = 0.8
colors[..., 3] = 1

def geometry(phase):
    sp, cp = np.sin(phase), np.cos(phase)
    radius = 0.62 + 0.1 * (s6v * cp - c6v * sp)
    x, y = (2 + radius * cv) * cu, (2 + radius * cv) * su
    z = radius * sv + 0.2 * (s3 * cp + c3 * sp)
    # The object rotates; the camera and light stay fixed in both implementations.
    ax, az = 0.8, 0.25 * phase
    yy, zz = np.cos(ax)*y - np.sin(ax)*z, np.sin(ax)*y + np.cos(ax)*z
    points[..., 0] = np.cos(az)*x - np.sin(az)*yy
    points[..., 1] = np.sin(az)*x + np.cos(az)*yy
    points[..., 2] = zz
    return points.reshape((-1, 3))

class WaveSurface(Surface):
    def init_points(self):
        self.set_points(geometry(0))

try:
    surface = WaveSurface(resolution=(nu, nv), shading=tuple(config['shading']))
    surface.set_rgba_array(colors.reshape((-1, 4)))
    camera = Camera(resolution=(config['width'], config['height']), samples=0)
    # Match a closer framing while keeping the native perspective model.
    camera.frame.set_height(6)
    camera.refresh_uniforms()
    report['camera'] = {k: camera.gpu.frame_uniforms[k].tolist() for k in
                        ['view', 'frame_rescale_factors', 'camera_position', 'light_position']}
    queue, device = camera.gpu.queue, camera.gpu.device
    batch = config['batchSize']
    query = device.create_query_set(type='timestamp', count=2*batch) if features else None
    resolve = device.create_buffer(size=16*batch, usage=wgpu.BufferUsage.QUERY_RESOLVE | wgpu.BufferUsage.COPY_SRC) if query else None
    query_index = 0
    if query:
        @contextlib.contextmanager
        def timed_pass(attachments):
            global query_index
            encoder = device.create_command_encoder()
            render_pass = RenderPass(encoder.begin_render_pass(**attachments, timestamp_writes={
                'query_set': query, 'beginning_of_pass_write_index': 2*query_index,
                'end_of_pass_write_index': 2*query_index+1}), camera.gpu.frame_bind_group)
            try:
                yield render_pass
            finally:
                render_pass.encoder.end()
                queue.submit([encoder.finish()])
                query_index = (query_index+1) % batch
        camera.gpu.render_pass = timed_pass

    for phase in [0, .3, .6]:
        surface.set_points(geometry(phase))
        camera.capture(surface)
    queue.on_submitted_work_done_sync()
    report['setupMs'] = (time.perf_counter()-started)*1000
    for i, phase in enumerate(config['validationPhases']):
        surface.set_points(geometry(phase))
        camera.capture(surface)
        camera.get_image().save(output / f'reference-{i}.png')
        raw = bytes(camera.get_frame_bytes())
        (output / f'reference-{i}.rgba').write_bytes(raw)
        report['frames'].append(dict(phase=phase, rgba=f'reference-{i}.rgba', png=f'reference-{i}.png'))
    # Small coordinate oracle, including seam and interior samples.
    ids = np.unique(np.linspace(0, nu*nv-1, 137).astype(int))
    report['geometryChecks'] = [dict(phase=p, indices=ids.tolist(), points=geometry(p)[ids].tolist()) for p in config['validationPhases']]
    for round_index in range(config['rounds']):
        for start in range(0, config['frames'], batch):
            query_index = 0
            wall = time.perf_counter()
            cpu = time.process_time()
            updates, submissions = [], []
            for f in range(start, start+batch):
                tick = time.perf_counter()
                surface.set_points(geometry(2*np.pi*f/config['frames']))
                updated = time.perf_counter()
                camera.capture(surface)
                submitted = time.perf_counter()
                updates.append((updated-tick)*1000)
                submissions.append((submitted-updated)*1000)
            queue.on_submitted_work_done_sync()
            elapsed = (time.perf_counter()-wall)*1000/batch
            cpu_ms = (time.process_time()-cpu)*1000/batch
            gpu = None
            if query:
                encoder = device.create_command_encoder()
                encoder.resolve_query_set(query, 0, 2*batch, resolve, 0)
                queue.submit([encoder.finish()])
                q = np.frombuffer(queue.read_buffer(resolve), dtype=np.uint64).reshape((-1,2))
                gpu = ((q[:,1]-q[:,0])/1e6).tolist()
            report['samples'].append(dict(round=round_index, firstFrame=start, drainedMs=elapsed,
                processCPUMs=cpu_ms, updateMs=updates, submissionMs=submissions, gpuMs=gpu))
    report['cpuGeometryBytes'] = points.nbytes + colors.nbytes + sum(a.nbytes for a in [u,v,cu,su,cv,sv,s3,c3,s6v,c6v])
    report['gpuBufferBytes'] = sum(b.buffer.size for b in camera.gpu.shared_buffers.values()) + camera.gpu.frame_buffer.size
    report['peakProcessRSSBytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024
    report['status'] = 'complete'
except Exception as error:
    report['status'] = 'failed'
    report['errors'].append(type(error).__name__+': '+str(error))
    raise
finally:
    report['elapsedMs'] = (time.perf_counter()-started)*1000
    (output/'result.json').write_text(json.dumps(report, indent=2)+'\n')
