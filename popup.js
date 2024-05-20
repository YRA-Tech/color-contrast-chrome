document.getElementById('captureFull').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'captureFullScreen' });
});

document.getElementById('captureArea').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'captureScreen' });
});
