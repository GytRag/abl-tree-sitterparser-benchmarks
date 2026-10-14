# Benchmark Measurements

This project compares Tree-sitter for ABL with ProParse on three corpus files: small.p, medium.cls, and large.p. The batch runner compiles ProParse, runs each parser in a separate process, and saves logs and CSV summaries in a dated folder under benchmark-results.

By default, the runner performs three trials for each parser and input file. It runs Tree-sitter before ProParse for each file. Each trial starts a fresh process, so the process-level memory measurement includes parser initialization and runtime overhead as well as parsing.

## Measurements

| Measurement | Meaning |
| --- | --- |
| Average parse latency | Average time for one full parse during that benchmark phase. Tree-sitter warms up with ten parses and measures fifty. ProParse warms up with five and measures twenty. |
| Throughput | Input file size in bytes divided by average full-parse time, reported in kilobytes per second. Both parsers use file bytes for this calculation. |
| Incremental edit latency | Tree-sitter edits the original syntax tree to represent one space appended at the end of the file, then reparses while reusing that edited tree. It warms up five times and measures fifty parses. ProParse does not perform an incremental parse, so this value is not available for it. |
| Edited full-reparse latency | Both parsers parse the same edited input, with one space appended at the end. They do not reuse the previous syntax tree or parse unit for this phase. Each warms up five times and measures twenty parses. This is the comparable edit-related timing between the two parsers. |
| Heap allocated | Each parser reports a before-and-after runtime heap measurement around its full-parse loop. This is not total memory allocated by parsing. Tree-sitter reports JavaScript heap change, which can be negative when garbage collection runs; it also excludes most WebAssembly parser memory. ProParse reports Java heap change after requesting garbage collection before the initial measurement, and clamps negative results to zero. These heap values use different runtimes and methods, so they should not be compared directly. |
| Peak working set | The batch runner reads the operating system's peak resident memory for the whole parser process while it runs. It includes the runtime, parser, libraries, and input handling; it is not parser-only or syntax-tree-only memory. |

## Output Files

The dated output folder contains separate logs for Tree-sitter and ProParse. The Tree-sitter log includes full-parse throughput, incremental-edit latency, edited full-reparse latency, and the process peak working set for each trial. The ProParse log includes full-parse throughput, edited full-reparse latency, its heap reading, and process peak working set.

The trial summary CSV has one row per parser, file, and trial. It records latency, throughput, incremental latency where available, edited full-reparse latency, peak working set, and process exit status. The statistics CSV groups results by parser and file. It reports means and medians for throughput and edit timings, and also reports minimum and maximum full-parse latency and peak working set.

## Interpreting Results

Use edited full-reparse latency when comparing the edit-related work done by both parsers. Treat Tree-sitter incremental latency as a separate capability result because ProParse's benchmark does not perform incremental parsing.

Throughput and latency are based on in-process averages, while the batch runner's repeated trials measure variation between fresh processes. Compare medians across several trials; background CPU and memory activity can affect results. Increase the trial count when you need a more stable comparison.

Do not treat either heap-allocated value as total parser memory. For whole-process memory comparisons, use peak working set and remember that it includes each runtime and its libraries. The two memory measurements answer different questions and should remain separate in reports.
