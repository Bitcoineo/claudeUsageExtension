const USAGE_KEYS = [
  { key: "five_hour",        label: "Current Session" },
  { key: "seven_day",        label: "Weekly All Models" },
  { key: "seven_day_sonnet", label: "Weekly Sonnet" },
  { key: "seven_day_opus",   label: "Weekly Opus" },
  { key: "seven_day_cowork", label: "Weekly Cowork" },
  { key: "seven_day_oauth",  label: "Weekly OAuth" },
];

let updateTimer = null;
let cardOrder = null; // persisted key order
let lastUsageData = null; // cached for re-renders after reorder

// === Entry Point ===

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(["usageData", "cardOrder"]);
  cardOrder = stored.cardOrder || null;

  if (stored.usageData && stored.usageData.usage) {
    lastUsageData = stored.usageData;
    renderUsage(stored.usageData);
    startUpdateTimer(stored.usageData.lastUpdated);
  } else if (stored.usageData && stored.usageData.error) {
    showStatus(getErrorMessage(stored.usageData.error), true);
  } else {
    showStatus("Loading usage data...", false);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.usageData) {
      const newData = changes.usageData.newValue;
      if (newData && newData.usage) {
        lastUsageData = newData;
        renderUsage(newData);
        startUpdateTimer(newData.lastUpdated);
      } else if (newData && newData.error) {
        showStatus(getErrorMessage(newData.error), true);
      }
    }
  });
});

// === Ordering ===

function getOrderedKeys(usage) {
  // Filter to only keys with non-null data
  const available = USAGE_KEYS.filter(
    ({ key }) => usage[key] !== null && usage[key] !== undefined
  );

  if (!cardOrder) return available;

  // Sort by saved order, appending any new keys at the end
  const ordered = [];
  for (const key of cardOrder) {
    const found = available.find(k => k.key === key);
    if (found) ordered.push(found);
  }
  for (const item of available) {
    if (!ordered.includes(item)) ordered.push(item);
  }
  return ordered;
}

async function saveOrder(orderedKeys) {
  cardOrder = orderedKeys.map(k => k.key);
  await chrome.storage.local.set({ cardOrder });
}

// === Rendering ===

function renderUsage(data) {
  const container = document.getElementById("usageSections");
  const statusEl = document.getElementById("statusMsg");
  statusEl.classList.add("hidden");

  const ordered = getOrderedKeys(data.usage);
  let html = "";

  for (const { key, label } of ordered) {
    const entry = data.usage[key];
    const pct = Math.round(entry.utilization);
    const colorClass = getColorClass(pct);
    const bgClass = getBgClass(pct);
    const borderClass = getBorderClass(pct);
    const resetText = formatTimeUntilReset(entry.resets_at);

    html += `
      <div class="usage-section ${borderClass}" draggable="true" data-key="${key}">
        <div class="usage-header">
          <span class="drag-handle" title="Drag to reorder — top card shows on badge">
            <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
              <circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/>
              <circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/>
            </svg>
          </span>
          <span class="usage-label">${label}</span>
          <span class="usage-pct ${colorClass}">${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${bgClass}" style="width: ${pct}%"></div>
        </div>
        <div class="usage-reset">${resetText}</div>
      </div>
    `;
  }

  container.innerHTML = html;
  attachDragListeners();
}

// === Drag and Drop ===

let draggedKey = null;

function attachDragListeners() {
  const cards = document.querySelectorAll(".usage-section");

  cards.forEach(card => {
    card.addEventListener("dragstart", (e) => {
      draggedKey = card.dataset.key;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      draggedKey = null;
      card.classList.remove("dragging");
      document.querySelectorAll(".drag-over-above, .drag-over-below").forEach(
        el => el.classList.remove("drag-over-above", "drag-over-below")
      );
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (card.dataset.key === draggedKey) return;

      // Determine if cursor is in top or bottom half
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      card.classList.remove("drag-over-above", "drag-over-below");
      if (e.clientY < midY) {
        card.classList.add("drag-over-above");
      } else {
        card.classList.add("drag-over-below");
      }
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over-above", "drag-over-below");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over-above", "drag-over-below");
      if (!draggedKey || card.dataset.key === draggedKey || !lastUsageData) return;

      const ordered = getOrderedKeys(lastUsageData.usage);
      const fromIdx = ordered.findIndex(k => k.key === draggedKey);
      if (fromIdx === -1) return;

      // Remove dragged item
      const [moved] = ordered.splice(fromIdx, 1);

      // Find target position and determine if inserting above or below
      let toIdx = ordered.findIndex(k => k.key === card.dataset.key);
      const rect = card.getBoundingClientRect();
      if (e.clientY >= rect.top + rect.height / 2) {
        toIdx += 1;
      }

      ordered.splice(toIdx, 0, moved);
      saveOrder(ordered);
      renderUsage(lastUsageData);
    });
  });
}

// === Color Helpers ===

function getColorClass(pct) {
  if (pct < 50) return "color-green";
  if (pct < 75) return "color-yellow";
  if (pct < 90) return "color-orange";
  return "color-red";
}

function getBgClass(pct) {
  if (pct < 50) return "bg-green";
  if (pct < 75) return "bg-yellow";
  if (pct < 90) return "bg-orange";
  return "bg-red";
}

function getBorderClass(pct) {
  if (pct < 50) return "border-green";
  if (pct < 75) return "border-yellow";
  if (pct < 90) return "border-orange";
  return "border-red";
}

// === Time Calculation ===

function formatTimeUntilReset(resetAtIso) {
  if (!resetAtIso) return "";

  const now = Date.now();
  const resetAt = new Date(resetAtIso).getTime();
  const diffMs = resetAt - now;

  if (diffMs <= 0) return "Resetting soon...";

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `Resets in ${days}d ${remainingHours}h`;
  }

  if (hours > 0) {
    return `Resets in ${hours}h ${minutes}m`;
  }

  return `Resets in ${minutes}m`;
}

// === Error Messages ===

function getErrorMessage(errorCode) {
  switch (errorCode) {
    case "NO_COOKIES":
      return "Please sign in to claude.ai";
    case "NO_ORG_ID":
      return "Could not find organization. Visit claude.ai first.";
    default:
      if (errorCode && errorCode.startsWith("API_ERROR_")) {
        const status = errorCode.replace("API_ERROR_", "");
        return `API error (${status}). Try refreshing claude.ai.`;
      }
      return "Something went wrong. Try again later.";
  }
}

// === Status Display ===

function showStatus(message, isError) {
  const statusEl = document.getElementById("statusMsg");
  const sectionsEl = document.getElementById("usageSections");

  sectionsEl.innerHTML = "";
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");

  if (isError) {
    statusEl.classList.add("error-state");
  } else {
    statusEl.classList.remove("error-state");
  }
}

// === Update Timer ===

function startUpdateTimer(lastUpdated) {
  if (updateTimer) clearInterval(updateTimer);

  function tick() {
    if (!lastUpdated) return;
    const seconds = Math.floor((Date.now() - lastUpdated) / 1000);

    let text;
    if (seconds < 60) {
      text = `${seconds}s ago`;
    } else {
      const mins = Math.floor(seconds / 60);
      text = `${mins}m ago`;
    }

    document.getElementById("updateAgo").textContent = text;
  }

  tick();
  updateTimer = setInterval(tick, 1000);
}
