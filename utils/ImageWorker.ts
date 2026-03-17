self.onmessage = async (e) => {
  try {
    const { file, maxW = 1200, quality = 0.72, suffix = '' } = e.data;
    
    // We use createImageBitmap to decode the image off the main thread
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxW / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    
    // Create an offscreen canvas to scale the image
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas error');
    
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    // Convert to blob
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    
    // Read the blob as a data URL using FileReader
    const reader = new FileReader();
    reader.onloadend = () => {
      self.postMessage({
        success: true,
        data: reader.result,
        mime: 'image/jpeg',
        name: suffix ? `${suffix}.jpg` : file.name,
      });
    };
    reader.readAsDataURL(blob);

  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown compression error' 
    });
  }
};

export default null; // module
