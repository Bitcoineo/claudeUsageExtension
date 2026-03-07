chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "fetchUsage") return;

  const match = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]*)/);
  if (!match) {
    sendResponse({ error: "NO_ORG_ID" });
    return true;
  }

  const orgId = match[1];

  fetch(`/api/organizations/${orgId}/usage`, {
    credentials: "include",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    }
  })
    .then(res => {
      if (!res.ok) {
        sendResponse({ error: `API_ERROR_${res.status}` });
        return;
      }
      return res.json();
    })
    .then(data => {
      if (data) sendResponse({ data });
    })
    .catch(() => {
      sendResponse({ error: "API_ERROR_FETCH" });
    });

  return true;
});
