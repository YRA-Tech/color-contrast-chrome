document.getElementById('captureFull').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'captureFullScreen', mode: 'full' });
});

document.getElementById('captureArea').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'captureScreen', mode: 'selected' });
});
