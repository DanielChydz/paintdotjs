# Native PDN support

paint.js reads and writes the PDN3 container with its XML header, NRBF object
graph and deferred compressed/uncompressed BGRA surface blocks. The writer uses
an independently defined schema; it does not bundle Paint.NET binaries or assets.

The generated graph supports 1–65,535 bitmap layers instead of depending on a
prebuilt template for each layer count. The limit is a structural validation
bound, not a promise that large documents fit in memory. Canvas dimensions remain
limited to 32,768 per axis. Existing templates are retained for small documents
without metadata and for recovery of malformed blend records from old paint.js
versions. Regeneration uses the same shared schema as the runtime writer.

The following data round trips:

- Canvas dimensions, layer ordering and BGRA pixels, including alpha.
- Layer name, visibility, background flag, opacity and supported blend mode.
- Document and layer `userMetadataItems`: typed arrays of string key/value pairs,
  including unknown keys and Unicode values. Unsupported metadata structures fail
  explicitly instead of being silently dropped.
- paint.js resolution and source/export ICC settings stored in namespaced string
  metadata. Layer metadata survives cloning and property-history snapshots;
  document metadata survives whole-document transformations and canvas resizing.

Known scope: bitmap-layer PDN3 documents. Unknown layer types are rejected.
This work does not add the future/new PDN container, adjustment/vector layers,
embedded plugin objects, history or selection serialization. Files from every
Paint.NET version have not been validated; generated-graph interoperability and
pixel round trips must not be described as complete compatibility with all PDN
variants. Original Paint.NET is not used by the automated test suite.

The schema lives in `src/pdn/PdnObjectGraph.js`, the container reader/writer in
`js/src/io/PdnDocumentCodec.js`. Tests verify 65-layer round trips and the unchanged
bytes of the existing 1–64-layer generated templates.
