chrome.runtime.onMessage.addListener((message) => {
  if (message.image) {
    const img = document.getElementById('capturedImage');
    const analysisCanvas = document.getElementById('analysisCanvas');
    const rescanButton = document.getElementById('rescanButton');
    const maskButton = document.getElementById('maskButton');
    const downloadButton = document.getElementById('downloadButton');
    
    analysisCanvas.style.display = 'none';
    img.style.display = 'none';

    rescanButton.disabled = true;
    maskButton.disabled = true;
    downloadButton.disabled = true;
    rescanButton.textContent = 'Initial Scan...';
    maskButton.textContent = 'Mask Loading...';

    img.onload = () => {
      img.style.display = 'block';
      
      setTimeout(() => {
        requestAnimationFrame(() => {
          initializeAnalysis(img, analysisCanvas, message).then(() => {
            
            rescanButton.disabled = false;
            maskButton.disabled = false;
            downloadButton.disabled = false;
            rescanButton.textContent = 'Rescan';
            maskButton.textContent = 'Hide Mask';
          });
        });
      }, 100);
    };
    img.src = message.image;
  }
});

async function initializeAnalysis(img, analysisCanvas, message) {
  const webglCanvas = document.createElement('canvas');
  const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  const gl = webglCanvas.getContext('webgl', { preserveDrawingBuffer: true });
  const devicePixelRatio = message.devicePixelRatio || window.devicePixelRatio || 1;

  if (!gl) {
    console.error('WebGL not supported');
    return;
  }

  let imageWidth, imageHeight;
  if (message.mode === 'full') {
    imageWidth = img.naturalWidth / devicePixelRatio;
    imageHeight = img.naturalHeight / devicePixelRatio;
  } else {
    imageWidth = img.naturalWidth;
    imageHeight = img.naturalHeight;
  }
  webglCanvas.width = imageWidth;
  webglCanvas.height = imageHeight;
  analysisCanvas.width = imageWidth;
  analysisCanvas.height = imageHeight;

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_image;
    varying vec2 v_texCoord;
    void main() {
      gl_FragColor = texture2D(u_image, v_texCoord);
    }
  `;
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  const positions = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  const texCoords = new Float32Array([
    0, 1,
    1, 1,
    0, 0,
    1, 0,
  ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  gl.viewport(0, 0, webglCanvas.width, webglCanvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
  ctx.drawImage(webglCanvas, 0, 0);

  await runColorContrastAnalysis(ctx, analysisCanvas.width, analysisCanvas.height,false);
  
  // Switch to analysis canvas
  analysisCanvas.style.display = 'block';

  // Cleanup
  gl.deleteTexture(texture);
  gl.deleteProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(texCoordBuffer);
}

async function runColorContrastAnalysis(ctx, width, height,useToolbarSettings = false) {

  let contrastLevel, pixelRadius;
  if(useToolbarSettings)
  {
    const wcagLevelSelect = document.getElementById('levelEvaluated-options');
    const pixelRadiusSelect = document.getElementById('pixelRadius-options');
    contrastLevel = wcagLevelSelect.value;
    pixelRadius = parseInt(pixelRadiusSelect.value, 10);
  }
  else
  {
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get({
        wcagLevel: 'WCAG-aa-small',
        pixelRadius: '1'
      }, resolve);
    });
    contrastLevel = settings.wcagLevel;
    pixelRadius = parseInt(settings.pixelRadius, 10);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Create worker for parallel processing
  const workerCode = `
    ${evaluateColorContrast.toString()}
    
    onmessage = function(e) {
      const { data, width, height, startY, endY, contrastLevel, pixelRadius } = e.data;
      const results = new Uint8Array((endY - startY) * width * 4);
      
      for (let y = startY; y < endY; y++) {
        for (let x = 0; x < width; x++) {
          const index = ((y - startY) * width + x) * 4;
          const sourceIndex = (y * width + x) * 4;
          
          const r = data[sourceIndex];
          const g = data[sourceIndex + 1];
          const b = data[sourceIndex + 2];
          
          let contrast = false;
          pixelLoop: for (let dy = -pixelRadius; dy <= pixelRadius; dy++) {
            for (let dx = -pixelRadius; dx <= pixelRadius; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIndex = (ny * width + nx) * 4;
                const nr = data[nIndex];
                const ng = data[nIndex + 1];
                const nb = data[nIndex + 2];
                
                if (evaluateColorContrast(r, g, b, nr, ng, nb, contrastLevel)) {
                  contrast = true;
                  break pixelLoop;
                }
              }
            }
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
      
      postMessage({ results, startY, endY });
    }
  `;
  
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  
  // Split work between multiple workers ( CPU logical processor or 4 LP)
  const workerCount = navigator.hardwareConcurrency || 4;
  const rowsPerWorker = Math.ceil(height / workerCount);
  const workers = [];
  const results = new Uint8Array(width * height * 4);
  
  for (let i = 0; i < workerCount; i++) {
    const startY = i * rowsPerWorker;
    const endY = Math.min(startY + rowsPerWorker, height);
    
    const worker = new Worker(workerUrl);
    workers.push(new Promise(resolve => {
      worker.onmessage = function(e) {
        const { results: workerResults, startY, endY } = e.data;
        
        // Copy worker results to main results array
        const startIndex = startY * width * 4;
        results.set(workerResults, startIndex);
        
        worker.terminate();
        resolve();
      };
      
      worker.postMessage({
        data: data,
        width,
        height,
        startY,
        endY,
        contrastLevel,
        pixelRadius
      });
    }));
  }
  
  // Wait for all workers to complete
  await Promise.all(workers);
  URL.revokeObjectURL(workerUrl);
  
  // Apply results
  const resultsImageData = new ImageData(new Uint8ClampedArray(results), width, height);
  ctx.putImageData(resultsImageData, 0, 0);
  
  return merged(document.getElementById('analysisCanvas'), ctx);
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
  // Cached luminance values for common colors
  const luminanceCache = new Map();
  
  const getLuminance = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    if (luminanceCache.has(key)) {
      return luminanceCache.get(key);
    }
    
    const [rs, gs, bs] = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    
    const luminance = rs * 0.2126 + gs * 0.7152 + bs * 0.0722;
    luminanceCache.set(key, luminance);
    return luminance;
  };
  
  const L1 = getLuminance(r1, g1, b1) + 0.05;
  const L2 = getLuminance(r2, g2, b2) + 0.05;
  const ratio = L1 > L2 ? L1 / L2 : L2 / L1;
  
  const requiredRatio = {
    'WCAG-aa-small': 4.5,
    'WCAG-aa-large': 3.0,
    'WCAG-aaa-small': 7.0,
    'WCAG-aaa-large': 4.5
  }[contrastLevel] || 4.5;
  
  return ratio >= requiredRatio;
}

async function merged(canvas, ctx) {
  return new Promise((resolve) => {
    const mergedCanvas = document.createElement('canvas');
    const mergedCtx = mergedCanvas.getContext('2d');
    mergedCanvas.width = canvas.width;
    mergedCanvas.height = canvas.height;
    
    const capturedImage = document.getElementById('capturedImage');
    mergedCtx.drawImage(capturedImage, 0, 0, canvas.width, canvas.height);
    mergedCtx.drawImage(canvas, 0, 0);

    const mergedImageUrl = mergedCanvas.toDataURL('image/png');
    const mergedImg = new Image();
    
    mergedImg.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(mergedImg, 0, 0);
      resolve();
    };
    
    mergedImg.src = mergedImageUrl;
  });
}

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

document.getElementById('rescanButton').addEventListener('click', async () => {
  try {
    const rescanButton = document.getElementById('rescanButton');
    const maskButton = document.getElementById('maskButton');
    const downloadButton = document.getElementById('downloadButton');
    const canvas = document.getElementById('analysisCanvas');
    if (!canvas) throw new Error('Analysis canvas not found');
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    let saveMaskbuttonText = maskButton.textContent;
    
    // Disable button during scan
    rescanButton.disabled = true;
    maskButton.disabled=true;
    downloadButton.disabled=true;
    rescanButton.textContent = 'Rescanning...';
    maskButton.textContent = 'New Mask Loading...';

    // Clear and redraw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const capturedImage = document.getElementById('capturedImage');
    if (!capturedImage) throw new Error('Source image not found');
    
    ctx.drawImage(capturedImage, 0, 0, canvas.width, canvas.height);
    
    // Run analysis with current toolbar settings
    await runColorContrastAnalysis(ctx, canvas.width, canvas.height,true);
    
    // Reset button state
    rescanButton.disabled = false;
    maskButton.disabled = false;
    downloadButton.disabled = false;
    rescanButton.textContent = 'Rescan';
    maskButton.textContent = saveMaskbuttonText;
    
  } catch (error) {
    console.error('Rescan failed:', error);
    const button = document.getElementById('rescanButton');
    button.disabled = false;
    button.textContent = 'Rescan Failed';
    setTimeout(() => {
      button.textContent = 'Rescan';
    }, 2000);
  }
});

document.getElementById('downloadButton').addEventListener('click', () => {
  const canvas = document.getElementById('analysisCanvas');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `contrast-analysis-${timestamp}.png`;
  
  const downloadLink = document.createElement('a');
  downloadLink.download = filename;
  downloadLink.href = canvas.toDataURL('image/png');
  
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({
    wcagLevel: 'WCAG-aa-small',
    pixelRadius: '1'
  }, (settings) => {
    document.getElementById('levelEvaluated-options').value = settings.wcagLevel;
    document.getElementById('pixelRadius-options').value = settings.pixelRadius;
  });
});