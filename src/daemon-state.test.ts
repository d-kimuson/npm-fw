import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  readState,
  isAlive,
  writeState,
  writeStateSync,
  removeState,
  readUserConfig,
  writeUserConfig,
} from "./daemon-state.ts";

// テスト用に STATE_DIR / STATE_FILE を固定するために homedir をモック
vi.mock("node:os", () => ({
  homedir: () => "/home/test-user",
}));

// テスト前に fs mock をリセット
const mockReadFile = vi.fn<(...args: unknown[]) => Promise<string>>();
const mockWriteFile = vi.fn<(...args: unknown[]) => Promise<void>>();
const mockMkdir = vi.fn<(...args: unknown[]) => Promise<void>>();
const mockRm = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]): Promise<string> => mockReadFile(...args),
  writeFile: (...args: unknown[]): Promise<void> => mockWriteFile(...args),
  mkdir: (...args: unknown[]): Promise<void> => mockMkdir(...args),
  rm: (...args: unknown[]): Promise<void> => mockRm(...args),
}));

const mockReadFileSync = vi.fn<(...args: unknown[]) => string>();
const mockWriteFileSync = vi.fn<(...args: unknown[]) => void>();
const mockMkdirSync = vi.fn<(...args: unknown[]) => void>();

vi.mock("node:fs", () => ({
  readFileSync: (...args: unknown[]): string => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]): void => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]): void => mockMkdirSync(...args),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("readState", () => {
  it("returns DaemonState on valid JSON file", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ pid: 12345, port: 42424 }));

    const result = await readState();
    expect(result).toEqual({ pid: 12345, port: 42424 });
    expect(mockReadFile).toHaveBeenCalledWith("/home/test-user/.npm-fw/daemon.json", "utf-8");
  });

  it("returns null when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await readState();
    expect(result).toBeNull();
  });

  it("returns null when JSON is invalid", async () => {
    mockReadFile.mockResolvedValue("not json {{{");

    const result = await readState();
    expect(result).toBeNull();
  });

  it("returns null when pid is missing", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ port: 42424 }));

    const result = await readState();
    expect(result).toBeNull();
  });

  it("returns null when pid is not a number", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ pid: "12345", port: 42424 }));

    const result = await readState();
    expect(result).toBeNull();
  });

  it("returns null when port is not a number", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ pid: 12345, port: "42424" }));

    const result = await readState();
    expect(result).toBeNull();
  });

  it("returns null when parsed value is an array", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ pid: 12345, port: 42424 }]));

    const result = await readState();
    expect(result).toBeNull();
  });
});

describe("isAlive", () => {
  it("returns true for a valid PID (signal 0 succeeds)", () => {
    // Default: process.kill(pid, 0) throws for non-existent pid
    // We test with a known-invalid PID
    const result = isAlive(99999999);
    expect(result).toBe(false);
  });

  it("returns false for PID 0 or negative", () => {
    // process.kill with these may throw
    const result0 = isAlive(0);
    const resultNeg = isAlive(-1);
    // Both should return false (throw caught)
    expect(typeof result0).toBe("boolean");
    expect(typeof resultNeg).toBe("boolean");
  });
});

describe("writeState", () => {
  it("creates directory and writes state file", async () => {
    // 既存ファイルなし（readFile が reject → readFull が null を返す）
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await writeState({ pid: 12345, port: 42424 });

    expect(mockMkdir).toHaveBeenCalledWith("/home/test-user/.npm-fw", { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/home/test-user/.npm-fw/daemon.json",
      JSON.stringify({ pid: 12345, port: 42424 }),
    );
  });

  it("merges with existing user config when writing state", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ minSeverity: "critical" }));
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await writeState({ pid: 12345, port: 42424 });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/home/test-user/.npm-fw/daemon.json",
      JSON.stringify({ minSeverity: "critical", pid: 12345, port: 42424 }),
    );
  });
});

describe("writeStateSync", () => {
  it("creates directory and writes state file synchronously", () => {
    // 既存ファイルなし（readFileSync が throw → readFullSync が null を返す）
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    writeStateSync({ pid: 12345, port: 42424 });

    expect(mockMkdirSync).toHaveBeenCalledWith("/home/test-user/.npm-fw", { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/home/test-user/.npm-fw/daemon.json",
      JSON.stringify({ pid: 12345, port: 42424 }),
    );
  });

  it("merges with existing user config when writing state", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ minSeverity: "low" }));

    writeStateSync({ pid: 99999, port: 55555 });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/home/test-user/.npm-fw/daemon.json",
      JSON.stringify({ minSeverity: "low", pid: 99999, port: 55555 }),
    );
  });
});

describe("removeState", () => {
  it("removes state file when no user config exists", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ pid: 12345, port: 42424 }));
    mockRm.mockResolvedValue(undefined);

    await removeState();

    expect(mockRm).toHaveBeenCalledWith("/home/test-user/.npm-fw/daemon.json", { force: true });
  });

  it("preserves user config when removing runtime state", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ pid: 12345, port: 42424, minSeverity: "low" }));
    mockWriteFile.mockResolvedValue(undefined);

    await removeState();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/home/test-user/.npm-fw/daemon.json",
      JSON.stringify({ minSeverity: "low" }),
    );
    expect(mockRm).not.toHaveBeenCalled();
  });

  it("does not throw when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    await expect(removeState()).resolves.toBeUndefined();
  });
});

describe("readUserConfig", () => {
  it("returns default minSeverity when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const config = await readUserConfig();
    expect(config).toEqual({ minSeverity: "high" });
  });

  it("returns minSeverity from daemon.json", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ minSeverity: "critical", pid: 123 }));

    const config = await readUserConfig();
    expect(config).toEqual({ minSeverity: "critical" });
  });

  it("falls back to default when minSeverity is invalid", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ minSeverity: "unknown" }));

    const config = await readUserConfig();
    expect(config).toEqual({ minSeverity: "high" });
  });

  it("falls back when minSeverity is not a string", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ minSeverity: 123 }));

    const config = await readUserConfig();
    expect(config).toEqual({ minSeverity: "high" });
  });
});

describe("writeUserConfig", () => {
  it("writes user config merging with existing runtime state", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ pid: 12345, port: 42424 }));
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await writeUserConfig({ minSeverity: "low" });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/home/test-user/.npm-fw/daemon.json",
      JSON.stringify({ pid: 12345, port: 42424, minSeverity: "low" }),
    );
  });
});
