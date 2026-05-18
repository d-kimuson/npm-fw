import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UserConfig, AdvisorySeverity } from "./proxy/types.ts";

export const STATE_DIR = join(homedir(), ".npm-fw");
export const STATE_FILE = join(STATE_DIR, "daemon.json");

export type DaemonState = { readonly pid: number; readonly port: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** daemon.json の全内容を読み込む（ファイルがない or パース失敗なら null） */
const readFull = async (): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

/** daemon.json の全内容を同期的に読み込む */
const readFullSync = (): Record<string, unknown> | null => {
  try {
    const raw = readFileSync(STATE_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

/** daemon.json に全内容を書き込む（既存内容にマージ） */
const writeFull = async (data: Record<string, unknown>): Promise<void> => {
  await mkdir(STATE_DIR, { recursive: true });
  const existing = await readFull();
  await writeFile(STATE_FILE, JSON.stringify({ ...existing, ...data }));
};

/** daemon.json に全内容を同期的に書き込む（既存内容にマージ） */
const writeFullSync = (data: Record<string, unknown>): void => {
  mkdirSync(STATE_DIR, { recursive: true });
  const existing = readFullSync();
  writeFileSync(STATE_FILE, JSON.stringify({ ...existing, ...data }));
};

export const readState = async (): Promise<DaemonState | null> => {
  const data = await readFull();
  if (data !== null && typeof data["pid"] === "number" && typeof data["port"] === "number") {
    return { pid: data["pid"], port: data["port"] };
  }
  return null;
};

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const VALID_SEVERITIES: readonly AdvisorySeverity[] = [
  "low",
  "moderate",
  "high",
  "critical",
] as const;

const isValidSeverity = (value: unknown): value is AdvisorySeverity =>
  typeof value === "string" && (VALID_SEVERITIES as readonly string[]).includes(value);

/** ユーザー設定を読み込む。未設定の場合はデフォルト値を返す */
export const readUserConfig = async (): Promise<UserConfig> => {
  const data = await readFull();
  return parseUserConfig(data);
};

/** ユーザー設定を同期的に読み込む */
export const readUserConfigSync = (): UserConfig => {
  const data = readFullSync();
  return parseUserConfig(data);
};

const parseUserConfig = (data: Record<string, unknown> | null): UserConfig => {
  const minSeverity: AdvisorySeverity =
    data !== null && isValidSeverity(data["minSeverity"]) ? data["minSeverity"] : "high";
  return { minSeverity };
};

/** ユーザー設定を書き込む（ランタイムフィールドは保持） */
export const writeUserConfig = async (config: UserConfig): Promise<void> => {
  await writeFull({ ...config });
};

export const writeState = async (state: DaemonState): Promise<void> => {
  await writeFull({ ...state });
};

export const writeStateSync = (state: DaemonState): void => {
  writeFullSync({ ...state });
};

export const removeState = async (): Promise<void> => {
  try {
    const existing = await readFull();
    if (existing === null) return;
    const userConfig: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existing)) {
      if (key !== "pid" && key !== "port") {
        userConfig[key] = value;
      }
    }
    if (Object.keys(userConfig).length === 0) {
      await rm(STATE_FILE, { force: true });
    } else {
      await writeFile(STATE_FILE, JSON.stringify(userConfig));
    }
  } catch {
    // ignore
  }
};
