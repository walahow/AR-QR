import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "items.json");

const useKV = Boolean(process.env.KV_REST_API_URL);

async function readLocalStore() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeLocalStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

export async function listItems() {
  if (useKV) {
    const { kv } = await import("@vercel/kv");
    const ids = await kv.smembers("items:all");
    if (ids.length === 0) return [];
    const items = await Promise.all(ids.map((id) => kv.get(`item:${id}`)));
    return items.filter(Boolean);
  }
  const store = await readLocalStore();
  return Object.values(store);
}

export async function getItem(id) {
  if (useKV) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get(`item:${id}`)) ?? null;
  }
  const store = await readLocalStore();
  return store[id] ?? null;
}

export async function createItem(item) {
  if (useKV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(`item:${item.id}`, item);
    await kv.sadd("items:all", item.id);
    return item;
  }
  const store = await readLocalStore();
  store[item.id] = item;
  await writeLocalStore(store);
  return item;
}

export async function deleteItem(id) {
  if (useKV) {
    const { kv } = await import("@vercel/kv");
    await kv.del(`item:${id}`);
    await kv.srem("items:all", id);
    return;
  }
  const store = await readLocalStore();
  delete store[id];
  await writeLocalStore(store);
}
