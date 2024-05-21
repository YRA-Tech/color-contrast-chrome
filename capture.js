chrome.runtime.onMessage.addListener((message) => {
  if (message.image) {
    const img = document.getElementById('capturedImage');
    img.src = message.image;
    img.onload = () => {
      document.body.style.justifyContent = 'flex-start';
      document.body.style.alignItems = 'flex-start';
    };
  }
});
