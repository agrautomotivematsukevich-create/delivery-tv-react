import { Lang, TranslationSet } from "./types";

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwtvr-V97tV6OIS96aNLtUYPWs-A48za5vcqp29UJA4r8iPBuQsny0-avra2ejTBbq8uQ/exec';

export const TRANSLATIONS: Record<Lang, TranslationSet> = {
  RU: {
    title: "Мониторинг Склада", progress: "ОБЩИЙ ПРОГРЕСС", next: "СЛЕДУЮЩИЙ", list: "АКТИВНЫЕ",
    lunch: "ОБЕД", victory: "ПЛАН ВЫПОЛНЕН!",
    status_active: "В РАБОТЕ", status_pause: "ПАУЗА", status_wait: "ОЖИДАНИЕ",
    eta_prefix: "ЧЕРЕЗ: ", delay_prefix: "ОПОЗДАНИЕ: ",
    lbl_start: "НАЧАЛО", lbl_dur: "В РАБОТЕ",
    stats_title: "СТАТИСТИКА", stat_done: "ГОТОВО", stat_queue: "ОЧЕРЕДЬ",
    list_done: "ВЫГРУЖЕНО", list_wait: "В ОЧЕРЕДИ",
    drv_title: "Терминал", btn_login: "Войти", btn_start: "НАЧАТЬ", btn_finish: "ЗАВЕРШИТЬ",
    lbl_photo1: "Общее фото (Сзади)", lbl_photo2: "Фото пломбы", lbl_photo_empty: "Фото пустого", lbl_photo_inspection: "Фото осмотра",
    msg_uploading: "Загрузка...", msg_success: "Успешно!",
    login_title: "Вход", reg_title: "Регистрация", empty: "Нет задач",
    btn_reg: "Отправить", btn_cancel: "Отмена",
    issue_title: "Сообщить о проблеме", issue_desc_ph: "Опишите проблему...", issue_btn: "Отправить проблему", issue_upload: "Добавить фото", issue_success: "Проблема отправлена",
    btn_history: "История проблем", history_title: "История", history_empty: "Проблем не найдено", history_back: "Назад к списку",
    
    // New
    menu_history: "История",
    menu_logout: "Выйти",
    menu_messenger: "Чат команды",
    lbl_description: "Описание",
    lbl_photos_list: "Фотографии",
    btn_open_drive: "Открыть оригинал",
    msg_loading_history: "Загрузка истории...",
    
    nav_dashboard: "Дашборд",
    nav_history: "Архив",
    nav_plan: "Поставки",
    nav_admin: "Пользователи",
    
    log_title: "План поставок",
    log_date: "Дата поставки",
    log_add_row: "Добавить контейнер",
    log_submit: "Создать план",
    log_success: "План успешно создан",
    log_lot: "Lot No",
    log_ws: "W/S",
    log_pallets: "Паллеты/Кейсы",
    log_phone: "Телефон водителя",
    log_eta: "ETA",
    log_id: "Container ID",
    
    log_mode_create: "Новый план",
    log_mode_edit: "Управление планом",
    log_edit_title: "Редактирование",
    log_btn_edit: "Изменить",
    log_btn_save: "Сохранить",
    log_no_data: "План на эту дату пуст",
    
    hist_select_date: "Выберите дату",
    hist_load: "Загрузить",
    hist_no_data: "Нет данных за эту дату",
    
    dtl_operator: "Оператор",
    dtl_zone: "Зона",
    dtl_photos: "Фотоотчет",

    admin_title: "Управление доступом",
    admin_user: "Пользователь",
    admin_role: "Роль",
    admin_status: "Статус",
    admin_actions: "Действия",
    
    msg_title: "Чат",
    msg_placeholder: "Сообщение...",
    msg_send: "Отправить"
  },
  EN_CN: {
    title: "Warehouse Monitor / 仓库监控", progress: "PROGRESS / 进度", next: "NEXT / 下一个", list: "ACTIVE TASKS / 任务",
    lunch: "LUNCH BREAK / 午休", victory: "COMPLETED! / 完成",
    status_active: "ACTIVE / 运行", status_pause: "PAUSED / 暂停", status_wait: "WAITING / 等待",
    eta_prefix: "ETA / 预计: ", delay_prefix: "DELAY / 延迟: ",
    lbl_start: "START / 开始", lbl_dur: "DURATION / 持续",
    stats_title: "STATISTICS / 统计", stat_done: "DONE / 完成", stat_queue: "QUEUE / 排队",
    list_done: "UNLOADED / 已卸载", list_wait: "QUEUE / 等待中",
    drv_title: "Terminal / 终端", btn_login: "Login / 登录", btn_start: "START / 开始", btn_finish: "FINISH / 完成",
    lbl_photo1: "General Photo / 照片", lbl_photo2: "Seal Photo / 封条", lbl_photo_empty: "Empty Photo / 空箱", lbl_photo_inspection: "Inspection Photo / 检查照片",
    msg_uploading: "Uploading... / 上传中", msg_success: "Success! / 成功",
    login_title: "Login / 登录", reg_title: "Register / 注册", empty: "No tasks / 无任务",
    btn_reg: "Send / 发送", btn_cancel: "Cancel / 取消",
    issue_title: "Report Issue / 报告问题", issue_desc_ph: "Describe the issue... / 描述问题", issue_btn: "Submit Issue / 提交", issue_upload: "Add Photo / 添加照片", issue_success: "Report sent / 发送成功",
    btn_history: "Issue History / 问题记录", history_title: "History / 历史", history_empty: "No issues found / 无记录", history_back: "Back / 返回",

    // New
    menu_history: "History / 历史",
    menu_logout: "Logout / 退出",
    menu_messenger: "Team Chat / 团队聊天",
    lbl_description: "Description / 描述",
    lbl_photos_list: "Photos / 照片",
    btn_open_drive: "Open Original / 打开原图",
    msg_loading_history: "Loading history... / 加载历史...",
    
    nav_dashboard: "Dashboard / 仪表板",
    nav_history: "Archive / 档案",
    nav_plan: "Logistics / 物流",
    nav_admin: "Users / 用户",
    
    log_title: "Delivery Plan / 交付计划",
    log_date: "Delivery Date / 交货日期",
    log_add_row: "Add Container / 添加集装箱",
    log_submit: "Create Plan / 创建计划",
    log_success: "Plan Created / 计划已创建",
    log_lot: "Lot No",
    log_ws: "W/S",
    log_pallets: "Pallets/Cases",
    log_phone: "Driver Phone",
    log_eta: "ETA",
    log_id: "Container ID",
    
    log_mode_create: "New Plan / 新计划",
    log_mode_edit: "Manage Plan / 管理计划",
    log_edit_title: "Edit / 编辑",
    log_btn_edit: "Edit / 修改",
    log_btn_save: "Save / 保存",
    log_no_data: "No plan for this date / 无计划",
    
    hist_select_date: "Select Date / 选择日期",
    hist_load: "Load / 加载",
    hist_no_data: "No data for this date / 无数据",
    
    dtl_operator: "Operator / 操作员",
    dtl_zone: "Zone / 区域",
    dtl_photos: "Report Photos / 报告照片",

    admin_title: "Access Control / 访问控制",
    admin_user: "User / 用户",
    admin_role: "Role / 角色",
    admin_status: "Status / 状态",
    admin_actions: "Actions / 操作",
    
    msg_title: "Chat / 聊天",
    msg_placeholder: "Message... / 消息...",
    msg_send: "Send / 发送"
  }
};