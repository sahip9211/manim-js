import { createVortex } from './webgpu.js';
import { initialVortex, cpuAdvect, cpuProjection, difference } from './model.js';
import { expandSymmetry, packSymmetry } from './symmetry.js';

export async function validateSymmetry(device) {
  const checks = [];
  for (const size of [8, 16, 32])
    for (const iterations of [1, 3, 80]) {
      const packed = packSymmetry(initialVortex(size), size);
      let seed = 3927;
      for (let i = 0; i < packed.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        packed[i] += (seed / 4294967296 - 0.5) * 0.2;
      }
      const field = expandSymmetry(packed, size),
        dt = iterations === 80 ? 0.02 : 0;
      const reference = cpuProjection(cpuAdvect(field, size, dt, 1 / 1600), size, iterations);
      const solver = await createVortex(device, {
        size,
        iterations,
        dt,
        pressureKernel: 'fft-real8-symmetry',
        resolution: 16,
        raySteps: 8,
      });
      try {
        solver.reset(field);
        solver.step();
        const error = difference(await solver.readState(), reference),
          passed =
            Number.isFinite(error.maxAbsolute) &&
            error.maxAbsolute < 2e-5 &&
            error.relativeL2 < 2e-5;
        checks.push({
          name: 'full-domain CPU reference for random symmetric field',
          size,
          iterations,
          dt,
          ...error,
          passed,
        });
        if (!passed)
          throw new Error(`Symmetry CPU reference failed: ${JSON.stringify(checks.at(-1))}`);
        field[field.length - 4] += 0.1;
        let rejected = false;
        try {
          solver.reset(field);
        } catch (error) {
          rejected = error instanceof RangeError && error.message.includes('symmetr');
        }
        checks.push({ name: 'asymmetric reset is rejected', size, iterations, passed: rejected });
        if (!rejected) throw new Error('Symmetry guard did not reject asymmetric input');
      } finally {
        solver.dispose();
      }
    }
  return checks;
}
