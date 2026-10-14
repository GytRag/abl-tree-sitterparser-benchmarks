param(
    [ValidateRange(1, 100)]
    [int]$Runs = 3,
    [string]$OutputRoot = '.\benchmark-results'
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$outputRootPath = Join-Path $projectRoot $OutputRoot
$runDirectory = Join-Path $outputRootPath (Get-Date -Format 'yyyyMMdd-HHmmss')
$treeSitterLog = Join-Path $runDirectory 'treesitter.log'
$proParseLog = Join-Path $runDirectory 'proparse.log'
$summaryPath = Join-Path $runDirectory 'summary.csv'
$statisticsPath = Join-Path $runDirectory 'statistics.csv'

$cases = @(
    [pscustomobject]@{ Name = 'small.p'; Path = Join-Path $projectRoot 'corpus\small.p' },
    [pscustomobject]@{ Name = 'medium.cls'; Path = Join-Path $projectRoot 'corpus\medium.cls' },
    [pscustomobject]@{ Name = 'large.p'; Path = Join-Path $projectRoot 'corpus\large.p' }
)

foreach ($tool in @('node', 'java', 'javac')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Required command '$tool' was not found on PATH."
    }
}

$treeSitterScript = Join-Path $projectRoot 'benchmark-treesitter.js'
$wasmPath = Join-Path $projectRoot 'resources\tree-sitter-abl.wasm'
$proParseJar = Join-Path $projectRoot 'resources\proparse.jar'
foreach ($path in @($treeSitterScript, $wasmPath, $proParseJar) + @($cases | ForEach-Object { $_.Path })) {
    if (-not (Test-Path $path)) {
        throw "Required benchmark file was not found: $path"
    }
}

New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
Set-Content -Path $treeSitterLog -Value 'Tree-sitter benchmark runs' -Encoding UTF8
Set-Content -Path $proParseLog -Value 'ProParse benchmark runs' -Encoding UTF8

