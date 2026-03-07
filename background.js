const CLAUDE_ORIGIN = "https://claude.ai";
const USAGE_API_BASE = `${CLAUDE_ORIGIN}/api/organizations`;
const POLL_MINUTES = 5;
const ALARM_NAME = "usage-poll";
const THRESHOLDS = [50, 75, 90];
const KEY_LABELS = {
  five_hour: "Current Session",
  seven_day: "Weekly All Models",
  seven_day_sonnet: "Weekly Sonnet",
  seven_day_opus: "Weekly Opus",
  seven_day_cowork: "Weekly Cowork",
  seven_day_oauth: "Weekly OAuth"
};

// === Cookie & API Helpers ===

async function fetchUsageData() {
  console.log("[ClaudeUsage] Querying for claude.ai tabs...");
  const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
  console.log("[ClaudeUsage] Found tabs:", tabs.length, tabs.map(t => t.url));
  if (!tabs || tabs.length === 0) {
    throw new Error("NO_TAB");
  }

  const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "fetchUsage" });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.data;
}

// === Badge Update ===

const DEFAULT_ORDER = [
  "five_hour", "seven_day", "seven_day_sonnet",
  "seven_day_opus", "seven_day_cowork", "seven_day_oauth"
];

async function getFirstCardKey() {
  const { cardOrder } = await chrome.storage.local.get("cardOrder");
  return (cardOrder && cardOrder.length > 0) ? cardOrder[0] : DEFAULT_ORDER[0];
}

async function updateBadge(usageData) {
  const firstKey = await getFirstCardKey();

  // Find the first non-null entry starting from the preferred key
  let entry = usageData[firstKey];
  if (!entry) {
    // Fallback: find any non-null entry in order
    const order = (await chrome.storage.local.get("cardOrder")).cardOrder || DEFAULT_ORDER;
    for (const key of order) {
      if (usageData[key]) { entry = usageData[key]; break; }
    }
  }

  if (!entry) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const pct = Math.round(entry.utilization);
  await chrome.action.setBadgeText({ text: `${pct}` });

  let color;
  if (pct < 50) color = "#4CAF50";
  else if (pct < 75) color = "#c4a829";
  else if (pct < 90) color = "#e8600a";
  else color = "#f85149";

  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
}

// === Threshold Notifications ===

function formatResetTime(resetAtIso) {
  if (!resetAtIso) return "soon";
  const diffMs = new Date(resetAtIso).getTime() - Date.now();
  if (diffMs <= 0) return "soon";
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function checkThresholdNotifications(usageData) {
  const firstKey = await getFirstCardKey();
  const entry = usageData[firstKey];
  if (!entry) return;

  const pct = Math.round(entry.utilization);
  const { notifiedThresholds = {} } = await chrome.storage.local.get("notifiedThresholds");
  let changed = false;

  for (const threshold of THRESHOLDS) {
    const storageKey = `notified_${firstKey}_${threshold}`;

    if (pct >= threshold && !notifiedThresholds[storageKey]) {
      notifiedThresholds[storageKey] = true;
      changed = true;
      chrome.notifications.create(`${firstKey}_${threshold}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: KEY_LABELS[firstKey] || firstKey,
        message: `Usage at ${pct}% — resets in ${formatResetTime(entry.resets_at)}`
      });
    } else if (pct < threshold && notifiedThresholds[storageKey]) {
      delete notifiedThresholds[storageKey];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ notifiedThresholds });
  }
}

// === Core Poll Orchestrator ===

async function pollUsage() {
  try {
    const usageData = await fetchUsageData();

    await chrome.storage.local.set({
      usageData: {
        usage: usageData,
        lastUpdated: Date.now(),
        error: null
      }
    });

    await updateBadge(usageData);
    await checkThresholdNotifications(usageData);
  } catch (err) {
    const prev = await chrome.storage.local.get("usageData");
    const storeData = {
      ...(prev.usageData || {}),
      error: err.message,
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({ usageData: storeData });

    if (!prev.usageData || !prev.usageData.usage) {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setBadgeBackgroundColor({ color: "#666666" });
      await chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
    }
  }
}

// === Re-update badge when card order changes ===

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.cardOrder) {
    const { usageData } = await chrome.storage.local.get("usageData");
    if (usageData && usageData.usage) {
      await updateBadge(usageData.usage);
    }
  }
});

// === Message handler for manual refresh from popup ===

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "pollNow") {
    pollUsage();
  }
});

// === Event Listeners (TOP LEVEL — required for MV3) ===

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollUsage();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
  pollUsage();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
  pollUsage();
});
