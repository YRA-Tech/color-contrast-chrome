chrome.runtime.onMessage.addListener((message) => {
  if (message.image) {
    const img = document.getElementById('capturedImage');
    const canvas = document.getElementById('analysisCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const devicePixelRatio = message.devicePixelRatio || 1;

    img.src = message.image;
    img.onload = () => {
      // Calculate the visible area excluding the scrollbar
      const visibleWidth = window.innerWidth;
      const visibleHeight = window.innerHeight;

      // Adjust the canvas size to exclude the scrollbar
      const scaledWidth = visibleWidth * devicePixelRatio; // Scaled width considering device pixel ratio
      const scaledHeight = visibleHeight * devicePixelRatio; // Scaled height considering device pixel ratio

      canvas.width = visibleWidth; // Set canvas width to the visible width
      canvas.height = visibleHeight; // Set canvas height to the visible height

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight, 0, 0, visibleWidth, visibleHeight);

      // Run color contrast analysis after image is loaded
      runColorContrastAnalysis(ctx, visibleWidth, visibleHeight);

      // Merge the image with the overlay
      const mergedCanvas = document.createElement('canvas');
      const mergedCtx = mergedCanvas.getContext('2d');
      mergedCanvas.width = visibleWidth; // Set merged canvas width to the visible width
      mergedCanvas.height = visibleHeight; // Set merged canvas height to the visible height
      mergedCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight, 0, 0, visibleWidth, visibleHeight);
      mergedCtx.drawImage(canvas, 0, 0, visibleWidth, visibleHeight);

      // Replace the canvas with the merged image
      const mergedImageUrl = mergedCanvas.toDataURL('image/png');
      const mergedImg = new Image();
      mergedImg.src = mergedImageUrl;
      mergedImg.onload = () => {
        canvas.width = mergedImg.width; // Set canvas width to merged image width
        canvas.height = mergedImg.height; // Set canvas height to merged image height
        ctx.drawImage(mergedImg, 0, 0);
      };
    };
  }
});

document.getElementById('maskButton').addEventListener('click', () => {
  const canvas = document.getElementById('analysisCanvas');
  if (canvas.style.display === 'none') {
    canvas.style.display = 'block';
    document.getElementById('maskButton').innerText = 'Hide Mask';
  } else {
    canvas.style.display = 'none';
    document.getElementById('maskButton').innerText = 'Show Mask';
  }
});

document.getElementById('rescanButton').addEventListener('click', () => {
  const canvas = document.getElementById('analysisCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(document.getElementById('capturedImage'), 0, 0, canvas.width, canvas.height);

  // Run color contrast analysis with new parameters
  runColorContrastAnalysis(ctx, canvas.width, canvas.height);
});

function runColorContrastAnalysis(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height); // Get image data for the entire canvas
  const data = imageData.data;

  // Get selected WCAG level and pixel radius
  const contrastLevel = document.getElementById('levelEvaluated-options').value;
  const pixelRadius = parseInt(document.getElementById('pixelRadius-options').value, 10);

  // Perform the color contrast analysis here using the evaluateColorContrast function
  // and any other necessary functions
  const results = performAnalysis(data, width, height, contrastLevel, pixelRadius);

  // Apply greying effect
  applyGreyingEffect(ctx, width, height);

  // Display or use the results
  updateCanvasWithResults(ctx, results, width, height);
}

function performAnalysis(data, width, height, contrastLevel, pixelRadius) {
  const results = new Uint8Array(data.length);

  for (let y = 0; y < height; y++) { // Iterate over each pixel row
    for (let x = 0; x < width; x++) { // Iterate over each pixel column
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      // Perform contrast check with neighboring pixels within the radius
      let contrast = false;
      for (let dy = -pixelRadius; dy <= pixelRadius; dy++) { // Iterate over neighboring rows within radius
        for (let dx = -pixelRadius; dx <= pixelRadius; dx++) { // Iterate over neighboring columns within radius
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) { // Ensure neighboring pixel is within bounds
            const nIndex = (ny * width + nx) * 4;
            const nr = data[nIndex];
            const ng = data[nIndex + 1];
            const nb = data[nIndex + 2];
            contrast = evaluateColorContrast(r, g, b, nr, ng, nb, contrastLevel);
            if (contrast) break;
          }
        }
        if (contrast) break;
      }

      if (contrast) {
        results[index] = 255; // White for high contrast
        results[index + 1] = 255;
        results[index + 2] = 255;
        results[index + 3] = 255;
      } else {
        results[index] = 0; // Transparent for low contrast
        results[index + 1] = 0;
        results[index + 2] = 0;
        results[index + 3] = 128; // Semi-transparent to apply greying effect
      }
    }
  }

  return results;
}

function applyGreyingEffect(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height); // Get image data for the entire canvas
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Apply a greying effect to the non-contrast areas
    if (data[i + 3] === 128) {
      data[i] = data[i] * 0.5; // Reduce red channel
      data[i + 1] = data[i + 1] * 0.5; // Reduce green channel
      data[i + 2] = data[i + 2] * 0.5; // Reduce blue channel
      data[i + 3] = 128; // Adjust alpha to be semi-transparent
    }
  }

  ctx.putImageData(imageData, 0, 0); // Put the modified image data back on the canvas
}

function updateCanvasWithResults(ctx, results, width, height) {
  const imageData = ctx.createImageData(width, height); // Create a new image data object
  imageData.data.set(results); // Set the results data
  ctx.putImageData(imageData, 0, 0); // Put the results image data back on the canvas
}

function evaluateColorContrast(r1, g1, b1, r2, g2, b2, contrastLevel) {
  const luminance = (r, g, b) => {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  };

  const L1 = luminance(r1, g1, b1) + 0.05;
  const L2 = luminance(r2, g2, b2) + 0.05;
  const ratio = L1 > L2 ? L1 / L2 : L2 / L1;

  // Define contrast ratios based on selected WCAG level
  let requiredRatio = 4.5; // Default AA small text
  if (contrastLevel === 'WCAG-aa-large') {
    requiredRatio = 3.0;
  } else if (contrastLevel === 'WCAG-aaa-small') {
    requiredRatio = 7.0;
  } else if (contrastLevel === 'WCAG-aaa-large') {
    requiredRatio = 4.5;
  }

  return ratio >= requiredRatio;
}
