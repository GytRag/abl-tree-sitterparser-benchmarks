/**
 * ProParse ABL Parser Benchmark
 * 
 * Measures two-pass semantic parsing performance (syntax + symbol scope resolution)
 * using the industry-standard ProParse library from Riverside Software.
 * 
 * Methodology:
 * - Warm-up phase allows HotSpot JIT compiler to reach steady-state optimisation
 * - Multiple iterations reduce measurement noise from GC pauses and class loading
 * - Requires complete PROPATH configuration and OpenEdge include files
 * 
 * Usage:
 *   javac -cp ".;resources/proparse.jar;resources/lib/*" BenchmarkProParse.java
 *   java -cp ".;resources/proparse.jar;resources/lib/*" BenchmarkProParse <source-file.p>
 */

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import org.prorefactor.treeparser.ParseUnit;
import com.joanju.proparse.Environment;

public class BenchmarkProParse {
    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.out.println("Usage: java BenchmarkProParse <path-to-file.p>");
            return;
        }

        File file = new File(args[0]);

        // Configure PROPATH with OpenEdge ADE includes
        // ProParse requires these system files for semantic resolution
        String propath = String.join(",",
            new File("corpus/resources/ade").getAbsolutePath(),
            new File("corpus/resources/ade/auditing").getAbsolutePath(),
            new File("corpus/resources/ade/wrappers").getAbsolutePath(),
            new File("corpus").getAbsolutePath()
        );
        Environment.instance().configSet("propath", propath);

        System.out.println("\n======================================================");
        System.out.println("Benchmarking ProParse on: " + file.getName());
        System.out.println("======================================================");

        // Warm-up phase: Allow HotSpot's C1/C2 JIT compilers to reach steady-state
        // optimisation and stabilise heap allocations before measurement begins
        int warmupRuns = 5;
        int benchRuns = 20;

        // Warm-up: Parse the file multiple times to allow JIT optimisation
        for (int i = 0; i < warmupRuns; i++) {
            ParseUnit pu = new ParseUnit(file);
            pu.treeParser01(); // Two-pass parse: Syntax + SymbolScope
        }

        // ====================================================================
        // 1. Full Parse Benchmark
        // ====================================================================
        // Measure the average time to perform ProParse's two-pass semantic analysis:
        //   Pass 1: Syntax parsing (ANTLR-generated lexer/parser)
        //   Pass 2: Symbol scope resolution (SymbolScopeRoot tree walker)
        
        System.gc(); // Request garbage collection to stabilise heap measurements
        Thread.sleep(100); // Allow GC to complete
        
        long startMem = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        long t0 = System.nanoTime();

        for (int i = 0; i < benchRuns; i++) {
            ParseUnit pu = new ParseUnit(file);
            pu.treeParser01(); // Executes Pass 1 (Syntax) + Pass 2 (SymbolScope)
        }

        long t1 = System.nanoTime();
        long endMem = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();

        double avgMs = ((t1 - t0) / 1_000_000.0) / benchRuns;
        double memUsedMb = (endMem - startMem) / (1024.0 * 1024.0);
        double throughputKBps = (Files.size(file.toPath()) / 1024.0) / (avgMs / 1000.0);

        System.out.printf("[Full Parse] Average Latency: %.3f ms%n", avgMs);
        System.out.printf("[Full Parse] Throughput:      %.1f KB/s%n", throughputKBps);
        System.out.printf("[Memory]     Heap Allocated:   %.2f MB%n", Math.max(0, memUsedMb));

        // ====================================================================
        // 2. Edit + Full Re-parse Benchmark
        // ====================================================================
        // Simulate a single-character edit (appending a space) and measure the time
        // to re-parse from scratch. ProParse does not support incremental parsing,
        // so every edit requires a full two-pass semantic analysis.
        
        // Create a temporary file with an appended space
        byte[] originalSource = Files.readAllBytes(file.toPath());
        byte[] editedSource = Arrays.copyOf(originalSource, originalSource.length + 1);
        editedSource[originalSource.length] = ' '; // Append a single space character
        
        String fileName = file.getName();
        int extensionIndex = fileName.lastIndexOf('.');
        String suffix = extensionIndex >= 0 ? fileName.substring(extensionIndex) : ".p";
        File editedFile = File.createTempFile("proparse-edit-", suffix, file.getAbsoluteFile().getParentFile());

        try {
            Files.write(editedFile.toPath(), editedSource);
            editedFile.deleteOnExit();

            // Warm-up for edited file parsing
            for (int i = 0; i < warmupRuns; i++) {
                ParseUnit pu = new ParseUnit(editedFile);
                pu.treeParser01();
            }

            long editStart = System.nanoTime();
            for (int i = 0; i < benchRuns; i++) {
                ParseUnit pu = new ParseUnit(editedFile);
                pu.treeParser01();
            }
            long editEnd = System.nanoTime();
            double avgEditReparseMs = ((editEnd - editStart) / 1_000_000.0) / benchRuns;

            System.out.printf("[Edit + Full Re-parse] Average Latency: %.3f ms%n", avgEditReparseMs);
        } finally {
            Files.deleteIfExists(editedFile.toPath()); // Clean up temporary file
        }

        System.out.println("======================================================\n");
    }
}