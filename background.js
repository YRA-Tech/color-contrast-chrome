chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'captureFullScreen') {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing tab:', chrome.runtime.lastError.message);
          return;
        }
  
        chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              chrome.tabs.sendMessage(newTab.id, { image: dataUrl });
              chrome.tabs.onUpdated.removeListener(listener);
            }
          });
        });
      });
    } else if (message.action === 'captureScreen') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }, () => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' });
        });
      });
    } else if (message.action === 'selectionMade') {
      const { x, y, width, height } = message.area;
  
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing tab:', chrome.runtime.lastError.message);
          return;
        }
  
        fetch(dataUrl)
          .then(response => response.blob())
          .then(blob => createImageBitmap(blob))
          .then(imageBitmap => {
            const offscreenCanvas = new OffscreenCanvas(width, height);
            const ctx = offscreenCanvas.getContext('2d');
            ctx.drawImage(imageBitmap, x, y, width, height, 0, 0, width, height);
            return offscreenCanvas.convertToBlob();
          })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const croppedDataUrl = reader.result;
              chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
                chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                  if (tabId === newTab.id && changeInfo.status === 'complete') {
                    chrome.tabs.sendMessage(newTab.id, { image: croppedDataUrl });
                    chrome.tabs.onUpdated.removeListener(listener);
                  }
                });
              });
            };
            reader.readAsDataURL(blob);
          })
          .catch(error => console.error('Error processing image:', error));
      });
    }
  });
  