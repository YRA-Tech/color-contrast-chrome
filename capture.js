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
      console.log('=== IMAGE LOADED ===');
      console.log('Image src length:', message.image.length);
      console.log('Image loaded - Natural size:', img.naturalWidth, 'x', img.naturalHeight);
      
      img.style.display = 'block';
      
      setTimeout(() => {
        console.log('After display - Image rendered size:', img.offsetWidth, 'x', img.offsetHeight);
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
  } else if (message.mode === 'whole') {
    // For whole page capture, use natural dimensions directly
    imageWidth = img.naturalWidth;
    imageHeight = img.naturalHeight;
    console.log('Whole page mode - using natural dimensions directly');
  } else {
    imageWidth = img.naturalWidth;
    imageHeight = img.naturalHeight;
  }
  
  // Console logging for size comparison
  console.log('=== IMAGE SIZE ANALYSIS ===');
  console.log('Original Image (naturalWidth x naturalHeight):', img.naturalWidth, 'x', img.naturalHeight);
  console.log('Device Pixel Ratio:', devicePixelRatio);
  console.log('Capture Mode:', message.mode);
  console.log('Calculated Canvas Size (imageWidth x imageHeight):', imageWidth, 'x', imageHeight);
  console.log('Image Display Size (offsetWidth x offsetHeight):', img.offsetWidth, 'x', img.offsetHeight);
  console.log('Image Display Size (clientWidth x clientHeight):', img.clientWidth, 'x', img.clientHeight);
  
  webglCanvas.width = imageWidth;
  webglCanvas.height = imageHeight;
  analysisCanvas.width = imageWidth;
  analysisCanvas.height = imageHeight;
  
  console.log('WebGL Canvas Size:', webglCanvas.width, 'x', webglCanvas.height);
  console.log('Analysis Canvas Size:', analysisCanvas.width, 'x', analysisCanvas.height);
  console.log('=============================');

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
  
  // Console logging after analysis
  console.log('=== POST-ANALYSIS SIZE CHECK ===');
  console.log('Analysis Canvas CSS Size:', analysisCanvas.style.width, 'x', analysisCanvas.style.height);
  console.log('Analysis Canvas Computed Style:', getComputedStyle(analysisCanvas).width, 'x', getComputedStyle(analysisCanvas).height);
  console.log('Image CSS Size:', img.style.width, 'x', img.style.height);
  console.log('Image Computed Style:', getComputedStyle(img).width, 'x', getComputedStyle(img).height);
  console.log('================================');
  
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

async function runColorContrastAnalysis(ctx, width, height, useToolbarSettings = false) {
  let contrastLevel, pixelRadius, useWebGL;
  if(useToolbarSettings) {
    const wcagLevelSelect = document.getElementById('levelEvaluated-options');
    const pixelRadiusSelect = document.getElementById('pixelRadius-options');
    const useWebGLCheckbox = document.getElementById('useWebGL-options');
    contrastLevel = wcagLevelSelect.value;
    pixelRadius = parseInt(pixelRadiusSelect.value, 10);
    useWebGL = useWebGLCheckbox.checked;
  } else {
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get({
        wcagLevel: 'WCAG-aa-small',
        pixelRadius: '3',
        useWebGL: true
      }, resolve);
    });
    contrastLevel = settings.wcagLevel;
    pixelRadius = parseInt(settings.pixelRadius, 10);
    useWebGL = settings.useWebGL;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  console.log('=== OPTIMIZED COLOR CONTRAST ANALYSIS START ===');
  console.log('Analysis settings:', { contrastLevel, pixelRadius, width, height, useWebGL });
  
  // Check user preference for WebGL
  if (useWebGL) {
    updateAnalysisProgress('Initializing GPU analysis...', 0);
    
    try {
      // Try WebGL GPU acceleration first (with coordinate fixes)
      const webglResult = await tryWebGLAnalysis(data, width, height, contrastLevel, pixelRadius);
      if (webglResult) {
        const resultsImageData = new ImageData(new Uint8ClampedArray(webglResult), width, height);
        ctx.putImageData(resultsImageData, 0, 0);
        updateAnalysisProgress('Complete', 100);
        return merged(document.getElementById('analysisCanvas'), ctx);
      }
    } catch (error) {
      console.warn('WebGL analysis failed, falling back to Worker:', error);
    }
  } else {
    console.log('WebGL disabled by user preference - using CPU workers');
  }
  
  // Fallback to Web Worker chunked processing
  updateAnalysisProgress('Using multi-threaded CPU analysis...', 10);
  const workerResult = await runWorkerAnalysis(data, width, height, contrastLevel, pixelRadius);
  
  const resultsImageData = new ImageData(new Uint8ClampedArray(workerResult), width, height);
  ctx.putImageData(resultsImageData, 0, 0);
  updateAnalysisProgress('Complete', 100);
  
  return merged(document.getElementById('analysisCanvas'), ctx);
}

