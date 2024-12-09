// Default settings
const DEFAULT_SETTINGS = {
  wcagLevel: 'WCAG-aa-small',
  pixelRadius: '1'
};

// Keep track of the current settings in memory
let currentSettings = {};

// Save settings to chrome.storage.sync
function saveSettings() {
  const settings = {
    wcagLevel: document.querySelector('input[name="wcagLevel"]:checked').value,
    pixelRadius: document.getElementById('pixelRadius').value
  };

  chrome.storage.sync.set(settings, () => {
    // Show success message
    const status = document.getElementById('status');
    status.classList.add('show');
    
    // Hide message after 2 seconds
    setTimeout(() => {
      status.classList.remove('show');
    }, 2000);

    // Update current settings after successful save
    currentSettings = { ...settings };
  });
}

// Load settings from chrome.storage.sync
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    // Store the loaded settings
    currentSettings = { ...settings };
    
    // Set WCAG level
    const wcagRadio = document.querySelector(`input[value="${settings.wcagLevel}"]`);
    if (wcagRadio) {
      wcagRadio.checked = true;
    }

    // Set pixel radius
    const pixelRadius = document.getElementById('pixelRadius');
    if (pixelRadius) {
      pixelRadius.value = settings.pixelRadius;
    }
  });
}

// Restore the last saved settings
function restoreSettings() {
  const wcagRadio = document.querySelector(`input[value="${currentSettings.wcagLevel}"]`);
  if (wcagRadio) {
    wcagRadio.checked = true;
  }

  const pixelRadius = document.getElementById('pixelRadius');
  if (pixelRadius) {
    pixelRadius.value = currentSettings.pixelRadius;
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);

// Save button click handler
document.getElementById('save').addEventListener('click', () => {
  saveSettings();
});

// Close button click handler
document.getElementById('close').addEventListener('click', () => {
  // Restore the last saved settings before closing
  restoreSettings();
  window.close();
});