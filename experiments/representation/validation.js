// Binary stroke coverage, independent of color. Readbacks use a black background.
// This is a raster smoke gate, not an antialiasing quality metric.
export function compareCoverage(reference, actual, width, height, radius = 2) {
  function oneWay(a, b) {
    let foreground = 0,
      missed = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (a[(y * width + x) * 4 + 1] < 80) continue;
        foreground++;
        let found = false;
        for (let dy = -radius; dy <= radius && !found; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (
              xx >= 0 &&
              xx < width &&
              yy >= 0 &&
              yy < height &&
              b[(yy * width + xx) * 4 + 1] >= 80
            ) {
              found = true;
              break;
            }
          }
        if (!found) missed++;
      }
    return { foreground, missed, missedFraction: foreground ? missed / foreground : 1 };
  }
  const forward = oneWay(reference, actual),
    reverse = oneWay(actual, reference);
  return {
    radius,
    forward,
    reverse,
    passed:
      forward.foreground > 1000 &&
      reverse.foreground > 1000 &&
      forward.missedFraction <= 0.001 &&
      reverse.missedFraction <= 0.001,
  };
}
