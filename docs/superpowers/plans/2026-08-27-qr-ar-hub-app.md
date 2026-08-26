# QR/AR Hub App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-object WebAR prototype into a small Next.js app deployed on Vercel: a camera-based QR scanner home page, a per-item AR viewer, and an unauthenticated admin page to add new items (upload `.glb`/`.usdz`, get a QR code back).

**Architecture:** Next.js (App Router, plain JavaScript, no TypeScript) with three pages (`/`, `/view/[id]`, `/admin`) and API routes backing them. A storage abstraction (`lib/store.js`, `lib/blob.js`) uses real Vercel KV/Blob when their env vars are present, and falls back to a local JSON file / `public/uploads/` folder otherwise — so the whole app is testable locally without needing live Vercel resources provisioned yet. `<model-viewer>` (unchanged from the prototype) still does all AR rendering/handoff; `jsQR` does in-browser camera QR decoding on the home page.

**Tech Stack:** Next.js 16.3.3, React 19.2.8 / react-dom 19.2.8, `@vercel/kv` 3.0.0, `@vercel/blob` 2.8.0, `qrcode` 1.5.4, `nanoid` 6.0.1, `jsqr` 1.4.0. No CSS framework — plain CSS implementing the approved "Bold Editorial" style (white background, black borders, bold type).

