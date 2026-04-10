import fs from "fs";
import path from "path";

const rootDir = path.resolve(import.meta.dirname, "..");
const copyTargets = [
  {
    sourceDir: path.join(rootDir, "src", "locales"),
    targetDir: path.join(rootDir, "dist", "locales"),
  },
  {
    sourceDir: path.join(rootDir, "sql"),
    targetDir: path.join(rootDir, "dist", "sql"),
  },
];

for (const target of copyTargets) {
  if (!fs.existsSync(target.sourceDir)) {
    continue;
  }

  fs.mkdirSync(target.targetDir, { recursive: true });

  for (const entry of fs.readdirSync(target.sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    fs.copyFileSync(
      path.join(target.sourceDir, entry.name),
      path.join(target.targetDir, entry.name),
    );
  }
}