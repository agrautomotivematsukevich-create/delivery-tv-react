export interface User {
  user: string;
  name: string;
  role: 'OPERATOR' | 'LOGISTIC' | 'ADMIN' | 'AGRL'; // ✅ Added AGRL (Arrival Agent)
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
  arrival?: string; // ✅ NEW: Arrival time (HH:MM) for AGRL functionality
  // Extended fields for History
  zone?: string;
  operator?: string;
  photo_gen?: string;
  photo_seal?: string;
  photo_inspect?: string;
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
  nav_downtime: string;
  nav_analytics: string;
  
  // TV mode
  tv_mode: string;
  tv_exit: string;
  
  // Search
  search_placeholder: string;
  
  // Export
  export_csv: string;
  
  // Analytics
  analytics_title: string;
  analytics_week: string;
  analytics_avg_time: string;
  analytics_containers: string;
  analytics_no_data: string;
  
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
  
  // ✅ NEW: AGRL Role
  nav_arrival: string;
  nav_arrival_analytics: string;
  arrival_terminal_title: string;
  arrival_mark: string;
  arrival_time: string;
  arrival_set_time: string;
  arrival_current_time: string;
  arrival_manual_time: string;
  arrival_success: string;
  arrival_reset: string;
  arrival_not_marked: string;
  arrival_marked: string;
  arrival_on_site: string;
  arrival_waiting_unload: string;
  analytics_arrival_title: string;
  analytics_date_from: string;
  analytics_date_to: string;
  analytics_load_data: string;
  analytics_total_downtime: string;
  analytics_avg_downtime: string;
  analytics_records_count: string;
  analytics_minutes: string;
  analytics_hours: string;
  analytics_col_date: string;
  analytics_col_eta: string;
  analytics_col_arrival: string;
  analytics_col_end: string;
  analytics_col_downtime: string;
  analytics_edit_arrival: string;
  analytics_no_arrivals: string;
}

export interface TaskAction {
  id: string;
  type: 'start' | 'finish';
  zone?: string | null;
}

// ============================================
// ✅ NEW TYPES FOR AGRL ROLE
// ============================================

/**
 * Arrival Analytics Record
 * Represents one container's journey from arrival to completion
 */
export interface ArrivalAnalyticsRecord {
  id: string;           // Container ID
  date: string;         // Date sheet name (DD.MM)
  lot?: string;         // Lot number
  type?: string;        // Container type (BS/AS/PS)
  pallets?: string;     // Pallets count
  eta: string;          // Expected time (HH:MM)
  arrival: string;      // Actual arrival time (HH:MM)
  start_time?: string;  // Unloading start (HH:MM)
  end_time?: string;    // Unloading end (HH:MM)
  downtime: number | null; // Minutes between arrival and end_time
  zone?: string;        // Unloading zone
  operator?: string;    // Operator name
  status: 'WAIT' | 'ACTIVE' | 'DONE';
}

/**
 * Simplified container info for Arrival Terminal
 */
export interface ContainerSchedule extends Task {
  index?: string;       // Visual index
  lot?: string;         // Lot number
}
