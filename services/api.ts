import { SCRIPT_URL } from "../constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow } from "../types";

export const hashPassword = async (p: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(p);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const api = {

  fetchTasks: async (mode: 'get_operator_tasks' | 'get_stats'): Promise<Task[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=${mode}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  // ✅ НОВЫЙ uploadPhoto С ПРОГРЕССОМ
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

      xhr.send(JSON.stringify({
        mode: "upload_photo",
        image,
        mimeType,
        filename
      }));
    });
  },

  taskAction: async (
    id: string,
    act: string,
    user: string,
    zone: string = '',
    pGen: string = '',
    pSeal: string = '',
    pEmpty: string = ''
  ): Promise<void> => {
    const url = `${SCRIPT_URL}?mode=task_action&id=${id}&act=${act}&op=${encodeURIComponent(user)}&zone=${zone}&pGen=${encodeURIComponent(pGen)}&pSeal=${encodeURIComponent(pSeal)}&pEmpty=${encodeURIComponent(pEmpty)}`;
    await fetch(url);
  }
};
