// Default settings
const DEFAULT_SETTINGS = {
  wcagLevel: 'WCAG-aa-small',
  pixelRadius: '3',
  useWebGL: true
};

// Keep track of the current settings in memory
let currentSettings = {};

// Save settings to chrome.storage.sync
function saveSettings() {
  const settings = {
    wcagLevel: document.querySelector('input[name="wcagLevel"]:checked').value,
    pixelRadius: document.getElementById('pixelRadius').value,
    useWebGL: document.getElementById('useWebGL').checked
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

    // Set WebGL preference
    const useWebGL = document.getElementById('useWebGL');
    if (useWebGL) {
      useWebGL.checked = settings.useWebGL;
    }

    // Check WebGL availability and update status
    checkWebGLAvailability();
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

  const useWebGL = document.getElementById('useWebGL');
  if (useWebGL) {
    useWebGL.checked = currentSettings.useWebGL;
  }
}

// Check WebGL availability and update UI
function checkWebGLAvailability() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const webglStatus = document.getElementById('webglStatus');
  const useWebGLCheckbox = document.getElementById('useWebGL');
  
  if (gl) {
    webglStatus.textContent = '✓ WebGL2/WebGL available - GPU acceleration supported';
    webglStatus.className = 'webgl-status available';
    useWebGLCheckbox.disabled = false;
  } else {
    webglStatus.textContent = '✗ WebGL not available - CPU processing only';
    webglStatus.className = 'webgl-status unavailable';
    useWebGLCheckbox.disabled = true;
    useWebGLCheckbox.checked = false;
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