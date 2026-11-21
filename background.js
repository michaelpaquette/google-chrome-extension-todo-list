// Clicking the toolbar icon opens the todo page in a new tab.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
});

// Right-click menu on the toolbar icon.
// Chrome doesn't let an extension switch itself off without the broad
// "management" permission, so this opens summit's own page in
// chrome://extensions, where the on/off toggle is one click away.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'disable-summit',
    title: 'Disable summit (use another new tab)…',
    contexts: ['action'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'disable-summit') {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  }
});
