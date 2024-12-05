// List of special page patterns that shouldn't allow capture
const SPECIAL_PAGES = [
  'chrome://*',
  'chrome-extension://*',
  'edge://*',
  'about:*',
  'file://*',
  'view-source:*'
];

// Additional restricted domains (especially for Google domains)
const RESTRICTED_DOMAINS = [
  'accounts.google.com',
  'www.google.com',
  'google.com'
];

// Helper function to check if current URL matches special page patterns
function isSpecialPage(url) {
  return SPECIAL_PAGES.some(pattern => {
    const regexPattern = pattern.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(url);
  });
}

// Helper function to check if URL is in restricted domains
function isRestrictedDomain(url) {
  try {
    const urlObj = new URL(url);
    return RESTRICTED_DOMAINS.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch (e) {
    console.error('Invalid URL:', e);
    return false;
  }
}

// Function to show/hide warning message
function toggleWarningMessage(show, isRestricted = false) {
  let warningEl = document.getElementById('pageWarning');
  
  if (!warningEl && show) {
    warningEl = document.createElement('div');
    warningEl.id = 'pageWarning';
    warningEl.style.backgroundColor = '#fff3cd';
    warningEl.style.color = '#856404';
    warningEl.style.padding = '10px';
    warningEl.style.margin = '10px';
    warningEl.style.borderRadius = '4px';
    warningEl.style.fontSize = '14px';
    warningEl.style.textAlign = 'center';
    
    warningEl.innerText = isRestricted ? 
      'This page has security restrictions that prevent screen capture.' :
      'This is a special page. Unable to perform screen capture actions on this page.';
    
    // Insert warning at the top of the popup
    document.querySelector('.container').insertBefore(
      warningEl, 
      document.querySelector('.container').firstChild
    );
  } else if (warningEl && !show) {
    warningEl.remove();
  }
}

// Function to disable/enable capture buttons
function toggleCaptureButtons(disable) {
  const buttons = [
    'captureFull',
    'captureArea',
    'captureWhole'
  ];
  
  buttons.forEach(id => {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = disable;
      if (disable) {
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      } else {
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      }
    }
  });
}

// Check current tab when popup opens
document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const url = tabs[0].url;
      const isSpecial = isSpecialPage(url);
      const isRestricted = isRestrictedDomain(url);
      
      if (isSpecial || isRestricted) {
        toggleWarningMessage(true, isRestricted);
        toggleCaptureButtons(true);
      }
    }
  });
});

// Event listeners for capture buttons
document.getElementById('captureFull').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && !isSpecialPage(tabs[0].url) && !isRestrictedDomain(tabs[0].url)) {
      chrome.runtime.sendMessage({ 
        action: 'captureFullScreen', 
        mode: 'full',
        devicePixelRatio: window.devicePixelRatio 
      });
    }
  });
});

document.getElementById('captureArea').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && !isSpecialPage(tabs[0].url) && !isRestrictedDomain(tabs[0].url)) {
      chrome.runtime.sendMessage({ action: 'captureScreen', mode: 'selected' });
    }
  });
});

document.getElementById('captureWhole').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && !isSpecialPage(tabs[0].url) && !isRestrictedDomain(tabs[0].url)) {
      chrome.runtime.sendMessage({ 
        action: 'captureWholePage', 
        mode: 'whole',
        devicePixelRatio: window.devicePixelRatio 
      });
    }
  });
});