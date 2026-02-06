const handleCopyIssue = async (issue: Issue) => {
    // Формируем HTML для Outlook
    let photosHtml = "";
    issue.photos.forEach((url, i) => {
      const id = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
      const proxyUrl = id ? `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&w=500` : url;
      photosHtml += `<p>Фото ${i + 1}:<br><img src="${proxyUrl}" width="500" style="border-radius: 8px;"></p>`;
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #e11d48;">ОТЧЕТ О ПРОБЛЕМЕ: ${issue.id}</h2>
        <p><b>Автор:</b> ${issue.author}</p>
        <p><b>Дата:</b> ${issue.timestamp}</p>
        <p><b>Описание:</b> ${issue.desc}</p>
        <hr>
        ${photosHtml}
      </div>
    `;

    // Записываем как HTML, чтобы Outlook распознал картинки
    const blob = new Blob([htmlContent], { type: "text/html" });
    const data = [new ClipboardItem({ "text/html": blob, "text/plain": new Blob([issue.desc], { type: "text/plain" }) })];
    
    try {
      await navigator.clipboard.write(data);
      alert("Отчет с фото скопирован! Вставьте в Outlook (Ctrl+V)");
    } catch (err) {
      alert("Ошибка копирования. Попробуйте еще раз.");
    }
  };