// Minimal in-memory stand-in for the parts of the Firestore Admin API the server uses.
export function fakeFirestore() {
  const docs = new Map(); // path -> data
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));

  function snap(path) {
    const data = docs.get(path);
    const id = path.split("/").pop();
    return {
      id, exists: data !== undefined, ref: doc(path),
      data: () => clone(data),
      get: (f) => (data ? clone(data[f]) : undefined),
    };
  }
  function doc(path) {
    return {
      id: path.split("/").pop(), path,
      async get() { return snap(path); },
      async set(d) { docs.set(path, clone(d)); },
      async update(p) {
        if (!docs.has(path)) throw new Error(`update on missing doc ${path}`);
        docs.set(path, { ...docs.get(path), ...clone(p) });
      },
      async delete() { docs.delete(path); },
    };
  }
  function collection(path, filters = [], max = Infinity) {
    const q = {
      where: (f, op, v) => { if (op !== "==") throw new Error("fake supports == only"); return collection(path, [...filters, [f, v]], max); },
      limit: (n) => collection(path, filters, n),
      async add(d) { const id = Math.random().toString(36).slice(2); docs.set(`${path}/${id}`, clone(d)); return doc(`${path}/${id}`); },
      async get() {
        const depth = path.split("/").length + 1;
        const list = [...docs.keys()]
          .filter((k) => k.startsWith(path + "/") && k.split("/").length === depth)
          .filter((k) => filters.every(([f, v]) => docs.get(k)[f] === v))
          .slice(0, max)
          .map(snap);
        return { size: list.length, empty: list.length === 0, docs: list };
      },
    };
    return q;
  }
  async function runTransaction(fn) {
    const writes = [];
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, d) => writes.push(() => ref.set(d)),
      delete: (ref) => writes.push(() => ref.delete()),
    };
    const out = await fn(tx); // a throw here discards all writes, like Firestore
    for (const w of writes) await w();
    return out;
  }
  return { doc, collection, runTransaction, _docs: docs };
}

// Fake auth: tokens are just JSON so tests can sign in as anyone.
export const fakeAuth = {
  async createCustomToken(uid, claims) { return JSON.stringify({ uid, ...claims }); },
  async verifyIdToken(t) { try { return JSON.parse(t); } catch { throw new Error("bad token"); } },
};

// Fake Netlify Blobs store.
export function fakeBlobs() {
  const m = new Map();
  return {
    _m: m,
    async set(key, data, opts = {}) { m.set(key, { data, metadata: opts.metadata || {} }); },
    async getWithMetadata(key) { return m.get(key) || null; },
  };
}
