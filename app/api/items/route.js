import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listItems, createItem } from "@/lib/store";
import { uploadFile } from "@/lib/blob";

export async function GET() {
  const items = await listItems();
  return NextResponse.json(items);
}

export async function POST(request) {
  const formData = await request.formData();
  const name = formData.get("name");
  const glbFile = formData.get("glb");
  const usdzFile = formData.get("usdz");

  if (!name || !glbFile || !usdzFile) {
    return NextResponse.json(
      { error: "name, glb, and usdz are all required" },
      { status: 400 }
    );
  }

  const id = nanoid(10);
  const glbBuffer = Buffer.from(await glbFile.arrayBuffer());
  const usdzBuffer = Buffer.from(await usdzFile.arrayBuffer());

  const glbUrl = await uploadFile(`${id}.glb`, glbBuffer, "model/gltf-binary");
  const usdzUrl = await uploadFile(`${id}.usdz`, usdzBuffer, "model/vnd.usdz+zip");

  const item = {
    id,
    name: String(name),
    glbUrl,
    usdzUrl,
    createdAt: new Date().toISOString(),
  };

  await createItem(item);
  return NextResponse.json(item, { status: 201 });
}
