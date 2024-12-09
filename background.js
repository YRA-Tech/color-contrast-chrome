function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function captureTab(callback) {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error('Error capturing tab:', chrome.runtime.lastError.message);
      return;
    }
    callback(dataUrl);
  });
}

async function captureWholePage(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    if (!tabs[0]?.id) {
      console.error('No active tab found');
      return;
    }

    try {
      // Get device pixel ratio first
      const devicePixelRatio = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => window.devicePixelRatio || 1
      }).then(results => results[0].result);

      // Save original scroll position and styles
      const initialState = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => ({
          scrollY: window.scrollY,
          scrollbarStyle: document.documentElement.style.scrollbarWidth || '',
          originalOverflow: document.documentElement.style.overflow || ''
        })
      }).then(results => results[0].result);

      // Hide scrollbars
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          document.documentElement.style.scrollbarWidth = 'none';
          document.documentElement.style.overflow = 'scroll';
          return true;
        }
      });

      // Get page dimensions (CSS pixels)
      const dimensions = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => ({
          width: Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth),
          height: Math.max(document.documentElement.scrollHeight, document.documentElement.clientHeight),
          viewportHeight: window.innerHeight
        })
      }).then(results => results[0].result);

      console.log('Page dimensions (CSS pixels):', dimensions);

      // Create canvas for final image
      const canvas = new OffscreenCanvas(
        dimensions.width * devicePixelRatio,
        dimensions.height * devicePixelRatio
      );
      const ctx = canvas.getContext('2d');

      async function captureSection(scrollY) {
        try {
          const maxScroll = dimensions.height - dimensions.viewportHeight;
          const actualScrollY = Math.min(scrollY, maxScroll);

          // Scroll to the target position
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (y) => {
              window.scrollTo(0, y);
              return window.scrollY;
            },
            args: [actualScrollY]
          });

          // Allow time for scroll rendering
          await delay(1000);

          // Capture visible section
          const dataUrl = await new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(`Capture error: ${chrome.runtime.lastError.message}`));
              } else {
                resolve(result);
              }
            });
          });

          // Process the captured section
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);

          // Draw the section onto the canvas at the correct position
          ctx.drawImage(
            bitmap,
            0,
            0,
            bitmap.width,
            bitmap.height,
            0,
            actualScrollY * devicePixelRatio,
            dimensions.width * devicePixelRatio,
            dimensions.viewportHeight * devicePixelRatio
          );

          console.log(`Captured section at scrollY: ${actualScrollY}`);
        } catch (err) {
          console.error('Error in captureSection:', err.message);
          throw err;
        }
      }

      // Capture all sections
      let currentScrollY = 0;
      while (currentScrollY < dimensions.height) {
        console.log(`Capturing section ${currentScrollY}/${dimensions.height}`);
        await captureSection(currentScrollY);
        currentScrollY += dimensions.viewportHeight;
        await delay(500);
      }

      console.log('All sections captured.');

      // Restore page state
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (state) => {
          document.documentElement.style.scrollbarWidth = state.scrollbarStyle;
          document.documentElement.style.overflow = state.originalOverflow;
          window.scrollTo(0, state.scrollY);
        },
        args: [initialState]
      });

      // Create final scaled canvas
      const finalCanvas = new OffscreenCanvas(
        dimensions.width,
        dimensions.height
      );
      const finalCtx = finalCanvas.getContext('2d');
      
      // Scale down to CSS pixels
      finalCtx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
      finalCtx.drawImage(canvas, 0, 0);

      // Convert to blob and return
      finalCanvas.convertToBlob().then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => callback(reader.result);
        reader.readAsDataURL(blob);
      });

    } catch (error) {
      console.error('Capture failed:', error);
      callback(null);
    }
  });
}

