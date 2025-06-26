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
        func: () => {
          const docElement = document.documentElement;
          const body = document.body;
          
          // Scroll to bottom first to ensure all lazy content is loaded
          const originalScrollY = window.scrollY;
          window.scrollTo(0, document.body.scrollHeight);
          document.body.offsetHeight; // Force reflow
          
          // Get all possible height measurements after scrolling to bottom
          const scrollHeight = Math.max(
            docElement.scrollHeight,
            body.scrollHeight
          );
          const clientHeight = Math.max(
            docElement.clientHeight,
            body.clientHeight
          );
          const offsetHeight = Math.max(
            docElement.offsetHeight,
            body.offsetHeight
          );
          
          const scrollWidth = Math.max(
            docElement.scrollWidth,
            body.scrollWidth
          );
          const clientWidth = Math.max(
            docElement.clientWidth,
            body.clientWidth
          );
          
          const totalHeight = Math.max(scrollHeight, clientHeight, offsetHeight);
          const totalWidth = Math.max(scrollWidth, clientWidth);
          const maxScrollY = Math.max(0, totalHeight - window.innerHeight);
          
          // Restore original scroll position
          window.scrollTo(0, originalScrollY);
          
          // Find fixed/sticky elements that might cause duplication
          const fixedElements = [];
          const allElements = document.querySelectorAll('*');
          for (let el of allElements) {
            const style = getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky') {
              fixedElements.push({
                selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : ''),
                position: style.position,
                top: style.top,
                zIndex: style.zIndex
              });
            }
          }
          
          return {
            width: totalWidth,
            height: totalHeight,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            scrollHeight: scrollHeight,
            clientHeight: clientHeight,
            offsetHeight: offsetHeight,
            maxScrollY: maxScrollY,
            fixedElements: fixedElements
          };
        }
      }).then(results => results[0].result);

      console.log('=== WHOLE PAGE CAPTURE DEBUG ===');
      console.log('Page dimensions (CSS pixels):', dimensions);
      console.log('Max scroll Y:', dimensions.maxScrollY);
      console.log('Sections needed:', Math.ceil(dimensions.height / dimensions.viewportHeight));
      console.log('Fixed/sticky elements found:', dimensions.fixedElements);
      console.log('=================================');

      // Create canvas for final image
      const canvas = new OffscreenCanvas(
        dimensions.width * devicePixelRatio,
        dimensions.height * devicePixelRatio
      );
      const ctx = canvas.getContext('2d');

      async function captureSection(scrollY, isFirstSection = false) {
        try {
          const actualScrollY = Math.min(scrollY, dimensions.maxScrollY);

          console.log(`Scrolling to Y: ${actualScrollY} (requested: ${scrollY}, max: ${dimensions.maxScrollY})`);

          // First, scroll to the position with multiple attempts
          const scrollResult = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (y, hideFixed, fixedElements) => {
              console.log(`[Page Script] Scrolling to Y: ${y}, hideFixed: ${hideFixed}`);
              
              // Multiple scroll attempts to ensure it takes effect
              for (let attempt = 0; attempt < 5; attempt++) {
                window.scrollTo(0, y);
                document.documentElement.scrollTop = y;
                document.body.scrollTop = y;
                
                // Force layout recalculation
                document.body.offsetHeight;
                document.documentElement.offsetHeight;
                
                // Check if scroll worked
                if (Math.abs(window.scrollY - y) < 5) break;
              }
              
              // Wait a bit more for scroll to settle
              const startTime = Date.now();
              while (Date.now() - startTime < 100) {
                // Busy wait for 100ms
              }
              
              // Hide fixed/sticky elements after scrolling (except for first section)
              const hiddenElements = [];
              if (hideFixed && fixedElements && fixedElements.length > 0) {
                fixedElements.forEach(elem => {
                  try {
                    const elements = document.querySelectorAll(elem.selector);
                    elements.forEach(el => {
                      const style = getComputedStyle(el);
                      if (style.position === 'fixed' || style.position === 'sticky') {
                        hiddenElements.push({ element: el, originalDisplay: el.style.display });
                        el.style.display = 'none';
                      }
                    });
                  } catch (e) {
                    console.warn('Error hiding element:', elem.selector, e);
                  }
                });
              }
              
              const result = {
                requestedY: y,
                actualY: window.scrollY,
                scrollTop: document.documentElement.scrollTop,
                bodyScrollTop: document.body.scrollTop,
                scrollDiff: Math.abs(window.scrollY - y),
                maxScrollY: Math.max(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight),
                hiddenCount: hiddenElements.length,
                pageHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
                viewportHeight: window.innerHeight
              };
              
              console.log(`[Page Script] Scroll result:`, result);
              return result;
            },
            args: [actualScrollY, !isFirstSection, dimensions.fixedElements]
          });

          console.log('Scroll result:', scrollResult[0].result);

          // Wait for scroll to be verified before proceeding
          const scrollDiff = scrollResult[0].result.scrollDiff;
          if (scrollDiff > 10) {
            console.warn(`Scroll not accurate (diff: ${scrollDiff}px), retrying...`);
            await delay(1000);
          }
          
          // Allow extra time for scroll rendering, lazy loading, and animations
          await delay(2500);

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

          // Calculate the destination Y position on the canvas
          const destY = actualScrollY * devicePixelRatio;
          const destHeight = Math.min(
            dimensions.viewportHeight * devicePixelRatio,
            (dimensions.height - actualScrollY) * devicePixelRatio
          );

          console.log(`Drawing section at Y: ${actualScrollY} -> canvas Y: ${destY}, height: ${destHeight}`);
          console.log(`Bitmap size: ${bitmap.width} x ${bitmap.height}`);
          
          // Log basic section info
          console.log(`Processing section at scroll ${actualScrollY}`);

          // Draw the section onto the canvas at the correct position
          ctx.drawImage(
            bitmap,
            0,
            0,
            bitmap.width,
            bitmap.height,
            0,
            destY,
            dimensions.width * devicePixelRatio,
            destHeight
          );

          console.log(`Captured and drawn section at scrollY: ${actualScrollY}`);
          
          // Restore fixed elements after capture (except for first section)
          if (!isFirstSection) {
            await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: (fixedElements) => {
                fixedElements.forEach(elem => {
                  const elements = document.querySelectorAll(elem.selector);
                  elements.forEach(el => {
                    if (el.style.display === 'none') {
                      el.style.display = '';
                    }
                  });
                });
              },
              args: [dimensions.fixedElements]
            });
          }
          
        } catch (err) {
          console.error('Error in captureSection:', err.message);
          throw err;
        }
      }

      // Capture all sections
      let currentScrollY = 0;
      let sectionCount = 0;
      const totalSections = Math.ceil((dimensions.maxScrollY + dimensions.viewportHeight) / dimensions.viewportHeight);
      
      // Always capture the first section (with headers/fixed elements)
      sectionCount++;
      console.log(`Capturing section ${sectionCount}/${totalSections} at scrollY: ${currentScrollY}/${dimensions.maxScrollY} (FIRST SECTION - includes headers)`);
      await captureSection(currentScrollY, true);
      
      // Move to next section
      currentScrollY += dimensions.viewportHeight;
      
      // Capture remaining sections (hiding fixed elements)
      while (currentScrollY <= dimensions.maxScrollY) {
        sectionCount++;
        console.log(`Capturing section ${sectionCount}/${totalSections} at scrollY: ${currentScrollY}/${dimensions.maxScrollY} (hiding fixed elements)`);
        await captureSection(currentScrollY, false);
        
        // Reduce overlap by using 95% of viewport height
        currentScrollY += Math.floor(dimensions.viewportHeight * 0.95);
        await delay(1000);
      }
      
      // Ensure we capture the very bottom if we haven't reached it
      if (currentScrollY - dimensions.viewportHeight < dimensions.maxScrollY) {
        sectionCount++;
        console.log(`Capturing final section ${sectionCount} at maximum scroll: ${dimensions.maxScrollY} (hiding fixed elements)`);
        await captureSection(dimensions.maxScrollY, false);
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
      
      console.log('=== FINAL CANVAS COMPOSITION ===');
      console.log('Source canvas size:', canvas.width, 'x', canvas.height);
      console.log('Final canvas size:', finalCanvas.width, 'x', finalCanvas.height);
      console.log('Device pixel ratio:', devicePixelRatio);
      
      // Scale down to CSS pixels
      finalCtx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
      finalCtx.drawImage(canvas, 0, 0);
      
      console.log('Final canvas created and ready for analysis');

      // Convert final scaled canvas to blob and return
      console.log('Converting final canvas for analysis...');
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

        console.log('[Background] Got stream ID, waiting for permission dialog to disappear...');

        // Wait for permission dialog to disappear before capturing
        await delay(1500);

        try {
          console.log('[Background] Starting desktop capture after dialog delay');
          // Execute capture in the current tab
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            function: async (streamId) => {
              try {
                console.log('[Content Script] Setting up desktop capture stream');
                
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

                // Additional delay to ensure all permission dialogs and UI elements are gone
                console.log('[Content Script] Waiting additional time for UI to clear...');
                await new Promise(resolve => setTimeout(resolve, 1000));

                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                console.log('[Content Script] Capturing desktop at resolution:', video.videoWidth, 'x', video.videoHeight);
                
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

