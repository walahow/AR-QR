import { NextResponse } from "next/server";
import { getItem, deleteItem } from "@/lib/store";

export async function GET(request, { params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  await deleteItem(id);
  return NextResponse.json({ ok: true });
}
