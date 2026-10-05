const fs = require('fs');
const Parser = require('web-tree-sitter');

async function runBenchmark(filePath, wasmPath) {
  console.log(`\n======================================================`);
  console.log(`Benchmarking Tree-sitter (WASM) on: ${filePath}`);
  console.log(`======================================================`);

  await Parser.init();
  const parser = new Parser();
  const ABL = await Parser.Language.load(wasmPath);
  parser.setLanguage(ABL);

  const sourceCode = fs.readFileSync(filePath, 'utf8');

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
  console.log(`[Full Parse] Throughput:         ${((sourceCode.length / 1024) / (avgFullParseMs / 1000)).toFixed(1)} KB/s`);
  console.log(`[Memory]     Heap Allocated:     ${memUsedMb.toFixed(2)} MB`);

  // 2. Incremental Edit Benchmark (Simulating a single character keystroke in VS Code)
  const editIndex = Math.floor(sourceCode.length / 2);
  const newSourceCode = sourceCode.slice(0, editIndex) + "X" + sourceCode.slice(editIndex);

  tree.edit({
    startIndex: editIndex,
    oldEndIndex: editIndex,
    newEndIndex: editIndex + 1,
    startPosition: { row: 10, column: 0 },
    oldEndPosition: { row: 10, column: 0 },
    newEndPosition: { row: 10, column: 1 }
  });

  const tEdit0 = performance.now();
  for (let i = 0; i < BENCH_RUNS; i++) {
    const incrementalTree = parser.parse(newSourceCode, tree);
    incrementalTree.delete();
  }
  const tEdit1 = performance.now();
  const avgIncrementalMs = (tEdit1 - tEdit0) / BENCH_RUNS;

  console.log(`[Incremental Edit] Re-parse Time: ${avgIncrementalMs.toFixed(3)} ms`);
  console.log(`======================================================\n`);
  
  tree.delete();
}

const targetFile = process.argv[2] || './corpus/large.p';
const wasmBinary = process.argv[3] || './resources/tree-sitter-abl.wasm';
runBenchmark(targetFile, wasmBinary);