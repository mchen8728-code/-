import { access, readFile } from "node:fs/promises";
import path from "node:path";

const project = process.cwd();
const webDir = path.join(project, "dist-native");
const config = JSON.parse(await readFile(path.join(project, "capacitor.config.json"), "utf8"));

if (config.server?.url) throw new Error("Native config must not contain server.url");
if (config.webDir !== "dist-native") throw new Error("Capacitor webDir must be dist-native");

for (const file of [
  "index.html",
  "room-assets/room-day.png",
  "pet/frames/idle/00.png",
  "pet/frames/waving/00.png",
  "pet/frames/sleep/00.png",
]) {
  await access(path.join(webDir, file));
}

const index = await readFile(path.join(webDir, "index.html"), "utf8");
if (/https:\/\/jingjing-weread-room\.mchen8728\.chatgpt\.site/i.test(index)) {
  throw new Error("Native index unexpectedly references the hosted home");
}

console.log("Native bundle is local and contains the Room/Pet offline assets.");
