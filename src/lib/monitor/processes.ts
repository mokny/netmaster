export interface ParsedProcess {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

// Parst die Ausgabe von PROCESS_LIST_COMMAND
// ("ps -eo pid,user,pcpu,pmem,comm --no-headers").
export function parseProcessListOutput(raw: string): ParsedProcess[] {
  const processes: ParsedProcess[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pidStr, user, cpuStr, memStr, ...rest] = trimmed.split(/\s+/);
    const pid = Number(pidStr);
    const cpuPercent = Number(cpuStr);
    const memPercent = Number(memStr);
    if (!Number.isInteger(pid) || Number.isNaN(cpuPercent) || Number.isNaN(memPercent)) {
      continue;
    }
    processes.push({
      pid,
      user: user ?? "?",
      cpuPercent,
      memPercent,
      command: rest.join(" ") || "?",
    });
  }
  return processes.sort((a, b) => b.cpuPercent - a.cpuPercent);
}
