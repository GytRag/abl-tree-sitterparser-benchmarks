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
        double throughputKBps = (Files.size(file.toPath()) / 1024.0) / (avgMs / 1000.0);

        System.out.printf("[Full Parse] Average Latency: %.3f ms%n", avgMs);
        System.out.printf("[Full Parse] Throughput:      %.1f KB/s%n", throughputKBps);
        System.out.printf("[Memory]     Heap Allocated:   %.2f MB%n", Math.max(0, memUsedMb));

        byte[] originalSource = Files.readAllBytes(file.toPath());
        byte[] editedSource = Arrays.copyOf(originalSource, originalSource.length + 1);
        editedSource[originalSource.length] = ' ';
        String fileName = file.getName();
        int extensionIndex = fileName.lastIndexOf('.');
        String suffix = extensionIndex >= 0 ? fileName.substring(extensionIndex) : ".p";
        File editedFile = File.createTempFile("proparse-edit-", suffix, file.getAbsoluteFile().getParentFile());

        try {
            Files.write(editedFile.toPath(), editedSource);
            editedFile.deleteOnExit();

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
            Files.deleteIfExists(editedFile.toPath());
        }

        System.out.println("======================================================\n");
    }
}