import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const versionPath = join(root, "src", "config", "version.json");
const versionInfo = JSON.parse(readFileSync(versionPath, "utf8"));

console.log("LuxFatum：裁定對決");
console.log(`Game Version: ${versionInfo.gameVersion}`);
console.log(`Ruleset Version: ${versionInfo.rulesetVersion}`);
console.log(`Version Name: ${versionInfo.versionName}`);
console.log(`Build Type: ${versionInfo.buildType}`);
console.log(`Build Date: ${versionInfo.buildDate}`);
