import { promises as fs } from "fs";
import path from "path";
import { MongoClient } from "mongodb";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "items.json");

const useMongoDB = Boolean(process.env.MONGODB_URI);

let mongoClient = null;
let db = null;

async function getDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db("ar_qr_hub");
  }
  return db;
}

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
  if (useMongoDB) {
    const database = await getDB();
    const collection = database.collection("items");
    const items = await collection.find({}).toArray();
    return items.map(({ _id, ...item }) => item);
  }
  const store = await readLocalStore();
  return Object.values(store);
}

export async function getItem(id) {
  if (useMongoDB) {
    const database = await getDB();
    const collection = database.collection("items");
    const item = await collection.findOne({ id });
    if (!item) return null;
    const { _id, ...itemWithoutId } = item;
    return itemWithoutId;
  }
  const store = await readLocalStore();
  return store[id] ?? null;
}

export async function createItem(item) {
  if (useMongoDB) {
    const database = await getDB();
    const collection = database.collection("items");
    await collection.insertOne(item);
    return item;
  }
  const store = await readLocalStore();
  store[item.id] = item;
  await writeLocalStore(store);
  return item;
}

export async function updateItem(id, patch) {
  if (useMongoDB) {
    const database = await getDB();
    const collection = database.collection("items");
    await collection.updateOne({ id }, { $set: patch });
    const updated = await collection.findOne({ id });
    if (!updated) return null;
    const { _id, ...itemWithoutId } = updated;
    return itemWithoutId;
  }
  const store = await readLocalStore();
  if (!store[id]) return null;
  store[id] = { ...store[id], ...patch };
  await writeLocalStore(store);
  return store[id];
}

export async function deleteItem(id) {
  if (useMongoDB) {
    const database = await getDB();
    const collection = database.collection("items");
    await collection.deleteOne({ id });
    return;
  }
  const store = await readLocalStore();
  delete store[id];
  await writeLocalStore(store);
}
