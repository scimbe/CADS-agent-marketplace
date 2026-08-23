// CADS Marketplace admin dashboard: thin, read-only view over the Phase 3 registry API
// (crates/registry). No write actions, no auth token held client-side -- every call here hits
// one of the registry's unauthenticated GET routes (see registry/src/lib.rs's own doc comment on
// why reads are deliberately open).

function hexTrunc(hex) {
  return hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-6)}` : hex;
}

function fmtTime(unixSecs) {
  return new Date(unixSecs * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function verdictBadge(verdict) {
  const clean = verdict === "clean";
  const span = document.createElement("span");
  span.className = clean ? "badge badge-clean" : "badge badge-flagged";
  span.textContent = clean ? "clean" : "flagged";
  span.title = verdict;
  return span;
}

async function fetchJson(path) {
  const resp = await fetch(`${window.REGISTRY_BASE_URL}${path}`);
  if (!resp.ok) {
    throw new Error(`${path} -> HTTP ${resp.status}`);
  }
  return resp.json();
}

async function activationCountFor(publisherPubkey, manifestId) {
  try {
    const ledger = await fetchJson(`/publishers/${publisherPubkey}/ledger`);
    const row = ledger.find((r) => r.manifest_id === manifestId);
    return row ? row.activation_count : 0;
  } catch (e) {
    console.error("ledger fetch failed for", publisherPubkey, e);
    return null;
  }
}

async function render() {
  const statusEl = document.getElementById("status");
  const body = document.getElementById("manifests-body");
  let manifests;
  try {
    manifests = await fetchJson("/manifests");
  } catch (e) {
    statusEl.textContent = `Could not reach the registry: ${e.message}`;
    statusEl.className = "status status-error";
    body.innerHTML = "";
    return;
  }

  statusEl.textContent = `${manifests.length} manifest${manifests.length === 1 ? "" : "s"} published.`;
  statusEl.className = "status";
  body.innerHTML = "";

  if (manifests.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty">No manifests published yet.</td></tr>';
    return;
  }

  for (const m of manifests) {
    const count = await activationCountFor(m.publisher_pubkey, m.manifest_id);
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = m.name;
    tr.appendChild(nameTd);

    const versionTd = document.createElement("td");
    versionTd.textContent = m.version;
    tr.appendChild(versionTd);

    const pubTd = document.createElement("td");
    pubTd.className = "mono";
    pubTd.textContent = hexTrunc(m.publisher_pubkey);
    pubTd.title = m.publisher_pubkey;
    tr.appendChild(pubTd);

    const verdictTd = document.createElement("td");
    verdictTd.appendChild(verdictBadge(m.guardrail_verdict));
    tr.appendChild(verdictTd);

    const countTd = document.createElement("td");
    countTd.textContent = count === null ? "?" : String(count);
    tr.appendChild(countTd);

    const timeTd = document.createElement("td");
    timeTd.textContent = fmtTime(m.published_at);
    tr.appendChild(timeTd);

    body.appendChild(tr);
  }
}

render();
