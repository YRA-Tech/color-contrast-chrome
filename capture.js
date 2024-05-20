chrome.runtime.onMessage.addListener((message) => {
  if (message.image) {
    document.getElementById('capturedImage').src = message.image;
  }
});
