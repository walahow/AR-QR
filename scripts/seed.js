import { promises as fs } from "fs";
import path from "path";
import { createItem, getItem } from "../lib/store.js";
import { uploadFile } from "../lib/blob.js";

async function main() {
  const existing = await getItem("demo");
  if (existing) {
    console.log("Seed item 'demo' already exists, skipping.");
    return;
  }

  const glbBuffer = await fs.readFile(path.join(process.cwd(), "assets", "model.glb"));
  const usdzBuffer = await fs.readFile(path.join(process.cwd(), "assets", "model.usdz"));

  const glbUrl = await uploadFile("demo.glb", glbBuffer, "model/gltf-binary");
  const usdzUrl = await uploadFile("demo.usdz", usdzBuffer, "model/vnd.usdz+zip");

  const item = {
    id: "demo",
    name: "Demo Placeholder",
    glbUrl,
    usdzUrl,
    createdAt: new Date().toISOString(),
  };

  await createItem(item);
  console.log("Seeded item 'demo':", item);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
