const USAGE_API_BASE = "https://claude.ai/api/organizations";
const POLL_MINUTES = 5;
const ALARM_NAME = "usage-poll";

// === Cookie & API Helpers ===

async function fetchUsageData() {
  const cookies = await chrome.cookies.getAll({ domain: "claude.ai" });
  if (!cookies || cookies.length === 0) {
    throw new Error("NO_COOKIES");
  }

  const orgCookie = cookies.find(c => c.name === "lastActiveOrg");
  if (!orgCookie) {
    throw new Error("NO_ORG_ID");
  }

  const orgId = orgCookie.value;
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  const res = await fetch(`${USAGE_API_BASE}/${orgId}/usage`, {
    headers: {
      "Cookie": cookieHeader,
      "Content-Type": "application/json"
    },
    credentials: "include"
  });

  if (!res.ok) {
    throw new Error(`API_ERROR_${res.status}`);
  }

  return res.json();
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
  else if (pct < 75) color = "#FFC107";
  else if (pct < 90) color = "#FF9800";
  else color = "#F44336";

  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
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
