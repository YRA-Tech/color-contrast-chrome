(() => {
  let startX, startY, endX, endY;
  let selectionBox = null;
  let instructionBox = null;
  let initialScrollY;
  let isSelecting = false;
  let captureMode = 'hardware';

  function createInstructionBox() {
    instructionBox = document.createElement('div');
    instructionBox.id = 'instruction-box';
    instructionBox.innerHTML = `
      <div class="instruction-content">
        Click and drag to select an area
        <span class="cancel-instruction">Right-click to cancel</span>
      </div>
    `;
    document.body.appendChild(instructionBox);
  }

  function removeInstructionBox() {
    if (instructionBox) {
      document.body.removeChild(instructionBox);
      instructionBox = null;
    }
  }

  function createSelectionBox() {
    selectionBox = document.createElement('div');
    selectionBox.id = 'selection-box';
    selectionBox.style.position = 'fixed';
    selectionBox.style.border = '2px dashed #000';
    selectionBox.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    selectionBox.style.width = '1px';
    selectionBox.style.height = '1px';
    selectionBox.style.pointerEvents = 'none';
    document.body.appendChild(selectionBox);
  }

  function cleanupSelection() {
    if (selectionBox) {
      document.body.removeChild(selectionBox);
      selectionBox = null;
    }
    removeInstructionBox();
    document.body.style.cursor = 'default';
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    isSelecting = false;
  }

  function updateSelectionBox() {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(startX - endX);
    const height = Math.abs(startY - endY);
    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  }

  function onContextMenu(event) {
    if (isSelecting) {
      event.preventDefault();
      cleanupSelection();
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSelection') {
      isSelecting = true;
      captureMode = message.captureMode || 'hardware';
      document.body.style.cursor = 'crosshair';
      createInstructionBox();
      document.addEventListener('mousedown', onMouseDown, true);
      document.addEventListener('contextmenu', onContextMenu, true);
      sendResponse({ success: true });
    }
  });

  function onMouseDown(event) {
    if (event.button !== 0) return;
    initialScrollY = window.scrollY;
    startX = event.clientX;
    startY = event.clientY;
    const pageStartX = event.pageX;
    const pageStartY = event.pageY;
    
    createSelectionBox();
    removeInstructionBox();
    
    function onMouseMove(event) {
      endX = event.clientX;
      endY = event.clientY;
      updateSelectionBox();
      event.preventDefault();
    }
    
    function onMouseUp(event) {
      const pageEndX = event.pageX;
      const pageEndY = event.pageY;
      
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      
      cleanupSelection();
      
      const x = Math.min(pageStartX, pageEndX);
      const y = Math.min(pageStartY, pageEndY);
      const width = Math.abs(pageEndX - pageStartX);
      const height = Math.abs(pageEndY - pageStartY);
      
      chrome.runtime.sendMessage({
        action: 'selectionMade',
        area: {
          x: x - window.scrollX,
          y: y - window.scrollY,
          width: width,
          height: height,
          devicePixelRatio: window.devicePixelRatio,
          mode: 'selected'
        },
        captureMode: captureMode
      });
      
      event.preventDefault();
    }
    
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    event.preventDefault();
  }
})();