// WebGL GPU-accelerated analysis
async function tryWebGLAnalysis(data, width, height, contrastLevel, pixelRadius) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  
  if (!gl) {
    throw new Error('WebGL2 not supported');
  }
  
  updateAnalysisProgress('Setting up GPU shaders...', 5);
  
  // Create shader program for contrast analysis
  const vertexShaderSource = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }`;
    
  const fragmentShaderSource = `#version 300 es
    precision highp float;
    uniform sampler2D u_image;
    uniform float u_width;
    uniform float u_height;
    uniform int u_radius;
    uniform float u_contrastThreshold;
    in vec2 v_texCoord;
    out vec4 fragColor;
    
    float getLuminance(vec3 color) {
      return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    }
    
    float getContrast(float l1, float l2) {
      return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05);
    }
    
    void main() {
      // Fix coordinate system - WebGL Y is flipped compared to image data
      vec2 flippedCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
      vec2 texelSize = 1.0 / vec2(u_width, u_height);
      
      vec4 centerPixel = texture(u_image, flippedCoord);
      float centerLum = getLuminance(centerPixel.rgb);
      
      int foundRadius = 0;
      
      // Check each radius iteratively (1, 2, 3)
      for (int radius = 1; radius <= u_radius; radius++) {
        bool foundAtRadius = false;
        
        for (int dy = -radius; dy <= radius; dy++) {
          for (int dx = -radius; dx <= radius; dx++) {
            if (dx == 0 && dy == 0) continue;
            
            // Use flipped coordinates and ensure pixel-perfect sampling
            vec2 sampleCoord = flippedCoord + vec2(float(dx), float(dy)) * texelSize;
            
            if (sampleCoord.x >= 0.0 && sampleCoord.x <= 1.0 && 
                sampleCoord.y >= 0.0 && sampleCoord.y <= 1.0) {
              
              vec4 samplePixel = texture(u_image, sampleCoord);
              float sampleLum = getLuminance(samplePixel.rgb);
              float contrast = getContrast(centerLum, sampleLum);
              
              if (contrast >= u_contrastThreshold) {
                foundAtRadius = true;
                foundRadius = radius;
                break;
              }
            }
          }
          if (foundAtRadius) break;
        }
        
        if (foundAtRadius) break;
      }
      
      if (foundRadius > 0) {
        // Set grayscale value based on radius: 1=white(255), 2=light gray(170), 3=medium gray(85)
        float grayValue = foundRadius == 1 ? 1.0 : (foundRadius == 2 ? 0.667 : 0.333);
        fragColor = vec4(grayValue, grayValue, grayValue, 1.0);
      } else {
        fragColor = vec4(0.0, 0.0, 0.0, 0.5);
      }
    }`;
    
  updateAnalysisProgress('Compiling GPU shaders...', 15);
    
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = createProgram(gl, vertexShader, fragmentShader);
  
  // Set up geometry with correct texture coordinates for image data
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  
  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  
  updateAnalysisProgress('Uploading image to GPU...', 25);
  
  // Create and upload texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  
  // Convert Uint8Array to ImageData for texture upload
  const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
  
  // Set up program
  gl.useProgram(program);
  
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  
  // Set uniforms
  gl.uniform1f(gl.getUniformLocation(program, 'u_width'), width);
  gl.uniform1f(gl.getUniformLocation(program, 'u_height'), height);
  gl.uniform1i(gl.getUniformLocation(program, 'u_radius'), pixelRadius);
  
  const contrastThresholds = {
    'WCAG-aa-small': 4.5,
    'WCAG-aa-large': 3.0,
    'WCAG-aaa-small': 7.0,
    'WCAG-aaa-large': 4.5
  };
  gl.uniform1f(gl.getUniformLocation(program, 'u_contrastThreshold'), contrastThresholds[contrastLevel] || 4.5);
  
  updateAnalysisProgress('Running GPU analysis...', 40);
  
  // Render
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  
  updateAnalysisProgress('Reading GPU results...', 80);
  
  // Read back results - WebGL readPixels reads from bottom-left, so we need to flip back
  const result = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result);
  
  // Flip the result vertically to match image data coordinate system
  const flippedResult = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = ((height - 1 - y) * width + x) * 4;
      const dstIndex = (y * width + x) * 4;
      flippedResult[dstIndex] = result[srcIndex];
      flippedResult[dstIndex + 1] = result[srcIndex + 1];
      flippedResult[dstIndex + 2] = result[srcIndex + 2];
      flippedResult[dstIndex + 3] = result[srcIndex + 3];
    }
  }
  
  // Cleanup
  gl.deleteTexture(texture);
  gl.deleteProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(texCoordBuffer);
  
  updateAnalysisProgress('GPU analysis complete', 90);
  return flippedResult;
}

// Web Worker analysis for CPU fallback
async function runWorkerAnalysis(data, width, height, contrastLevel, pixelRadius) {
  const numWorkers = Math.min(4, navigator.hardwareConcurrency || 4);
  const chunkHeight = Math.ceil(height / numWorkers);
  
  const workerPromises = [];
  
  for (let i = 0; i < numWorkers; i++) {
    const startY = i * chunkHeight;
    const endY = Math.min(startY + chunkHeight, height);
    
    if (startY >= height) break;
    
    const workerPromise = new Promise((resolve, reject) => {
      const worker = new Worker(URL.createObjectURL(new Blob([`
        self.onmessage = function(e) {
          const { data, width, height, startY, endY, contrastLevel, pixelRadius } = e.data;
          
          function evaluateColorContrast(r1, g1, b1, r2, g2, b2, level) {
            const getLuminance = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const L1 = getLuminance(r1, g1, b1);
            const L2 = getLuminance(r2, g2, b2);
            const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            
            const thresholds = {
              'WCAG-aa-small': 4.5,
              'WCAG-aa-large': 3.0,
              'WCAG-aaa-small': 7.0,
              'WCAG-aaa-large': 4.5
            };
            
            return ratio >= (thresholds[level] || 4.5);
          }
          
          const chunkResults = new Uint8Array((endY - startY) * width * 4);
          
          // Initialize chunk to black
          for (let i = 0; i < chunkResults.length; i += 4) {
            chunkResults[i] = 0;     // R
            chunkResults[i + 1] = 0; // G
            chunkResults[i + 2] = 0; // B
            chunkResults[i + 3] = 128; // A
          }
          
          // Iterative analysis: check radius 1, then 2, then 3
          for (let radius = 1; radius <= pixelRadius; radius++) {
            const grayValue = radius === 1 ? 255 : (radius === 2 ? 170 : 85);
            
            for (let y = startY; y < endY; y++) {
              for (let x = 0; x < width; x++) {
                const globalIndex = (y * width + x) * 4;
                const chunkIndex = ((y - startY) * width + x) * 4;
                
                // Skip if already marked with contrast at smaller radius
                if (chunkResults[chunkIndex] > 0) continue;
                
                const r = data[globalIndex];
                const g = data[globalIndex + 1];
                const b = data[globalIndex + 2];
                
                let foundContrast = false;
                
                // Check all pixels within current radius
                for (let dy = -radius; dy <= radius && !foundContrast; dy++) {
                  for (let dx = -radius; dx <= radius; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                      const nIndex = (ny * width + nx) * 4;
                      const nr = data[nIndex];
                      const ng = data[nIndex + 1];
                      const nb = data[nIndex + 2];
                      
                      if (evaluateColorContrast(r, g, b, nr, ng, nb, contrastLevel)) {
                        foundContrast = true;
                        break;
                      }
                    }
                  }
                }
                
                if (foundContrast) {
                  chunkResults[chunkIndex] = grayValue;
                  chunkResults[chunkIndex + 1] = grayValue;
                  chunkResults[chunkIndex + 2] = grayValue;
                  chunkResults[chunkIndex + 3] = 255;
                }
              }
            }
          }
          
          self.postMessage({ chunkResults, startY, endY });
        };
      `], { type: 'application/javascript' })));
      
      worker.onmessage = (e) => {
        worker.terminate();
        resolve(e.data);
      };
      
      worker.onerror = (error) => {
        worker.terminate();
        reject(error);
      };
      
      updateAnalysisProgress(`Processing chunk ${i + 1}/${numWorkers}...`, 20 + (i / numWorkers) * 60);
      
      worker.postMessage({
        data: data,
        width,
        height,
        startY,
        endY,
        contrastLevel,
        pixelRadius
      });
    });
    
    workerPromises.push(workerPromise);
  }
  
  const results = await Promise.all(workerPromises);
  
  updateAnalysisProgress('Combining worker results...', 85);
  
  // Combine results
  const finalResults = new Uint8Array(width * height * 4);
  
  for (const { chunkResults, startY, endY } of results) {
    const chunkHeight = endY - startY;
    for (let y = 0; y < chunkHeight; y++) {
      const sourceStart = y * width * 4;
      const destStart = (startY + y) * width * 4;
      finalResults.set(chunkResults.subarray(sourceStart, sourceStart + width * 4), destStart);
    }
  }
  
  return finalResults;
}

// Helper functions for WebGL
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    throw new Error('Shader compilation failed');
  }
  
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    throw new Error('Program linking failed');
  }
  
  return program;
}

// Progress feedback
function updateAnalysisProgress(message, percent) {
  console.log(`Analysis Progress: ${message} (${percent}%)`);
  
  // Update button text to show progress
  const rescanButton = document.getElementById('rescanButton');
  if (rescanButton) {
    if (percent < 100) {
      rescanButton.textContent = `${Math.round(percent)}% ${message}`;
    } else {
      // Reset button text when complete
      rescanButton.textContent = 'Rescan';
    }
  }
}

async function performAnalysis(data, width, height, contrastLevel, pixelRadius) {
  console.log('Using optimized performAnalysis function');
  
  // Use the same optimized approach as the main analysis
  try {
    // Try WebGL GPU acceleration first (with coordinate fixes)
    const webglResult = await tryWebGLAnalysis(data, width, height, contrastLevel, pixelRadius);
    if (webglResult) {
      return webglResult;
    }
  } catch (error) {
    console.warn('WebGL analysis failed in performAnalysis, falling back to Worker:', error);
  }
  
  // Fallback to Web Worker chunked processing
  return await runWorkerAnalysis(data, width, height, contrastLevel, pixelRadius);
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

// Global luminance cache for performance
const luminanceCache = new Map();


function evaluateColorContrast(r1, g1, b1, r2, g2, b2, contrastLevel) {
  // Fast approximation using relative luminance formula
  const getLuminanceFast = (r, g, b) => {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  
  const L1 = getLuminanceFast(r1, g1, b1);
  const L2 = getLuminanceFast(r2, g2, b2);
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  
  const requiredRatio = {
    'WCAG-aa-small': 4.5,
    'WCAG-aa-large': 3.0,
    'WCAG-aaa-small': 7.0,
    'WCAG-aaa-large': 4.5
  }[contrastLevel] || 4.5;
  
  return ratio >= requiredRatio;
}

async function merged(canvas, ctx) {
  console.log('=== MERGED FUNCTION DEBUG ===');
  console.log('Analysis canvas size:', canvas.width, 'x', canvas.height);
  
  const capturedImage = document.getElementById('capturedImage');
  console.log('Captured image size:', capturedImage.naturalWidth, 'x', capturedImage.naturalHeight);
  console.log('Captured image display size:', capturedImage.offsetWidth, 'x', capturedImage.offsetHeight);
  
  return new Promise((resolve) => {
    const mergedCanvas = document.createElement('canvas');
    const mergedCtx = mergedCanvas.getContext('2d');
    mergedCanvas.width = canvas.width;
    mergedCanvas.height = canvas.height;
    
    console.log('Merge canvas size:', mergedCanvas.width, 'x', mergedCanvas.height);
    
    // Draw captured image as background
    mergedCtx.drawImage(capturedImage, 0, 0, canvas.width, canvas.height);
    console.log('Drew captured image to merge canvas');
    
    // Draw analysis overlay
    mergedCtx.drawImage(canvas, 0, 0);
    console.log('Drew analysis canvas to merge canvas');

    const mergedImageUrl = mergedCanvas.toDataURL('image/png');
    const mergedImg = new Image();
    
    mergedImg.onload = () => {
      console.log('Merged image loaded, updating analysis canvas');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(mergedImg, 0, 0);
      console.log('=== MERGE COMPLETE ===');
      resolve();
    };
    
    mergedImg.onerror = (error) => {
      console.error('Error loading merged image:', error);
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
    console.log('=== RESCAN STARTING ===');
    try {
      await runColorContrastAnalysis(ctx, canvas.width, canvas.height, true);
      console.log('=== RESCAN COMPLETE ===');
    } catch (error) {
      console.error('Rescan failed:', error);
    }
    
    // Always reset button state
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
    pixelRadius: '3',
    useWebGL: true
  }, (settings) => {
    document.getElementById('levelEvaluated-options').value = settings.wcagLevel;
    document.getElementById('pixelRadius-options').value = settings.pixelRadius;
    document.getElementById('useWebGL-options').checked = settings.useWebGL;
    
    // Check WebGL availability and update status
    checkWebGLAvailabilityToolbar();
  });
});

// Check WebGL availability for toolbar
function checkWebGLAvailabilityToolbar() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const webglStatus = document.getElementById('webglStatusToolbar');
  const useWebGLCheckbox = document.getElementById('useWebGL-options');
  
  if (gl) {
    webglStatus.textContent = 'GPU available';
    webglStatus.className = 'webgl-status-small available';
    useWebGLCheckbox.disabled = false;
  } else {
    webglStatus.textContent = 'GPU unavailable';
    webglStatus.className = 'webgl-status-small unavailable';
    useWebGLCheckbox.disabled = true;
    useWebGLCheckbox.checked = false;
  }
}