async function captureDesktop(devicePixelRatio, sendResponse) {
  console.log('[Background] Starting desktop capture');
  
  try {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (!activeTab?.id) {
      console.error('[Background] No active tab found');
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    console.log('[Background] Requesting desktop media access');
    
    // Request desktop capture
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window'], 
      activeTab, 
      async (streamId) => {
        if (!streamId) {
          console.error('[Background] No stream ID received');
          sendResponse({ success: false, error: 'No stream selected' });
          return;
        }

        console.log('[Background] Got stream ID, injecting capture script');

        try {
          // Execute capture in the current tab
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            function: async (streamId) => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  audio: false,
                  video: {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      chromeMediaSourceId: streamId
                    }
                  }
                });

                const video = document.createElement('video');
                video.style.position = 'fixed';
                video.style.top = '-9999px';
                document.body.appendChild(video);
                video.srcObject = stream;
                
                await new Promise((resolve) => {
                  video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                  };
                });

                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);

                // Cleanup
                stream.getTracks().forEach(track => track.stop());
                video.srcObject = null;
                video.remove();
                
                const dataUrl = canvas.toDataURL('image/png');
                canvas.remove();

                return dataUrl;
              } catch (error) {
                console.error('Capture error:', error);
                return null;
              }
            },
            args: [streamId]
          });

          if (results?.[0]?.result) {
            chrome.tabs.create({ 
              url: chrome.runtime.getURL('capture.html') 
            }, (newTab) => {
              const listener = (tabId, changeInfo) => {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                  chrome.tabs.sendMessage(newTab.id, {
                    image: results[0].result,
                    mode: 'desktop',
                    devicePixelRatio: devicePixelRatio
                  });
                  chrome.tabs.onUpdated.removeListener(listener);
                }
              };
              chrome.tabs.onUpdated.addListener(listener);
            });

            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Failed to capture screen' });
          }

        } catch (error) {
          console.error('[Background] Capture error:', error);
          sendResponse({ success: false, error: error.message });
        }
      }
    );

    return true;
  } catch (error) {
    console.error('[Background] Desktop capture error:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
}

const debouncedCaptureTab = debounce(captureTab, 500);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {   
  if (message.action === 'captureWholePage') {
    console.log('Starting whole page capture...');
    captureWholePage((dataUrl) => {
      if (!dataUrl) {
        console.error('Failed to capture page - no data URL returned');
        return;
      }
      
      chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => window.devicePixelRatio || 1
        });
        const devicePixelRatio = results[0].result;
        
        chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              console.log('New tab ready, sending captured image...');
              chrome.tabs.sendMessage(newTab.id, { 
                image: dataUrl, 
                mode: 'whole',
                devicePixelRatio: devicePixelRatio
              });
              chrome.tabs.onUpdated.removeListener(listener);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      });
    });
  }
  else if (message.action === 'captureFullScreen') {
    debouncedCaptureTab((dataUrl) => {
      chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.sendMessage(newTab.id, { 
              image: dataUrl, 
              devicePixelRatio: message.devicePixelRatio, 
              mode: message.mode 
            });
            chrome.tabs.onUpdated.removeListener(listener);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  } 
  else if (message.action === 'captureScreen') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error executing script:', chrome.runtime.lastError.message);
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'startSelection', 
          mode: message.mode 
        }, (response) => {
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
  } 
  else if (message.action === 'selectionMade') {
    const { x, y, width, height, devicePixelRatio, mode } = message.area;

    debouncedCaptureTab((dataUrl) => {
      fetch(dataUrl)
        .then(response => response.blob())
        .then(blob => createImageBitmap(blob))
        .then(imageBitmap => {
          // Create canvas with device pixel ratio considered
          const offscreenCanvas = new OffscreenCanvas(
            imageBitmap.width,
            imageBitmap.height
          );
          const ctx = offscreenCanvas.getContext('2d', { 
            willReadFrequently: true 
          });
          
          // Draw original image
          ctx.drawImage(imageBitmap, 0, 0);
          
          // Crop with device pixel ratio considered
          const croppedImage = ctx.getImageData(
            x * devicePixelRatio,
            y * devicePixelRatio,
            width * devicePixelRatio,
            height * devicePixelRatio
          );
          
          // Create canvas for cropped image
          const croppedCanvas = new OffscreenCanvas(
            width,
            height
          );
          const croppedCtx = croppedCanvas.getContext('2d');
          
          // Scale back to CSS pixels
          croppedCtx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
          
          // Create temporary canvas for scaling
          const tempCanvas = new OffscreenCanvas(
            width * devicePixelRatio,
            height * devicePixelRatio
          );
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.putImageData(croppedImage, 0, 0);
          
          // Draw scaled version
          croppedCtx.drawImage(tempCanvas, 0, 0);
          
          return croppedCanvas.convertToBlob();
        })
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const croppedDataUrl = reader.result;
            chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') }, (newTab) => {
              const listener = (tabId, changeInfo) => {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                  chrome.tabs.sendMessage(newTab.id, { 
                    image: croppedDataUrl, 
                    mode: mode 
                  });
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
  else if (message.action === 'captureDesktop') {
    captureDesktop(message.devicePixelRatio, sendResponse);
    return true;
  }
});

