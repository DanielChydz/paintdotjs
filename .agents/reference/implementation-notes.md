# Implementation notes

Technical context extracted from the project README. Verify against current code
before using it to plan changes; this is not a list of new tasks.

## History and resource ownership

Failed history operations restore saved pixels, layers, selection and history.
Catchable allocation failures release partially created layers; operating-system
process termination cannot be recovered this way.

Each transform gesture and Finish retain a distinct history series through
undo/redo. Closing a document or changing tools releases renderer subscriptions
and owned selection paths while preserving borrowed surfaces.

## Selection and view rendering

Moving a selection briefly fades its white outline back in; disabling animations
keeps it static and fully visible. Transform handles repaint immediately when
their geometry changes, without recompositing document pixels.

Scrolling reuses composed pixels. Window resizing preserves the document-space
center at a fixed zoom, or refits and centers Fit to Window views; unchanged
canvas dimensions do not reset its backing store. New documents compose once.

Region-to-path conversion uses half-open integer pixel scans: fractional
rectangles round outward, empty rectangles contribute nothing, and negative
origins, disconnected islands and holes are preserved. Path-derived regions use
the same even/odd pixel-center rasterization as selection statistics.

## Effect scheduling

CPU-heavy effects use one cancellable worker per preview; additional CPU-only
effects move off the UI thread for images of at least 262,144 pixels. Canvas-native
effects stay on their existing rendering path to preserve their pixel output.
Undo history is not truncated; closing a document releases its listeners, history,
and canvas backing stores.
