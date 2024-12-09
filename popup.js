// Debug logging setup
const DEBUG = true;
function log(message) {
  if (DEBUG) console.log(`[Popup] ${message}`);
}

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

function handleButtonFeedback(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.style.opacity = '0.7';
    setTimeout(() => button.style.opacity = '1', 200);
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
    'captureWhole',
    'captureDesktop'  // Add desktop capture button to the list
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

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.backgroundColor = '#ffebee';
  errorDiv.style.color = '#c62828';
  errorDiv.style.padding = '10px';
  errorDiv.style.margin = '10px';
  errorDiv.style.borderRadius = '4px';
  errorDiv.style.fontSize = '14px';
  errorDiv.textContent = message;
  
  const container = document.querySelector('.container');
  container.insertBefore(errorDiv, container.firstChild);
  
  setTimeout(() => errorDiv.remove(), 3000);
}

// Check current tab when popup opens
document.addEventListener('DOMContentLoaded', () => {
  log('Popup loaded');
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
  log('Full capture button clicked');
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
  log('Area capture button clicked');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && !isSpecialPage(tabs[0].url) && !isRestrictedDomain(tabs[0].url)) {
      chrome.runtime.sendMessage({ action: 'captureScreen', mode: 'selected' });
    }
  });
});

document.getElementById('captureWhole').addEventListener('click', () => {
  log('Whole page capture button clicked');
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

document.getElementById('captureDesktop').addEventListener('click', () => {
  log('Desktop capture button clicked');
  
  const button = document.getElementById('captureDesktop');
  button.style.opacity = '0.7';
  setTimeout(() => button.style.opacity = '1', 200);

  // Get devicePixelRatio from the popup window context
  const ratio = window.devicePixelRatio || 1;

  chrome.runtime.sendMessage({ 
    action: 'captureDesktop',
    mode: 'desktop',
    devicePixelRatio: ratio
  }, (response) => {
    log(`Received response from background: ${JSON.stringify(response)}`);
    if (chrome.runtime.lastError) {
      log(`Error: ${chrome.runtime.lastError.message}`);
      showError(chrome.runtime.lastError.message);
    } else if (response && !response.success) {
      showError(response.error || 'Failed to capture desktop');
    }
  });
});

document.getElementById('openOptions').addEventListener('click', () => {
  log('Options button clicked');
  handleButtonFeedback('openOptions');
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  log(`Received message: ${JSON.stringify(message)}`);
  if (message.action === 'captureError') {
    showError(message.error);
  }
});