function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function captureTab(callback) {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error('Error capturing tab:', chrome.runtime.lastError.message);
      return;
    }
    callback(dataUrl);
  });
}

const debouncedCaptureTab = debounce(captureTab, 500);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureFullScreen') {
    debouncedCaptureTab((dataUrl) => {
      chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.sendMessage(newTab.id, { image: dataUrl, devicePixelRatio: message.devicePixelRatio });
            chrome.tabs.onUpdated.removeListener(listener);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  } else if (message.action === 'captureScreen') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error executing script:', chrome.runtime.lastError.message);
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to tab:', chrome.runtime.lastError.message);
          } else if (response && response.error) {
            console.error('Error from content script:', response.error);
          } else {
            console.log('Message sent successfully:', response);
          }
        });
      });
    });
  } else if (message.action === 'selectionMade') {
    const { x, y, width, height, devicePixelRatio } = message.area;

    debouncedCaptureTab((dataUrl) => {
      fetch(dataUrl)
        .then(response => response.blob())
        .then(blob => createImageBitmap(blob))
        .then(imageBitmap => {
          const offscreenCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
          const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(imageBitmap, 0, 0);
          const croppedImage = ctx.getImageData(x * devicePixelRatio, y * devicePixelRatio, width * devicePixelRatio, height * devicePixelRatio);
          const croppedCanvas = new OffscreenCanvas(width * devicePixelRatio, height* devicePixelRatio);
          const croppedCtx = croppedCanvas.getContext('2d');
          croppedCtx.putImageData(croppedImage, 0, 0);
          return croppedCanvas.convertToBlob();
        })
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const croppedDataUrl = reader.result;
            chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
              const listener = (tabId, changeInfo) => {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                  chrome.tabs.sendMessage(newTab.id, { image: croppedDataUrl });
                  chrome.tabs.onUpdated.removeListener(listener);
                }
              };
              chrome.tabs.onUpdated.addListener(listener);
            });
          };
          reader.readAsDataURL(blob);
        })
        .catch(error => console.error('Error processing image:', error));
    });
  }
});