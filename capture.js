chrome.runtime.onMessage.addListener((message) => {
  if (message.image) {
    const img = document.getElementById('capturedImage');
    const canvas = document.getElementById('analysisCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const devicePixelRatio = message.devicePixelRatio || 1;

    img.src = message.image;
    img.onload = () => {
      // Get the natural dimensions of the image
      const imageWidth = img.naturalWidth;
      const imageHeight = img.naturalHeight;

      // Adjust the canvas size to match the image dimensions
      canvas.width = imageWidth / devicePixelRatio;
      canvas.height = imageHeight / devicePixelRatio;

      // Clear the canvas and draw the image on it
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Run color contrast analysis after the image is loaded
      runColorContrastAnalysis(ctx, canvas.width, canvas.height);

      // Merge the image with the overlay
      const mergedCanvas = document.createElement('canvas');
      const mergedCtx = mergedCanvas.getContext('2d');
      mergedCanvas.width = canvas.width;
      mergedCanvas.height = canvas.height;
      mergedCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      mergedCtx.drawImage(canvas, 0, 0);

      // Replace the canvas with the merged image
      const mergedImageUrl = mergedCanvas.toDataURL('image/png');
      const mergedImg = new Image();
      mergedImg.src = mergedImageUrl;
      mergedImg.onload = () => {
        canvas.width = mergedImg.width;
        canvas.height = mergedImg.height;
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
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const contrastLevel = document.getElementById('levelEvaluated-options').value;
  const pixelRadius = parseInt(document.getElementById('pixelRadius-options').value, 10);

  const results = performAnalysis(data, width, height, contrastLevel, pixelRadius);

  applyGreyingEffect(ctx, width, height);
  updateCanvasWithResults(ctx, results, width, height);
}

function performAnalysis(data, width, height, contrastLevel, pixelRadius) {
  const results = new Uint8Array(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      let contrast = false;
      for (let dy = -pixelRadius; dy <= pixelRadius; dy++) {
        for (let dx = -pixelRadius; dx <= pixelRadius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
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
        results[index] = 255;
        results[index + 1] = 255;
        results[index + 2] = 255;
        results[index + 3] = 255;
      } else {
        results[index] = 0;
        results[index + 1] = 0;
        results[index + 2] = 0;
        results[index + 3] = 128;
      }
    }
  }

  return results;
}

function applyGreyingEffect(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 128) {
      data[i] = data[i] * 0.5;
      data[i + 1] = data[i + 1] * 0.5;
      data[i + 2] = data[i + 2] * 0.5;
      data[i + 3] = 128;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function updateCanvasWithResults(ctx, results, width, height) {
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(results);
  ctx.putImageData(imageData, 0, 0);
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

  let requiredRatio = 4.5;
  if (contrastLevel === 'WCAG-aa-large') {
    requiredRatio = 3.0;
  } else if (contrastLevel === 'WCAG-aaa-small') {
    requiredRatio = 7.0;
  } else if (contrastLevel === 'WCAG-aaa-large') {
    requiredRatio = 4.5;
  }

  return ratio >= requiredRatio;
}
