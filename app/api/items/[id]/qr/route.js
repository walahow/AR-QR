import QRCode from "qrcode";
import { getItem } from "@/lib/store";

export async function GET(request, { params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    return new Response("Not found", { status: 404 });
  }
  const origin = new URL(request.url).origin;
  const targetUrl = `${origin}/view/${id}`;
  const buffer = await QRCode.toBuffer(targetUrl, { width: 512, margin: 2 });
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
