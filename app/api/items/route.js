import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listItems, createItem } from "@/lib/store";
import { uploadFile } from "@/lib/blob";

export async function GET() {
  const items = await listItems();
  return NextResponse.json(items);
}

export async function POST(request) {
  let formData;
  let name;
  let glbFile;
  let usdzFile;
  let glbBuffer;
  let usdzBuffer;

  try {
    formData = await request.formData();
    name = formData.get("name");
    glbFile = formData.get("glb");
    usdzFile = formData.get("usdz");

    glbBuffer = glbFile ? Buffer.from(await glbFile.arrayBuffer()) : null;
    usdzBuffer = usdzFile ? Buffer.from(await usdzFile.arrayBuffer()) : null;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid multipart/form-data" },
      { status: 400 }
    );
  }

  if (
    !name ||
    !glbFile ||
    !usdzFile ||
    glbFile.size === 0 ||
    usdzFile.size === 0
  ) {
    return NextResponse.json(
      { error: "name, glb, and usdz are all required" },
      { status: 400 }
    );
  }

  const id = nanoid(10);

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
