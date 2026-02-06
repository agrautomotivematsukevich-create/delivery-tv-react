// Внутри HistoryView.tsx, в блоке выбранной задачи (selectedTask)

const handleTaskShare = (task: any) => {
  const text = `ОТЧЕТ ПО ПОСТАВКЕ: ${task.id}\n` +
               `Оператор: ${task.operator}\n` +
               `Зона: ${task.zone}\n` +
               `Время: ${task.start_time} - ${task.end_time}\n\n` +
               `ФОТО (ОРИГИНАЛЫ DRIVE):\n` +
               `Общее: ${task.photo_gen}\n` +
               `Пломба: ${task.photo_seal}\n` +
               `Пустой: ${task.photo_empty}`;
  
  navigator.clipboard.writeText(text);
  alert("Данные поставки скопированы! Вставьте в письмо Outlook.");
  window.location.href = `mailto:?subject=${encodeURIComponent("Отчет: " + task.id)}`;
};

// В JSX заменить старую кнопку <a> на:
<button
  onClick={() => handleTaskShare(selectedTask)}
  className="w-full py-4 bg-accent-blue text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:brightness-110 transition-all"
>
  <Copy size={20} /> КОПИРОВАТЬ ДАННЫЕ ДЛЯ OUTLOOK
</button>