// services/api.ts

import { SCRIPT_URL } from "../constants";
import { Task, Issue, PlanRow } from "../types";

/* -------------------------------------------------- */
/* ------------------- HELPERS ---------------------- */
/* -------------------------------------------------- */

const get = async (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${query}`);
  return res.json();
};

const post = async (body: any) => {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
};

/* -------------------------------------------------- */
/* --------------------- API ------------------------ */
/* -------------------------------------------------- */

export const api = {
  /* ---------- TERMINAL / DASHBOARD ---------- */

  fetchTasks: async (mode: "get_operator_tasks" | "get_stats"): Promise<Task[]> => {
    const data = await get({ mode });
    return data.tasks || [];
  },

  fetchDashboard: async () => {
    const data = await get({ mode: "get_stats" });
    return data;
  },

  taskAction: async (
    id: string,
    act: string,
    user: string,
    zone?: string,
    pGen?: string,
    pSeal?: string,
    pEmpty?: string
  ) => {
    return post({
      mode: "update_container_row",
      id,
      act,
      user,
      zone,
      pGen,
      pSeal,
      pEmpty,
    });
  },

  /* ---------- AUTH ---------- */

  login: async (login: string, password: string) => {
    return get({
      mode: "login",
      login,
      password,
    });
  },

  register: async (login: string, password: string, role: string) => {
    return post({
      mode: "register",
      login,
      password,
      role,
    });
  },

  /* ---------- HISTORY ---------- */

  fetchHistory: async (date: string) => {
    const data = await get({
      mode: "get_history",
      date,
    });
    return data.rows || [];
  },

  /* ---------- ISSUES ---------- */

  fetchIssues: async () => {
    const data = await get({ mode: "get_issues" });
    return data.issues || [];
  },

  reportIssue: async (
    containerId: string,
    message: string,
    photoUrl?: string
  ) => {
    return post({
      mode: "report_issue",
      containerId,
      message,
      photoUrl,
    });
  },

  fetchAllContainers: async () => {
    const data = await get({ mode: "get_all_containers" });
    return data.rows || [];
  },

  /* ---------- LOGISTICS ---------- */

  createPlan: async (rows: PlanRow[], date: string) => {
    return post({
      mode: "create_plan",
      date,
      rows,
    });
  },

  fetchFullPlan: async (date: string) => {
    const data = await get({
      mode: "get_full_plan",
      date,
    });
    return data.rows || [];
  },

  updatePlanRow: async (row: PlanRow) => {
    return post({
      mode: "update_plan_row",
      row,
    });
  },

  /* ---------- IMAGES (FIREWALL BYPASS) ---------- */

  getProxyImage: async (id: string): Promise<string> => {
    const data = await get({
      mode: "get_photo",
      id,
    });
    return data.base64 || "";
  },

  /* ---------- PHOTO UPLOAD WITH PROGRESS ---------- */

  uploadPhoto: (
    image: string,
    mimeType: string,
    filename: string,
    onProgress: (percent: number) => void
  ): Promise<string> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", SCRIPT_URL);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.status === "SUCCESS" ? data.url : "");
        } catch {
          resolve("");
        }
      };

      xhr.onerror = () => resolve("");

      xhr.send(
        JSON.stringify({
          mode: "upload_photo",
          image,
          mimeType,
          filename,
        })
      );
    });
  },
};
