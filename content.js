(() => { // Immediately Invoked Function Expression (IIFE) to create a local scope and avoid polluting the global namespace
  let startX, startY, endX, endY; // Variables to store the start and end coordinates of the selection box
  let selectionBox = null; // Variable to store the selection box element

  // Function to create a selection box element and append it to the body
  function createSelectionBox() {
    selectionBox = document.createElement('div'); // Create a new div element
    selectionBox.id = 'selection-box'; // Set the ID of the div for styling or future reference
    selectionBox.style.position = 'absolute'; // Set the position to absolute to control its location on the page
    selectionBox.style.border = '2px dashed #000'; // Set the border style to a dashed black line
    selectionBox.style.backgroundColor = 'rgba(0, 0, 0, 0.1)'; // Set a semi-transparent background color
    selectionBox.style.width = '1px'; // Set the initial width to 1px to make it appear as a point
    selectionBox.style.height = '1px'; // Set the initial height to 1px to make it appear as a point
    document.body.appendChild(selectionBox); // Append the div to the body of the document
  }

  // Function to update the dimensions and position of the selection box based on the mouse coordinates
  function updateSelectionBox() {
    const x = Math.min(startX, endX); // Calculate the left position of the box
    const y = Math.min(startY, endY); // Calculate the top position of the box
    const width = Math.abs(startX - endX); // Calculate the width of the box
    const height = Math.abs(startY - endY); // Calculate the height of the box
    selectionBox.style.left = `${x + window.scrollX}px`; // Set the left position of the box, accounting for page scroll
    console.log("selectionBox.style.left", selectionBox.style.left);
    selectionBox.style.top = `${y + window.scrollY*2}px`; // Set the top position of the box, accounting for page scroll
    selectionBox.style.width = `${width}px`; // Set the width of the box
    selectionBox.style.height = `${height}px`; // Set the height of the box
  }

  // Listener for messages from the Chrome extension
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSelection') { // Check if the message action is 'startSelection'
      document.body.style.cursor = 'crosshair'; // Change the cursor to a crosshair to indicate selection mode
      document.addEventListener('mousedown', onMouseDown, true); // Add mousedown event listener to start selection
      sendResponse({ success: true }); // Send a success response back to the sender
    }
  });

  // Function to handle the mousedown event, initiating the selection
  function onMouseDown(event) {
    if (event.button !== 0) return; // Only proceed if the left mouse button is clicked
    startX = event.clientX; // Record the starting X coordinate
    startY = event.clientY - window.scrollY; // Record the starting Y coordinate
    createSelectionBox(); // Create the selection box element
    document.addEventListener('mousemove', onMouseMove, true); // Add mousemove event listener to update the box
    document.addEventListener('mouseup', onMouseUp, true); // Add mouseup event listener to finish the selection
    event.preventDefault(); // Prevent default action to avoid unwanted behaviors
  }

  // Function to handle the mousemove event, updating the selection box
  function onMouseMove(event) {
    endX = event.clientX; // Update the end X coordinate
    endY = event.clientY; // Update the end Y coordinate
    updateSelectionBox(); // Update the dimensions and position of the selection box
    event.preventDefault(); // Prevent default action to avoid unwanted behaviors
  }

  // Function to handle the mouseup event, finalizing the selection
  function onMouseUp(event) {
    endX = event.clientX ; // Update the end X coordinate
    endY = event.clientY ; // Update the end Y coordinate
    document.removeEventListener('mousemove', onMouseMove, true); // Remove the mousemove event listener
    document.removeEventListener('mouseup', onMouseUp, true); // Remove the mouseup event listener

    if (selectionBox) { // Check if the selection box exists
      document.body.removeChild(selectionBox); // Remove the selection box element from the document
      selectionBox = null; // Reset the selection box variable
    }

    document.body.style.cursor = 'default'; // Reset the cursor to the default style

    // Send a message to the Chrome extension with the selection area details
    chrome.runtime.sendMessage({
      action: 'selectionMade', // Specify the action as 'selectionMade'
      area: {
        x: Math.min(startX, endX) + window.scrollX, // Calculate the left position, accounting for page scroll
        y: Math.min(startY, endY) + window.scrollY, // Calculate the top position, accounting for page scroll
        width: Math.abs(startX - endX), // Calculate the width of the selection area
        height: Math.abs(startY - endY), // Calculate the height of the selection area
        devicePixelRatio: window.devicePixelRatio // Include the device pixel ratio for high-resolution displays
      }
    });

    document.removeEventListener('mousedown', onMouseDown, true); // Remove the mousedown event listener
    event.preventDefault(); // Prevent default action to avoid unwanted behaviors
  }
})();
