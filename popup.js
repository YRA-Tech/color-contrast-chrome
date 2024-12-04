// List of special page patterns that shouldn't allow capture
const SPECIAL_PAGES = [
  'chrome://*',
  'chrome-extension://*',
  'edge://*',
  'about:*',
  'file://*',
  'view-source:*'
];

// Helper function to check if current URL matches special page patterns
function isSpecialPage(url) {
  return SPECIAL_PAGES.some(pattern => {
    const regexPattern = pattern.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(url);
  });
}

// Function to show/hide warning message
function toggleWarningMessage(show) {
  let warningEl = document.getElementById('specialPageWarning');
  
  if (!warningEl && show) {
    warningEl = document.createElement('div');
    warningEl.id = 'specialPageWarning';
    warningEl.style.backgroundColor = '#fff3cd';
    warningEl.style.color = '#856404';
    warningEl.style.padding = '10px';
    warningEl.style.margin = '10px';
    warningEl.style.borderRadius = '4px';
    warningEl.style.fontSize = '14px';
    warningEl.style.textAlign = 'center';
    warningEl.innerText = 'This is a special page. Unable to perform screen capture actions on this page.';
    
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
    if (tabs[0] && isSpecialPage(tabs[0].url)) {
      toggleWarningMessage(true);
      toggleCaptureButtons(true);
    }
  });
});

// Event listeners for capture buttons
document.getElementById('captureFull').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!isSpecialPage(tabs[0].url)) {
      chrome.runtime.sendMessage({ action: 'captureFullScreen', mode: 'full' });
    }
  });
});

document.getElementById('captureArea').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!isSpecialPage(tabs[0].url)) {
      chrome.runtime.sendMessage({ action: 'captureScreen', mode: 'selected' });
    }
  });
});

document.getElementById('captureWhole').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!isSpecialPage(tabs[0].url)) {
      chrome.runtime.sendMessage({ 
        action: 'captureWholePage', 
        mode: 'whole',
        devicePixelRatio: window.devicePixelRatio 
      });
    }
  });
});