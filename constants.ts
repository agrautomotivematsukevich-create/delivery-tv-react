import { Lang, TranslationSet } from "./types";

// !!! ВАЖНО: используйте ТОЧНО тот URL, который работает в рабочей версии
export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXtTFgAuWV2VdLu9Dt0fPYOAnA4_7t8jE-4zq1qWYiByoERpnYRySmSY4tgkEsS3KXgg/exec';

export const TRANSLATIONS: Record<Lang, TranslationSet> = {
  RU: {
    title: "Мониторинг Склада",
    // ... остальные переводы (без изменений, оставьте как есть)
  },
  EN_CN: {
    title: "Warehouse Monitor / 仓库监控",
    // ... остальные переводы
  }
};