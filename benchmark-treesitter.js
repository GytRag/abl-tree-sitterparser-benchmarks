/**
 * Tree-sitter ABL Parser Benchmark
 * 
 * Measures full-parse latency, incremental re-parse performance, and memory footprint
 * for the Tree-sitter OpenEdge ABL grammar compiled to WebAssembly.
 * 
 * Methodology:
 * - Warm-up phase allows V8's TurboFan JIT compiler to optimise hot paths
 * - Multiple iterations reduce measurement noise from OS scheduling and GC pauses
 * - Explicit tree.delete() prevents WASM memory leaks
 * 
 * Usage:
 *   node benchmark-treesitter.js <source-file.p> <tree-sitter-abl.wasm>
 */

const fs = require('fs');
const { Parser, Language } = require('web-tree-sitter');

async function runBenchmark(filePath, wasmPath) {
  console.log(`\n======================================================`);
  console.log(`Benchmarking Tree-sitter (WASM) on: ${filePath}`);
  console.log(`======================================================`);

  // Initialise the Tree-sitter runtime and load the ABL grammar
  await Parser.init();
  const parser = new Parser();
  const ABL = await Language.load(wasmPath);
  parser.setLanguage(ABL);

  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const sourceSizeBytes = Buffer.byteLength(sourceCode, 'utf8');

  // Warm-up phase: Allow V8's TurboFan JIT compiler to optimise hot code paths
  // and stabilise V8 heap allocations before measurement begins
  const WARMUP_RUNS = 10;
  const BENCH_RUNS = 50;

  for (let i = 0; i < WARMUP_RUNS; i++) {
    const t = parser.parse(sourceCode);
    t.delete(); // Explicitly free WASM memory to prevent leaks
  }

  // ========================================================================
  // 1. Full Parse Benchmark
  // ========================================================================
  // Measure the average time to parse the entire source file from scratch.
  // This represents the initial parse when a file is first opened in an editor.
  
  const startMem = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  
  let tree;
  for (let i = 0; i < BENCH_RUNS; i++) {
    if (tree) tree.delete(); // Clean up previous iteration's WASM tree
    tree = parser.parse(sourceCode);
  }
  const t1 = performance.now();
  const endMem = process.memoryUsage().heapUsed;

  const avgFullParseMs = (t1 - t0) / BENCH_RUNS;
  const memUsedMb = (endMem - startMem) / 1024 / 1024;

  console.log(`[Full Parse] Average Latency:    ${avgFullParseMs.toFixed(3)} ms`);
  console.log(`[Full Parse] Throughput:         ${((sourceSizeBytes / 1024) / (avgFullParseMs / 1000)).toFixed(1)} KB/s`);
  console.log(`[Memory]     Heap Allocated:     ${memUsedMb.toFixed(2)} MB`);

  // ========================================================================
  // 2. Incremental Edit Benchmark
  // ========================================================================
  // Simulate a single-character edit (appending a space) and measure the time
  // to incrementally re-parse. Tree-sitter reuses unchanged subtrees from the
  // previous parse, making this significantly faster than a full re-parse.
  // This represents typing a character in an editor with syntax highlighting.
  
  const editedSourceCode = sourceCode + " ";
  const sourceEndOffset = Buffer.byteLength(sourceCode, 'utf8');
  const lastNewlineIndex = sourceCode.lastIndexOf('\n');
  const sourceEndPosition = {
    row: (sourceCode.match(/\n/g) || []).length,
    column: Buffer.byteLength(sourceCode.slice(lastNewlineIndex + 1), 'utf8')
  };

  // Inform the syntax tree about the edit before re-parsing
  tree.edit({
    startIndex: sourceEndOffset,
    oldEndIndex: sourceEndOffset,
    newEndIndex: sourceEndOffset + 1,
    startPosition: sourceEndPosition,
    oldEndPosition: sourceEndPosition,
    newEndPosition: { row: sourceEndPosition.row, column: sourceEndPosition.column + 1 }
  });

  // Warm-up for incremental parse measurements
  for (let i = 0; i < 5; i++) {
    const warmupTree = parser.parse(editedSourceCode, tree);
    warmupTree.delete();
  }

  const tIncremental0 = performance.now();
  for (let i = 0; i < BENCH_RUNS; i++) {
    const incrementalTree = parser.parse(editedSourceCode, tree);
    incrementalTree.delete();
  }
  const tIncremental1 = performance.now();
  const avgIncrementalMs = (tIncremental1 - tIncremental0) / BENCH_RUNS;
  console.log(`[Incremental Edit] Re-parse Time: ${avgIncrementalMs.toFixed(3)} ms`);

  // ========================================================================
  // 3. Edited Full Re-parse Benchmark
  // ========================================================================
  // Parse the edited source (with appended space) from scratch, without reusing
  // the previous syntax tree. This provides a fair comparison with ProParse,
  // which does not support incremental parsing and always parses from scratch.
  
  tree.delete(); // Clean up the incremental parse tree

  // Warm-up for full re-parse of edited content
  for (let i = 0; i < 5; i++) {
    const warmupTree = parser.parse(editedSourceCode);
    warmupTree.delete();
  }

  const tEdit0 = performance.now();
  for (let i = 0; i < 20; i++) {
    const editedTree = parser.parse(editedSourceCode);
    editedTree.delete(); // Prevent WASM memory accumulation
  }
  const tEdit1 = performance.now();
  const avgEditedFullParseMs = (tEdit1 - tEdit0) / 20;

  console.log(`[Edit + Full Re-parse] Average Latency: ${avgEditedFullParseMs.toFixed(3)} ms`);
  console.log(`======================================================\n`);
}

// Command-line interface
const targetFile = process.argv[2] || './corpus/large.p';
const wasmBinary = process.argv[3] || './resources/tree-sitter-abl.wasm';

runBenchmark(targetFile, wasmBinary).catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});