/**
 * SEO metadata for every public route.
 * Used by <PageMeta /> to dynamically set <title>, <meta>, <link rel="canonical">.
 */

export const SITE_URL = 'https://agr-warehouse.vercel.app';
export const SITE_NAME = 'AGR Warehouse';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface RouteMeta {
  title: string;
  description: string;
  /** Relative path starting with "/", used to build canonical URL */
  path: string;
}

export const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    path: '/',
    title: 'Дашборд — AGR Warehouse | Главная панель управления поставками',
    description:
      'Главная панель AGR Warehouse: статусы задач, загрузка зон, активные операторы и ключевые метрики склада в реальном времени.',
  },
  '/arrival': {
    path: '/arrival',
    title: 'Приёмка грузов — AGR Warehouse | Arrival Analytics',
    description:
      'Аналитика приёмки грузов: график поступлений, среднее время разгрузки, статистика по перевозчикам и динамика за период.',
  },
  '/downtime': {
    path: '/downtime',
    title: 'Простои зон — AGR Warehouse | Zone Downtime',
    description:
      'Мониторинг простоев складских зон: карта активности, причины остановок, длительность и тренды по каждой зоне.',
  },
  '/history': {
    path: '/history',
    title: 'История операций — AGR Warehouse | Operations History',
    description:
      'Полная история складских операций: завершённые задачи, время выполнения, ответственные операторы и фотоотчёты.',
  },
  '/logistics': {
    path: '/logistics',
    title: 'Логистика — AGR Warehouse | Logistics Overview',
    description:
      'Обзор логистики: статусы отправок, маршруты доставки, загрузка транспорта и прогнозы по срокам.',
  },
  '/lotTracker': {
    path: '/lotTracker',
    title: 'Отслеживание лотов — AGR Warehouse | Lot Tracker',
    description:
      'Отслеживание лотов на складе: текущая позиция, история перемещений, статус обработки и привязка к заказам.',
  },
};

/** Fallback for unknown routes (catch-all) */
export const DEFAULT_META: RouteMeta = ROUTE_META['/'];
