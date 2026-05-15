import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

type PackageJson = {
  version: string;
};

const isPackageJson = (data: unknown): data is PackageJson => {
  if (typeof data !== "object" || data === null) return false;
  if (!("version" in data)) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj["version"] === "string";
};

const readPackageJson = (): PackageJson => {
  const raw = readFileSync(join(__dirname, "../package.json"), "utf-8");
  const data: unknown = JSON.parse(raw);
  if (!isPackageJson(data)) {
    throw new Error("Invalid package.json: missing version");
  }
  return data;
};

const pkg = readPackageJson();

const program = new Command();

program.name("npm-fw").description("CLI for npm-fw").version(pkg.version);

program.parse();
