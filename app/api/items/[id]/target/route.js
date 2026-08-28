import { NextResponse } from "next/server";
import { getItem, updateItem } from "@/lib/store";
import { uploadFile } from "@/lib/blob";

export async function POST(request, { params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Target file is empty" }, { status: 400 });
  }

  const buffer = Buffer.from(arrayBuffer);
  const arTargetUrl = await uploadFile(`${id}.mind`, buffer, "application/octet-stream");

  const updated = await updateItem(id, { arTargetUrl });
  return NextResponse.json(updated, { status: 200 });
}
