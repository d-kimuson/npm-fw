import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const STATE_DIR = join(homedir(), ".npm-fw");
export const STATE_FILE = join(STATE_DIR, "daemon.json");

export type DaemonState = { readonly pid: number; readonly port: number };

export const readState = async (): Promise<DaemonState | null> => {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "pid" in parsed && "port" in parsed) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj["pid"] === "number" && typeof obj["port"] === "number") {
        return { pid: obj["pid"], port: obj["port"] };
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const writeState = async (state: DaemonState): Promise<void> => {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state));
};

export const writeStateSync = (state: DaemonState): void => {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
};

export const removeState = async (): Promise<void> => {
  try {
    await rm(STATE_FILE, { force: true });
  } catch {
    // ignore
  }
};
