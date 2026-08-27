"use client";

import { useEffect, useState } from "react";
import { SHAPES } from "@/lib/wireframePrimitive";

export default function AdminPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [shape, setShape] = useState(SHAPES[0]);
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
      formData.append("shape", shape);
      formData.append("glb", glbFile);
      formData.append("usdz", usdzFile);
      const res = await fetch("/api/items", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create item");
      }
      setName("");
      setShape(SHAPES[0]);
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
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        let message = "Failed to delete item";
        try {
          const body = await res.json();
          if (body.error) message = body.error;
        } catch {
          // response body wasn't JSON; keep the fallback message
        }
        throw new Error(message);
      }
      setError(null);
      await loadItems();
    } catch (err) {
      setError(err.message);
    }
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
          Shape (for wireframe mode)
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "2px solid #000" }}
          >
            {SHAPES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
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
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>Shape</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>QR</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: 8 }}>{item.name}</td>
              <td style={{ padding: 8 }}>{item.shape ?? "—"}</td>
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
