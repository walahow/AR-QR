import { notFound } from "next/navigation";
import { getItem } from "@/lib/store";
import ViewerClient from "./ViewerClient";

export default async function ViewPage({ params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    notFound();
  }
  return <ViewerClient key={item.id} item={item} />;
}