**Notes:**
- No automated test framework is introduced here (consistent with the prior plan's approach) — verification is functional: run the dev server, hit real endpoints with curl, check pages in the browser.
- No authentication on `/admin` — this is an explicit, user-approved decision from the design spec, not an oversight. Flagged again here so it isn't silently "fixed" during implementation.
- Per-item poster images (used in the prototype for instant-load feedback) are dropped in this app — the data model only tracks `glbUrl`/`usdzUrl` per the design spec, and adding per-item posters wasn't requested. This is a deliberate scope trim, not a gap.
- The prototype's `scripts/generate_*.py` files, `assets/poster.png`, and `assets/model.glb`/`model.usdz` are untouched by this plan except: `model.glb`/`model.usdz` are read as the seed data source in Task 9. The old root `index.html` and root `qr.png` are deleted in Task 1 because the new app fully supersedes what they did (their content remains in git history).
- Deploying to Vercel (Task 11) requires an interactive `vercel login` with the user's own account — that step cannot be run by an automated agent. Task 11 covers what CAN be automated (a production build sanity check) plus the exact manual commands for the user to run themselves.

---

### Task 1: Retire the static prototype, scaffold the Next.js app

**Files:**
- Delete: `index.html` (repo root)
- Delete: `qr.png` (repo root)
- Modify: `.gitignore`
- Modify: `.claude/launch.json`
- Create: `package.json`
- Create: `next.config.mjs`
- Create: `jsconfig.json`
- Create: `app/layout.js`
- Create: `app/globals.css`
- Create: `app/page.js` (temporary placeholder — replaced in Task 8)

- [ ] **Step 1: Remove the superseded static prototype files**

```bash
git rm index.html qr.png
```

- [ ] **Step 2: Extend .gitignore for the Next.js app**

Add these lines to the existing `.gitignore`:
```
node_modules/
.next/
data/
public/uploads/
.env*.local
```

- [ ] **Step 3: Replace `.claude/launch.json` to launch the Next.js dev server**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "ar-qr-nextjs",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 4: Create `package.json`**

```json
{
  "name": "ar-qr-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "seed": "node scripts/seed.js"
  },
  "dependencies": {
    "next": "16.3.3",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "@vercel/kv": "3.0.0",
    "@vercel/blob": "2.8.0",
    "qrcode": "1.5.4",
    "nanoid": "6.0.1",
    "jsqr": "1.4.0"
  }
}
```

- [ ] **Step 5: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 6: Create `jsconfig.json`** (enables the `@/` import alias used throughout the app)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 7: Create `app/globals.css`** (the approved "Bold Editorial" theme: white bg, black borders, bold type)

```css
:root {
  --bg: #ffffff;
  --fg: #000000;
  --border-width: 4px;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}

h1, h2, .display {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 1px;
}

a {
  color: var(--fg);
}

button, .button {
  font-family: inherit;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  background: var(--bg);
  color: var(--fg);
  border: var(--border-width) solid var(--fg);
  padding: 0.75em 1.5em;
  cursor: pointer;
}

button:hover, .button:hover {
  background: var(--fg);
  color: var(--bg);
}

.frame {
  border: var(--border-width) solid var(--fg);
}

.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  gap: 24px;
}
```

- [ ] **Step 8: Create `app/layout.js`**

```jsx
import "./globals.css";

export const metadata = {
  title: "AR/QR Hub",
  description: "Scan a QR code to view 3D objects in AR",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create a temporary placeholder `app/page.js`** (replaced with the real scanner in Task 8 — this just proves the app boots)

```jsx
export default function Home() {
  return (
    <div className="page">
      <h1>AR/QR Hub</h1>
      <p>Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 10: Install dependencies and verify the dev server boots**

```bash
npm install
```

Then start the preview via the Browser tool's `preview_start` with `name: "ar-qr-nextjs"`, navigate to `http://localhost:3000`, and confirm via `read_page` that "AR/QR Hub" and "Coming soon." are present, and via `read_console_messages` that there are no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app, retire static prototype files"
```

---

### Task 2: Storage abstraction (`lib/store.js`)

Item metadata needs to work identically whether backed by real Vercel KV (production) or a local JSON file (local dev, before Vercel resources are provisioned).

**Files:**
- Create: `lib/store.js`

- [ ] **Step 1: Write `lib/store.js`**

```js
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
```

- [ ] **Step 2: Verify it works standalone (no Next.js needed for this check)**

```bash
node -e "
import('./lib/store.js').then(async (store) => {
  await store.createItem({ id: 'test1', name: 'Test Item' });
  console.log('after create:', await store.listItems());
  console.log('get:', await store.getItem('test1'));
  await store.deleteItem('test1');
  console.log('after delete:', await store.listItems());
});
"
```
Expected output: an array containing the test item, then the fetched item, then an empty array. This also creates `data/items.json` (gitignored) — that's expected.

- [ ] **Step 3: Commit**

```bash
git add lib/store.js
git commit -m "Add item storage abstraction (Vercel KV with local JSON fallback)"
```

---

### Task 3: Blob abstraction (`lib/blob.js`)

Uploaded `.glb`/`.usdz` files need to work identically whether backed by real Vercel Blob (production) or the local filesystem (local dev).

**Files:**
- Create: `lib/blob.js`

- [ ] **Step 1: Write `lib/blob.js`**

```js
import { promises as fs } from "fs";
import path from "path";

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function uploadFile(filename, buffer, contentType) {
  if (useBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(filename, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return blob.url;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = `${Date.now()}-${filename}`;
  await fs.writeFile(path.join(UPLOAD_DIR, safeName), buffer);
  return `/uploads/${safeName}`;
}
```

- [ ] **Step 2: Verify it works standalone**

```bash
node -e "
import('./lib/blob.js').then(async (blob) => {
  const url = await blob.uploadFile('test.txt', Buffer.from('hello world'), 'text/plain');
  console.log('uploaded to:', url);
});
"
```
Expected output: `uploaded to: /uploads/<timestamp>-test.txt`. Confirm the file actually exists: `ls public/uploads/`. Then remove the test file: `rm public/uploads/*-test.txt`.

- [ ] **Step 3: Commit**

```bash
git add lib/blob.js
git commit -m "Add file storage abstraction (Vercel Blob with local filesystem fallback)"
```

---

### Task 4: Items API routes

**Files:**
- Create: `app/api/items/route.js`
- Create: `app/api/items/[id]/route.js`

- [ ] **Step 1: Write `app/api/items/route.js`** (list + create)

```js
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
```

- [ ] **Step 2: Write `app/api/items/[id]/route.js`** (get one + delete)

```js
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
```

- [ ] **Step 3: Start the dev server and verify with curl**

Start the preview (`preview_start`, name `ar-qr-nextjs`) if not already running.

```bash
curl -s http://localhost:3000/api/items
```
Expected: `[]` (empty array, no items yet).

```bash
curl -s -X POST http://localhost:3000/api/items \
  -F "name=Curl Test Item" \
  -F "glb=@assets/model.glb;type=model/gltf-binary" \
  -F "usdz=@assets/model.usdz;type=model/vnd.usdz+zip"
```
Expected: a JSON object with `id`, `name: "Curl Test Item"`, `glbUrl` starting with `/uploads/`, `usdzUrl` starting with `/uploads/`, and `createdAt`.

```bash
curl -s http://localhost:3000/api/items
```
Expected: an array containing that one item.

Note the `id` from the response, then clean up:
```bash
curl -s -X DELETE http://localhost:3000/api/items/<id>
rm public/uploads/*Curl*
```
Expected DELETE response: `{"ok":true}`. Confirm `curl -s http://localhost:3000/api/items` returns `[]` again.

- [ ] **Step 4: Commit**

```bash
git add app/api/items
git commit -m "Add items API routes (list, create, get, delete)"
```

---

### Task 5: QR code PNG API route

**Files:**
- Create: `app/api/items/[id]/qr/route.js`

- [ ] **Step 1: Write `app/api/items/[id]/qr/route.js`**

```js
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
```

- [ ] **Step 2: Verify with curl** (create a temporary item first since the route 404s for unknown ids)

Confirm the dev server is running first: check via `preview_list`; if the `ar-qr-nextjs` server isn't listed as running, start it with `preview_start` (`name: "ar-qr-nextjs"`).

```bash
ID=$(curl -s -X POST http://localhost:3000/api/items \
  -F "name=QR Test Item" \
  -F "glb=@assets/model.glb;type=model/gltf-binary" \
  -F "usdz=@assets/model.usdz;type=model/vnd.usdz+zip" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -o /tmp/test-qr.png -D - "http://localhost:3000/api/items/$ID/qr"
```
Expected: response headers include `Content-Type: image/png`; `/tmp/test-qr.png` is a non-trivial-size file.

```bash
python -c "
with open('/tmp/test-qr.png','rb') as f:
    print(f.read(8) == b'\x89PNG\r\n\x1a\n')
"
```
Expected: `True`.

Clean up:
```bash
curl -s -X DELETE "http://localhost:3000/api/items/$ID"
rm public/uploads/*QR*Test* /tmp/test-qr.png 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add app/api/items/[id]/qr
git commit -m "Add per-item QR code PNG API route"
```

---

### Task 6: Viewer page (`/view/[id]`)

**Files:**
- Create: `app/view/[id]/page.js`
- Create: `app/view/[id]/ViewerClient.js`

- [ ] **Step 1: Write `app/view/[id]/page.js`** (server component: fetch + 404 handling)

```jsx
import { notFound } from "next/navigation";
import { getItem } from "@/lib/store";
import ViewerClient from "./ViewerClient";

export default async function ViewPage({ params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    notFound();
  }
  return <ViewerClient item={item} />;
}
```

- [ ] **Step 2: Write `app/view/[id]/ViewerClient.js`** (client component: renders `<model-viewer>`)

```jsx
"use client";

import Script from "next/script";

export default function ViewerClient({ item }) {
  return (
    <div className="page" style={{ padding: 0, gap: 0 }}>
      <Script
        type="module"
        src="https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js"
        strategy="afterInteractive"
      />
      <div style={{ width: "100%", height: "80vh", background: "#111" }}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <model-viewer
          src={item.glbUrl}
          ios-src={item.usdzUrl}
          alt={item.name}
          ar
          ar-modes="webxr scene-viewer quick-look"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          style={{ width: "100%", height: "100%" }}
        ></model-viewer>
      </div>
      <div style={{ padding: 16, borderTop: "4px solid #000", width: "100%" }}>
        <h2 style={{ margin: "0 0 8px" }}>{item.name}</h2>
        <p style={{ margin: 0 }}>Tap the AR icon to place this in your space.</p>
      </div>
    </div>
  );
}
```

Note: `<model-viewer>` is a custom element, so React/Next may log a warning about unrecognized attributes like `ios-src`/`ar-modes` in the dev console — that's expected/harmless for web components and not a bug to fix.

- [ ] **Step 3: Seed a temporary test item and verify in the browser**

Confirm the dev server is running first: check via `preview_list`; if the `ar-qr-nextjs` server isn't listed as running, start it with `preview_start` (`name: "ar-qr-nextjs"`).

```bash
ID=$(curl -s -X POST http://localhost:3000/api/items \
  -F "name=Viewer Test Item" \
  -F "glb=@assets/model.glb;type=model/gltf-binary" \
  -F "usdz=@assets/model.usdz;type=model/vnd.usdz+zip" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Test item id: $ID"
```

Navigate the Browser tool to `http://localhost:3000/view/$ID`. Use `read_console_messages` (no real errors — the custom-element attribute warning noted above is fine) and `read_network_requests` (confirm the `.glb` under `/uploads/` returns 200). Try `computer{action:"screenshot"}` once; if it fails with "Browser pane is not displayed", that's a known environment limitation (not a bug) — fall back to `read_page` to confirm the item's name and instruction text ("Tap the AR icon...") are present in the DOM.

Also verify the 404 path: navigate to `http://localhost:3000/view/nonexistent-id` and confirm a 404 page is shown (check via `read_page` or response status in `read_network_requests`).

Clean up the test item:
```bash
curl -s -X DELETE "http://localhost:3000/api/items/$ID"
rm public/uploads/*Viewer*Test*
```

- [ ] **Step 4: Commit**

```bash
git add app/view
git commit -m "Add per-item AR viewer page"
```

---

### Task 7: Admin page (`/admin`)

**Files:**
- Create: `app/admin/page.js`

- [ ] **Step 1: Write `app/admin/page.js`**

```jsx
"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [glbFile, setGlbFile] = useState(null);
  const [usdzFile, setUsdzFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function loadItems() {
    const res = await fetch("/api/items");
    const data = await res.json();
    setItems(data);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name || !glbFile || !usdzFile) {
      setError("Name, .glb file, and .usdz file are all required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("glb", glbFile);
      formData.append("usdz", usdzFile);
      const res = await fetch("/api/items", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create item");
      }
      setName("");
      setGlbFile(null);
      setUsdzFile(null);
      await loadItems();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    await loadItems();
  }

  return (
    <div className="page" style={{ justifyContent: "flex-start" }}>
      <h1>Admin</h1>

      <form
        onSubmit={handleSubmit}
        className="frame"
        style={{ padding: 24, width: "100%", maxWidth: 480, textAlign: "left" }}
      >
        <label style={{ display: "block", marginBottom: 12 }}>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "2px solid #000" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          .glb file
          <input
            type="file"
            accept=".glb"
            onChange={(e) => setGlbFile(e.target.files[0])}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          .usdz file
          <input
            type="file"
            accept=".usdz"
            onChange={(e) => setUsdzFile(e.target.files[0])}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Uploading..." : "Add Item"}
        </button>
      </form>

      <table style={{ width: "100%", maxWidth: 480, marginTop: 32, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>Name</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>QR</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: 8 }}>{item.name}</td>
              <td style={{ padding: 8 }}>
                <a href={`/api/items/${item.id}/qr`} target="_blank" rel="noreferrer">
                  View QR
                </a>
              </td>
              <td style={{ padding: 8 }}>
                <button type="button" onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Confirm the dev server is running first: check via `preview_list`; if the `ar-qr-nextjs` server isn't listed as running, start it with `preview_start` (`name: "ar-qr-nextjs"`).

Navigate to `http://localhost:3000/admin`. Use `read_page` to confirm the form (Name/.glb/.usdz fields, Add Item button) and an empty items table are present. Use `read_console_messages` to confirm no errors.

Because the sandboxed Browser tool can't attach local files to a file input, verify the actual add/delete flow via curl (already proven working in Task 4) rather than driving the file inputs — then reload `/admin` in the browser and confirm a curl-created item appears in the list:

```bash
ID=$(curl -s -X POST http://localhost:3000/api/items \
  -F "name=Admin List Test" \
  -F "glb=@assets/model.glb;type=model/gltf-binary" \
  -F "usdz=@assets/model.usdz;type=model/vnd.usdz+zip" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
```

Reload `/admin` in the browser, confirm via `read_page` that "Admin List Test" now appears in the table. Then clean up:

```bash
curl -s -X DELETE "http://localhost:3000/api/items/$ID"
rm public/uploads/*Admin*List*
```

Reload `/admin` again, confirm the row is gone.

- [ ] **Step 3: Commit**

```bash
git add app/admin
git commit -m "Add admin page (list items, add new item form)"
```

---

### Task 8: Home/Scanner page (`/`)

Replaces the Task 1 placeholder with the real in-browser QR scanner.

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Replace `app/page.js`**

```jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";

const DECODE_INTERVAL_MS = 250;

export default function ScannerPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const router = useRouter();
  const [status, setStatus] = useState("Requesting camera access...");
  const [decodedText, setDecodedText] = useState(null);

  useEffect(() => {
    let stream;
    let intervalId;
    let cancelled = false;

    function decodeFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return;
      }
      const width = 320;
      const height = Math.round((video.videoHeight / video.videoWidth) * width) || 320;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, width, height);
      if (code && code.data) {
        handleDecoded(code.data);
      }
    }

    function handleDecoded(text) {
      try {
        const url = new URL(text);
        const isSameOrigin = url.origin === window.location.origin;
        const match = url.pathname.match(/^\/view\/([^/]+)$/);
        if (isSameOrigin && match) {
          clearInterval(intervalId);
          router.push(`/view/${match[1]}`);
          return;
        }
      } catch {
        // not a URL — fall through to showing raw text
      }
      setDecodedText(text);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("Point your camera at a QR code");
        intervalId = setInterval(decodeFrame, DECODE_INTERVAL_MS);
      } catch (err) {
        setStatus(`Camera unavailable: ${err.message}`);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="page">
      <h1>Scan QR Code</h1>
      <div className="frame" style={{ width: 280, height: 280, overflow: "hidden" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <p>{status}</p>
      {decodedText && (
        <p>
          Scanned: <a href={decodedText}>{decodedText}</a>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Confirm the dev server is running first: check via `preview_list`; if the `ar-qr-nextjs` server isn't listed as running, start it with `preview_start` (`name: "ar-qr-nextjs"`).

Navigate to `http://localhost:3000/`. Use `read_page` to confirm "Scan QR Code" heading and the frame element are present. Use `read_console_messages` — a camera-permission-denied message is expected in a headless/sandboxed browser context (no real camera device), which the page surfaces as "Camera unavailable: ..." status text rather than crashing; confirm via `read_page` that this status text is shown, and that there's no unrelated JS error (e.g. no ReferenceError, no failed module import for `jsqr`).

Note in your report that the actual scan-to-navigate behavior (real camera + real QR code) requires a physical device and is out of scope for this automated check — same limitation as the AR handoff itself.

- [ ] **Step 3: Commit**

```bash
git add app/page.js
git commit -m "Add in-browser QR scanner as the home page"
```

---

### Task 9: Seed script

**Files:**
- Create: `scripts/seed.js`
- Create: `.env.local.example`

- [ ] **Step 1: Write `scripts/seed.js`**

```js
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
```

- [ ] **Step 2: Write `.env.local.example`**

```
# Vercel KV (populate via `vercel env pull` after provisioning KV on Vercel)
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# Vercel Blob (populate via `vercel env pull` after provisioning Blob on Vercel)
BLOB_READ_WRITE_TOKEN=

# Leave all of the above empty for local development — lib/store.js and
# lib/blob.js fall back to local JSON/file storage under data/ and
# public/uploads/ when these are unset.
```

- [ ] **Step 3: Run the seed script and verify**

```bash
npm run seed
```
Expected output: `Seeded item 'demo': { id: 'demo', name: 'Demo Placeholder', ... }`

```bash
npm run seed
```
Expected output (second run): `Seed item 'demo' already exists, skipping.` (confirms idempotency)

Confirm the dev server is running: check via `preview_list`; if the `ar-qr-nextjs` server isn't listed as running, start it with `preview_start` (`name: "ar-qr-nextjs"`).

```bash
curl -s http://localhost:3000/api/items
```
Expected: an array containing the `demo` item (the standalone seed script and the running dev server both read/write the same `data/items.json` file on disk, so there's no shared in-memory state to go stale between them).

Navigate the Browser tool to `http://localhost:3000/view/demo` and confirm via `read_page`/`read_network_requests` that it renders like the Task 6 verification did.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.js .env.local.example
git commit -m "Add seed script to load the placeholder cube/astronaut as the first item"
```

---

### Task 10: Local end-to-end verification

This project has no automated test suite — this task is the functional verification pass across the whole app together, now that every piece exists.

**Files:** none (verification only)

- [ ] **Step 1: Full production build check**

```bash
npm run build
```
Expected: build completes successfully with no errors (warnings about the `<model-viewer>` custom element attributes, if any, are acceptable — see Task 6 note). This catches issues dev mode's looser checking can miss.

Restart the dev server afterward if the build step stopped it (`preview_start`, name `ar-qr-nextjs`).

- [ ] **Step 2: Confirm the full CRUD path end-to-end** (beyond just the seeded item)

```bash
ID=$(curl -s -X POST http://localhost:3000/api/items \
  -F "name=E2E Test Item" \
  -F "glb=@assets/model.glb;type=model/gltf-binary" \
  -F "usdz=@assets/model.usdz;type=model/vnd.usdz+zip" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s "http://localhost:3000/api/items/$ID"
curl -s -o /tmp/e2e-qr.png "http://localhost:3000/api/items/$ID/qr"
python -c "
with open('/tmp/e2e-qr.png','rb') as f:
    print(f.read(8) == b'\x89PNG\r\n\x1a\n')
"
curl -s -X DELETE "http://localhost:3000/api/items/$ID"
curl -s http://localhost:3000/api/items
rm public/uploads/*E2E*Test* /tmp/e2e-qr.png 2>/dev/null || true
```
Expected: item fetched successfully, QR PNG signature check prints `True`, and the final `GET /api/items` no longer includes the deleted item (should just show `demo`).

- [ ] **Step 3: Confirm all three pages load without console errors**

For each of `http://localhost:3000/`, `http://localhost:3000/view/demo`, `http://localhost:3000/admin`: navigate, `read_console_messages`, `read_page`. Report what each showed.

- [ ] **Step 4: Commit the verification note**

```bash
git commit --allow-empty -m "Verify QR/AR hub app end-to-end (build, CRUD, all pages)"
```

---

### Task 11: Prepare for Vercel deployment

The actual `vercel login` must be run interactively by the project owner (it opens a browser to authenticate their account) — this cannot be automated by an agent. This task does what CAN be automated, then hands off the exact remaining commands.

**Files:** none (verification + a final report only)

- [ ] **Step 1: Confirm the production build still succeeds** (re-check after all prior tasks' commits, in case anything drifted)

```bash
npm run build
```
Expected: succeeds with no errors.

- [ ] **Step 2: Check whether the Vercel CLI is reachable via npx**

```bash
npx --yes vercel --version
```
Expected: prints a version number (npx will download the CLI on first use if it isn't already available — this is a normal, non-interactive step).

- [ ] **Step 3: Report the exact remaining manual steps**

These require the project owner's own Vercel account and cannot be run by an automated agent — report them plainly rather than attempting to execute:

```bash
npx vercel login
npx vercel link
npx vercel storage create kv
npx vercel storage create blob
npx vercel env pull .env.local
npx vercel --prod
```

After the first `--prod` deploy, run the seed script against production data by temporarily pulling the production env vars locally (already done by `vercel env pull`) and running `npm run seed` once locally — this uploads the placeholder demo assets to the real Vercel Blob/KV, not the local fallback, because `.env.local` will now have real `KV_REST_API_URL`/`BLOB_READ_WRITE_TOKEN` values.

- [ ] **Step 4: No commit for this task** (verification/reporting only — nothing in the repo changes)
