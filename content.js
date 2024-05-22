(() => {
  let startX, startY, endX, endY;
  let selectionBox = null;

  function createSelectionBox() {
    selectionBox = document.createElement('div');
    selectionBox.id = 'selection-box';
    selectionBox.style.position = 'absolute';
    selectionBox.style.border = '2px dashed #000';
    selectionBox.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    document.body.appendChild(selectionBox);
  }

  function updateSelectionBox() {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(startX - endX);
    const height = Math.abs(startY - endY);
    selectionBox.style.left = `${x + window.scrollX}px`;
    selectionBox.style.top = `${y + window.scrollY}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSelection') {
      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousedown', onMouseDown, true);
      sendResponse({ success: true });
    }
  });

  function onMouseDown(event) {
    if (event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    createSelectionBox();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    event.preventDefault();
  }

  function onMouseMove(event) {
    endX = event.clientX;
    endY = event.clientY;
    updateSelectionBox();
    event.preventDefault();
  }

  function onMouseUp(event) {
    endX = event.clientX;
    endY = event.clientY;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);

    if (selectionBox) {
      document.body.removeChild(selectionBox);
      selectionBox = null;
    }

    document.body.style.cursor = 'default';

    chrome.runtime.sendMessage({
      action: 'selectionMade',
      area: {
        x: Math.min(startX, endX) + window.scrollX,
        y: Math.min(startY, endY) + window.scrollY,
        width: Math.abs(startX - endX),
        height: Math.abs(startY - endY),
        devicePixelRatio: window.devicePixelRatio
      }
    });

    document.removeEventListener('mousedown', onMouseDown, true);
    event.preventDefault();
  }
})();