Push-Location $projectRoot
try {
    $compileOutput = & javac -cp '.;resources\proparse.jar;resources\lib\*' '.\BenchmarkProParse.java' 2>&1
    $compileExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($compileOutput) {
    Add-Content -Path $proParseLog -Value "`r`n=== javac ==="
    $compileOutput | Add-Content -Path $proParseLog
}
if ($compileExitCode -ne 0) {
    throw "javac failed with exit code $compileExitCode. See $proParseLog"
}

function Get-Median {
    param([double[]]$Values)

    $ordered = @($Values | Sort-Object)
    if ($ordered.Count -eq 0) { return $null }
    $middle = [int][Math]::Floor($ordered.Count / 2)
    if ($ordered.Count % 2 -eq 1) { return [double]$ordered[$middle] }
    return ([double]$ordered[$middle - 1] + [double]$ordered[$middle]) / 2
}

$rows = [System.Collections.Generic.List[object]]::new()
$failedRuns = 0

foreach ($case in $cases) {
    for ($run = 1; $run -le $Runs; $run++) {
        foreach ($parser in @('Tree-sitter', 'ProParse')) {
            $logPath = if ($parser -eq 'Tree-sitter') { $treeSitterLog } else { $proParseLog }
            if ($parser -eq 'Tree-sitter') {
                $executable = 'node'
                $arguments = '"{0}" "{1}" "{2}"' -f $treeSitterScript, $case.Path, $wasmPath
            } else {
                $executable = 'java'
                $arguments = '-cp ".;resources\proparse.jar;resources\lib\*" BenchmarkProParse "{0}"' -f $case.Path
            }

            Add-Content -Path $logPath -Value "`r`n=== $parser | $($case.Name) | trial $run ==="
            $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
            $startInfo.FileName = $executable
            $startInfo.Arguments = $arguments
            $startInfo.WorkingDirectory = $projectRoot
            $startInfo.UseShellExecute = $false
            $startInfo.CreateNoWindow = $true
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            $process = [System.Diagnostics.Process]::new()
            $process.StartInfo = $startInfo
            if (-not $process.Start()) {
                throw "Could not start $parser for $($case.Name)."
            }
            $stdoutTask = $process.StandardOutput.ReadToEndAsync()
            $stderrTask = $process.StandardError.ReadToEndAsync()
            $peakWorkingSetBytes = 0L
            do {
                $process.Refresh()
                $currentPeakBytes = $process.PeakWorkingSet64
                if ($currentPeakBytes -gt $peakWorkingSetBytes) {
                    $peakWorkingSetBytes = $currentPeakBytes
                }
            } while (-not $process.WaitForExit(20))
            $process.WaitForExit()
            $peakWorkingSetMB = [Math]::Round($peakWorkingSetBytes / 1MB, 2)
            $exitCode = $process.ExitCode

            $stdout = $stdoutTask.GetAwaiter().GetResult()
            $stderr = $stderrTask.GetAwaiter().GetResult()
            if ($stdout) { Add-Content -Path $logPath -Value $stdout }
            if ($stderr) {
                Add-Content -Path $logPath -Value '--- stderr ---'
                Add-Content -Path $logPath -Value $stderr
            }
            Add-Content -Path $logPath -Value "Peak working set: $peakWorkingSetMB MB; exit code: $exitCode"
            $process.Dispose()

            $output = "$stdout`n$stderr"
            $parseMatch = [regex]::Match($output, '\[Full Parse\] Average Latency:\s*([\d.]+)\s*ms')
            $throughputMatch = [regex]::Match($output, '\[Full Parse\] Throughput:\s*([\d.]+)\s*KB/s')
            $incrementalMatch = [regex]::Match($output, '\[Incremental Edit\] Re-parse Time:\s*([\d.]+)\s*ms')
            $editedFullReparseMatch = [regex]::Match($output, '\[Edit \+ Full Re-parse\] Average Latency:\s*([\d.]+)\s*ms')

            $rows.Add([pscustomobject]@{
                Parser = $parser
                File = $case.Name
                Trial = $run
                AverageParseMs = if ($parseMatch.Success) { [double]$parseMatch.Groups[1].Value } else { $null }
                ThroughputKBps = if ($throughputMatch.Success) { [double]$throughputMatch.Groups[1].Value } else { $null }
                IncrementalEditMs = if ($incrementalMatch.Success) { [double]$incrementalMatch.Groups[1].Value } else { $null }
                EditedFullReparseMs = if ($editedFullReparseMatch.Success) { [double]$editedFullReparseMatch.Groups[1].Value } else { $null }
                PeakWorkingSetMB = $peakWorkingSetMB
                ExitCode = $exitCode
            })
            if ($exitCode -ne 0) { $failedRuns++ }
        }
    }
}

$rows | Export-Csv -Path $summaryPath -NoTypeInformation -Encoding UTF8

$statistics = foreach ($group in ($rows | Group-Object Parser, File)) {
    $groupRows = @($group.Group)
    $parseValues = @($groupRows | Where-Object { $null -ne $_.AverageParseMs } | ForEach-Object { [double]$_.AverageParseMs })
    $throughputValues = @($groupRows | Where-Object { $null -ne $_.ThroughputKBps } | ForEach-Object { [double]$_.ThroughputKBps })
    $incrementalValues = @($groupRows | Where-Object { $null -ne $_.IncrementalEditMs } | ForEach-Object { [double]$_.IncrementalEditMs })
    $editedFullReparseValues = @($groupRows | Where-Object { $null -ne $_.EditedFullReparseMs } | ForEach-Object { [double]$_.EditedFullReparseMs })
    $memoryValues = @($groupRows | ForEach-Object { [double]$_.PeakWorkingSetMB })
    $parseMeasure = $parseValues | Measure-Object -Average -Minimum -Maximum
    $throughputMeasure = $throughputValues | Measure-Object -Average -Minimum -Maximum
    $incrementalMeasure = $incrementalValues | Measure-Object -Average -Minimum -Maximum
    $editedFullReparseMeasure = $editedFullReparseValues | Measure-Object -Average -Minimum -Maximum
    $memoryMeasure = $memoryValues | Measure-Object -Average -Minimum -Maximum

    [pscustomobject]@{
        Parser = $groupRows[0].Parser
        File = $groupRows[0].File
        Trials = $groupRows.Count
        AverageParseMsMean = $parseMeasure.Average
        AverageParseMsMedian = Get-Median $parseValues
        AverageParseMsMin = $parseMeasure.Minimum
        AverageParseMsMax = $parseMeasure.Maximum
        ThroughputKBpsMean = $throughputMeasure.Average
        ThroughputKBpsMedian = Get-Median $throughputValues
        IncrementalEditMsMean = $incrementalMeasure.Average
        IncrementalEditMsMedian = Get-Median $incrementalValues
        EditedFullReparseMsMean = $editedFullReparseMeasure.Average
        EditedFullReparseMsMedian = Get-Median $editedFullReparseValues
        PeakWorkingSetMBMean = $memoryMeasure.Average
        PeakWorkingSetMBMedian = Get-Median $memoryValues
        PeakWorkingSetMBMin = $memoryMeasure.Minimum
        PeakWorkingSetMBMax = $memoryMeasure.Maximum
    }
}
$statistics | Export-Csv -Path $statisticsPath -NoTypeInformation -Encoding UTF8

Write-Host "Benchmark logs and statistics saved to: $runDirectory"
Write-Host "Raw trials: $summaryPath"
Write-Host "Aggregates: $statisticsPath"
if ($failedRuns -gt 0) {
    throw "$failedRuns benchmark process(es) failed. Check the parser logs in $runDirectory"
}
