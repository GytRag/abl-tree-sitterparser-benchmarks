const fs = require('fs');
const { Parser, Language } = require('web-tree-sitter');

async function runBenchmark(filePath, wasmPath) {
  console.log(`\n======================================================`);
  console.log(`Benchmarking Tree-sitter (WASM) on: ${filePath}`);
  console.log(`======================================================`);

  await Parser.init();
  const parser = new Parser();
  const ABL = await Language.load(wasmPath);
  parser.setLanguage(ABL);

  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const sourceSizeBytes = Buffer.byteLength(sourceCode, 'utf8');

  // Warmup runs to allow V8 JIT optimisation
  const WARMUP_RUNS = 10;
  const BENCH_RUNS = 50;

  for (let i = 0; i < WARMUP_RUNS; i++) {
    const t = parser.parse(sourceCode);
    t.delete();
  }

  // 1. Full Parse Benchmark
  const startMem = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  
  let tree;
  for (let i = 0; i < BENCH_RUNS; i++) {
    if (tree) tree.delete();
    tree = parser.parse(sourceCode);
  }
  const t1 = performance.now();
  const endMem = process.memoryUsage().heapUsed;

  const avgFullParseMs = (t1 - t0) / BENCH_RUNS;
  const memUsedMb = (endMem - startMem) / 1024 / 1024;

  console.log(`[Full Parse] Average Latency:    ${avgFullParseMs.toFixed(3)} ms`);
  console.log(`[Full Parse] Throughput:         ${((sourceSizeBytes / 1024) / (avgFullParseMs / 1000)).toFixed(1)} KB/s`);
  console.log(`[Memory]     Heap Allocated:     ${memUsedMb.toFixed(2)} MB`);

  // 2. Incremental edit benchmark with an appended space
  const editedSourceCode = sourceCode + " ";
  const sourceEndOffset = Buffer.byteLength(sourceCode, 'utf8');
  const lastNewlineIndex = sourceCode.lastIndexOf('\n');
  const sourceEndPosition = {
    row: (sourceCode.match(/\n/g) || []).length,
    column: Buffer.byteLength(sourceCode.slice(lastNewlineIndex + 1), 'utf8')
  };

  tree.edit({
    startIndex: sourceEndOffset,
    oldEndIndex: sourceEndOffset,
    newEndIndex: sourceEndOffset + 1,
    startPosition: sourceEndPosition,
    oldEndPosition: sourceEndPosition,
    newEndPosition: { row: sourceEndPosition.row, column: sourceEndPosition.column + 1 }
  });

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

  // 3. Full re-parse benchmark with the same appended-space edit used by ProParse
  tree.delete();

  for (let i = 0; i < 5; i++) {
    const warmupTree = parser.parse(editedSourceCode);
    warmupTree.delete();
  }

  const tEdit0 = performance.now();
  for (let i = 0; i < 20; i++) {
    const editedTree = parser.parse(editedSourceCode);
    editedTree.delete();
  }
  const tEdit1 = performance.now();
  const avgEditedFullParseMs = (tEdit1 - tEdit0) / 20;

  console.log(`[Edit + Full Re-parse] Average Latency: ${avgEditedFullParseMs.toFixed(3)} ms`);
  console.log(`======================================================\n`);
}

const targetFile = process.argv[2] || './corpus/large.p';
const wasmBinary = process.argv[3] || './resources/tree-sitter-abl.wasm';
runBenchmark(targetFile, wasmBinary);