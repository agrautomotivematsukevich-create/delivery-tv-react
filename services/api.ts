// Функция uploadPhoto уже обновлена
export const uploadPhoto = (
  containerId: string,
  file: File,
  photoType: 'before' | 'after' | 'damage' | 'custom',
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; photoUrl: string }> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('containerId', containerId);
    formData.append('photo', file);
    formData.append('type', photoType);
    formData.append('mode', 'upload_photo');

    const xhr = new XMLHttpRequest();
    
    // Обработчик прогресса
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    // Обработчик завершения
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          reject(new Error('Invalid response format'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    // Обработчик ошибок
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    // Таймаут 60 секунд
    xhr.timeout = 60000;
    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload timeout (60s)'));
    });

    xhr.open('POST', `${API_BASE_URL}?mode=upload_photo`);
    xhr.send(formData);
  });
};