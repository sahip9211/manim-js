# Running on a real desktop

Use the same checkout in a normal terminal on the desktop with the GPU. The launcher uses existing permissions. Experimental WebGPU flags affect temporary test profiles only; it does not modify drivers, existing browser profiles or system settings.

From a local checkout:

```sh
cd /path/to/manim-js
npm run test:real -- --quick --system-firefox
```

Chromium defaults to `/usr/bin/chromium`; override `CHROMIUM_PATH` if necessary. The default Playwright path requires its patched Firefox browser. Add `--system-firefox` to use `/usr/bin/firefox` through WebDriver BiDi instead. Its exact version is recorded in results and may differ from the desktop-installed Firefox. The browser download stays under ignored `vendor/playwright/`.

The quick run executes unit tests, builds the standalone file, checks both browser backends and the actual HTML example, runs fluid and pressure-kernel browser workloads, attempts native hardware pressure benchmarks, and generates summaries. Browsers are headed by default. Omit `--quick` for the full measured suites. `--headless` is available but must be reported when comparing results.

Each stage writes a console log under `results/runs/*-real-device/`. Individual experiments write their own `result.json` and `telemetry.json`, while the pressure runner also freezes source files. The launcher continues after unavailable browser/GPU stages so all failures are visible; its final `incomplete` status can include unsupported optional WebGPU, not just code failures.

No software-renderer flags are supplied by this launcher. Native and browser workloads reject reported fallback adapters for hardware measurements. Inspect adapter identity: a successful process launch alone does not prove physical-GPU rendering. If a container or VM has no GPU device passed through, the host must expose a GPU before hardware tests can run.

For the ordinary desktop-installed Firefox, run `npm run dev` and open `/examples/standalone.html` and `/lab/compatibility.html` on the printed localhost address. The latter exports browser capabilities and image-check results. These manual checks complement, rather than replace, the automated performance runs.

## Recorded hardware configuration

The recorded Linux runs used Intel UHD and NVIDIA MX250 adapters, installed Chromium and Firefox, and accessible GPU counters. Earlier blocked attempts remain in the historical logs. Other machines must report their own capabilities.

Use installed Firefox without a download:

```sh
npm run check:browsers -- --headed --system-firefox
npm run test:real -- --quick --system-firefox
```

On this machine, default-browser WebGL2 passes while optional WebGPU is unavailable. To test WebGPU separately, opt into experimental configuration in disposable profiles:

```sh
npm run test:real -- --quick --system-firefox --experimental-webgpu
npm run bench:fluid:browser -- --headed --system-firefox --experimental-webgpu --heavy
npm run bench:pressure:browser -- --headed --system-firefox --experimental-webgpu --include-tiled
MANIM_JS_ADAPTER='NVIDIA GeForce MX250' npm run bench:pressure -- --include-tiled
```

Chromium uses its experimental WebGPU/Vulkan launch flags. Firefox uses `dom.webgpu.enabled` in a new temporary profile. These results must not be described as default-browser WebGPU compatibility. Exact flags, preferences, versions, source hashes and adapter information are recorded. Firefox can redact adapter identity; Linux DRM counters identify the observed GPU clients separately.

The installed Firefox path uses the browser's [native WebDriver BiDi endpoint](https://developer.mozilla.org/en-US/docs/Web/WebDriver/How_to/Create_BiDi_connection) with a localhost asset server. Chromium and the optional Playwright Firefox build use in-process asset routing. Both approaches leave existing profiles alone. Set `FIREFOX_PATH` or `CHROMIUM_PATH` to override the installed executables.

[WebGPU implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) and [Chrome troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips) explain why OS, GPU generation and browser settings can affect availability even when device access works.

## Keep tests on workspace 5

On Hyprland, headed browser tests install a runtime rule for the dedicated `manim-js-benchmark` window class before launching. Test windows open on workspace **5** silently, with activation requests suppressed. The runner verifies placement. Existing browser windows and configuration files are unaffected. This is automatic for the shared Chromium/Firefox launchers; no workspace-switch command is used.

`MANIM_JS_TEST_WORKSPACE` can explicitly choose another workspace. Headless runs do not create a rule. Browser results record placement and visibility: Firefox reports the background tab as hidden, while this Chromium/XWayland configuration reports visible. GPU compute experiments can run in either state; their timing is not a foreground presentation or input-latency measurement. Standalone animation-frame checks are explicitly skipped when the page is hidden.

Firefox uses its initial isolated tab so creating a foreground tab cannot stall on a suppressed focus request. The implementation follows the installed Hyprland Lua API and [current window-rule documentation](https://wiki.hypr.land/configuring/core/rules/window-rules/).
