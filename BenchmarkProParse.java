import java.io.File;
import org.prorefactor.core.JPNode;
import org.prorefactor.refactor.ParseUnit;

public class BenchmarkProParse {
    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.out.println("Usage: java BenchmarkProParse <path-to-file.p>");
            return;
        }

        File file = new File(args[0]);
        System.out.println("\n======================================================");
        System.out.println("Benchmarking ProParse on: " + file.getName());
        System.out.println("======================================================");

        int warmupRuns = 5;
        int benchRuns = 20;

        // Warmup runs (allowing HotSpot JIT compilation)
        for (int i = 0; i < warmupRuns; i++) {
            ParseUnit pu = new ParseUnit(file);
            pu.treeParser01();
        }

        System.gc();
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

        System.out.printf("[Full Parse] Average Latency: %.3f ms%n", avgMs);
        System.out.printf("[Memory]     Heap Allocated:   %.2f MB%n", Math.max(0, memUsedMb));
        System.out.println("[Incremental Edit]             NOT SUPPORTED (Full re-parse required)");
        System.out.println("======================================================\n");
    }
}