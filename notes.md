In this benchmark, two different memory systems are involved:

V8’s garbage collector manages JavaScript objects. It periodically reclaims objects that are no longer reachable, but it doesn’t necessarily run when a parse finishes. That means heapUsed can go down between the start and end snapshots if a collection happens during the benchmark.
Tree-sitter’s syntax tree is allocated in WebAssembly memory. tree.delete() explicitly frees its WASM-side tree data. That is separate from V8’s garbage collector. The installed Tree-sitter module starts with 32 MiB of WASM memory capacity, but that capacity does not tell us how much the current tree uses.
So the existing [Memory] Heap Allocated value is neither total parser memory nor total memory allocated during the runs. The ProParse benchmark also measures a Java heap difference, so the two “allocated” numbers aren’t directly comparable.

For comparing the parsers’ real runtime footprint, I recommend measuring peak process RSS for each benchmark in a separate process. That includes the runtime and parser memory, including resident WASM pages, but it is a whole-process measurement, not memory used by just one syntax tree. Measuring just the tree’s live WASM allocations would require allocator instrumentation that this web-tree-sitter API doesn’t expose.

