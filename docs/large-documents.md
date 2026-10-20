# Large document performance

Run `node --expose-gc scripts/benchmark_large_documents.js` with the project's Node
version. It reports the median of three runs after a warmup, the number of bytes
allocated as ImageData by the measured operation, and its result. Timings are
observations, not portable performance guarantees or test thresholds. ImageData
bytes are allocation totals, not peak process memory. Use `PAINTJS_BENCH_SIZE`
to change the square effect input size. `PAINTJS_BENCH_BASELINE` can point to a
checkout of an earlier revision to compare its effect engine and Region code.

The benchmark covers a 1024×1024 RGBA morphology operation with a 15×15 kernel
and a selection with 128 disconnected vertical strips over 8192 rows. On the
2026-10-20 development machine, using the same Node 24 VM harness before and after:

| Scenario | Before | After |
| --- | ---: | ---: |
| Morphology median | 95,757 ms | 662 ms |
| Morphology ImageData allocations | 4,194,304 bytes | 4,194,304 bytes |
| Selection region median | 511 ms | 448 ms |
| Retained region rectangles | 1,048,576 | 128 |

The minimum/maximum filter now uses two separable monotonic-queue passes. It
performs linear work in the pixel count instead of visiting every kernel sample
for every output pixel. The second pass operates in place; queues use at most
five bytes per row/column sample, without another full image buffer. RGBA values,
edge replication and anisotropic kernels retain their previous results.

Region construction merges vertically adjacent identical spans into rectangles.
It preserves the same selected pixels, including holes, negative coordinates
and disconnected rows. It still enumerates the original scanlines and allocates
transient scan objects; this change primarily reduces retained region memory.
Whole-image effects also reuse one rasterized selection mask during rendering
and blending, preserving fractional edge coverage.

No image quality, dimensions, history depth or undo data are reduced. Regression
tests compare pixels against a brute-force filter, verify exact region coverage,
and exercise a large actual canvas through effects and undo/redo. Large documents
can still exceed browser canvas, WASM or system memory limits; this work does not
remove those limits or guarantee all effects are fast at arbitrary dimensions.
