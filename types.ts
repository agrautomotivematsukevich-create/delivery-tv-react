export interface User {
  user: string;
  name: string;
  role: 'OPERATOR' | 'LOGISTIC' | 'ADMIN';
}

export interface Task {
  id: string;
  type?: string;
  pallets?: string;
  phone?: string;
  eta?: string;
  status: 'WAIT' | 'ACTIVE' | 'DONE';
  time: string;
  start_time?: string;
  end_time?: string;
  // Extended fields for History
  zone?: string;
  operator?: string;
  photo_gen?: string;
  photo_seal?: string;
  photo_empty?: string;
}

export interface Issue {
  id: string; // Container ID
  timestamp: string;
  desc: string;
  photos: string[];
  author: string;
}

export interface DashboardData {
  status: string;
  done: number;
  total: number;
  nextId: string;
  nextTime: string;
  activeList: Array<{
    id: string;
    start: string;
    zone: string;
  }>;
}

export interface TaskInput {
  id: string;       // Col E: Container ID
  lot: string;      // Col B: Lot No
  ws: string;       // Col C: W/S (BS/AS/PS/Custom)
  pallets: string;  // Col D: Pallets/Cases
  phone: string;    // Col F: Driver Phone
  eta: string;      // Col G: ETA
}

export interface PlanRow extends TaskInput {
  rowIndex: number; // For backend updates
  index: number;    // Visual index (Col A)
}

export type Lang = 'RU' | 'EN_CN';

export interface TranslationSet {
  title: string;
  progress: string;
  next: string;
  list: string;
  lunch: string;
  victory: string;
  status_active: string;
  status_pause: string;
  status_wait: string;
  eta_prefix: string;
  delay_prefix: string;
  lbl_start: string;
  lbl_dur: string;
  stats_title: string;
  stat_done: string;
  stat_queue: string;
  list_done: string;
  list_wait: string;
  drv_title: string;
  btn_login: string;
  btn_start: string;
  btn_finish: string;
  lbl_photo1: string;
  lbl_photo2: string;
  lbl_photo_empty: string;
  msg_uploading: string;
  msg_success: string;
  login_title: string;
  reg_title: string;
  empty: string;
  btn_reg: string;
  btn_cancel: string;
  issue_title: string;
  issue_desc_ph: string;
  issue_btn: string;
  issue_upload: string;
  issue_success: string;
  // History
  btn_history: string;
  history_title: string;
  history_empty: string;
  history_back: string;
  
  // New additions
  menu_history: string;
  menu_logout: string;
  lbl_description: string;
  lbl_photos_list: string;
  btn_open_drive: string;
  msg_loading_history: string;

  // Navigation & Logistics
  nav_dashboard: string;
  nav_history: string;
  nav_plan: string;
  
  log_title: string;
  log_date: string;
  log_add_row: string;
  log_submit: string;
  log_success: string;
  log_lot: string;
  log_ws: string;
  log_pallets: string;
  log_phone: string;
  log_eta: string;
  log_id: string;
  
  // Logistics Editor
  log_mode_create: string;
  log_mode_edit: string;
  log_edit_title: string;
  log_btn_edit: string;
  log_btn_save: string;
  log_no_data: string;
  
  hist_select_date: string;
  hist_load: string;
  hist_no_data: string;
  
  dtl_operator: string;
  dtl_zone: string;
  dtl_photos: string;
}

export interface TaskAction {
  id: string;
  type: 'start' | 'finish';
  zone?: string | null;
}