import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { TranslationSet, ActiveDowntime } from "../types";
import {
  Clock,
  TrendingDown,
  BarChart3,
  Calendar,
  Download,
  AlertTriangle,
  Activity,
  CheckCircle,
  Edit3,
  User,
} from "lucide-react";
import DowntimeNotificationModal from "./DowntimeNotificationModal";

interface ZoneDowntimeViewProps {
  t: TranslationSet;
  userName?: string;
  userRole?: string;
}

interface DowntimeRecord {
  zone: string;
  containerId: string;
  endTime: string;
  nextContainerId: string;
  nextStartTime: string;
  downtimeMinutes: number;
}

interface ZoneStats {
  zone: string;
  totalDowntimeMinutes: number;
  averageDowntimeMinutes: number;
  downtimeCount: number;
  records: DowntimeRecord[];
}

interface ActiveIdleZone {
  zone: string;
  lastContainerId: string;
  lastEndTime: string;
  idleStartTime: Date;
  idleMinutes: number;
  status: "warning" | "critical" | "normal";
}

const ZoneDowntimeView: React.FC<ZoneDowntimeViewProps> = ({
  t,
  userName = "",
  userRole,
}) => {
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [zoneStats, setZoneStats] = useState<ZoneStats[]>([]);
  const [activeIdles, setActiveIdles] = useState<ActiveIdleZone[]>([]);
  const [initialLoading, setInitialLoading] = useState(true); // only first load shows spinner
  const [refreshing, setRefreshing] = useState(false); // background refresh — no flicker
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isPlanCompleted, setIsPlanCompleted] = useState(false);
  const [lastCompletionTime, setLastCompletionTime] = useState<string>("");
  const [downtimeReasons, setDowntimeReasons] = useState<
    Record<string, { reason: string; author: string }>
  >({}); // key: zone_startTime
  const [editingDowntime, setEditingDowntime] = useState<ActiveDowntime | null>(
    null
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadDowntimeData(true);
  }, [date]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isToday(date)) {
        loadDowntimeData(false);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [date]);

  const isToday = (dateStr: string): boolean => {
    const today = new Date().toISOString().split("T")[0];
    return dateStr === today;
  };

  const loadDowntimeData = async (isFirstLoad = false) => {
    if (isFirstLoad) setInitialLoading(true);
    else setRefreshing(true);

    const [y, m, day] = date.split("-");
    const formattedDate = `${day}.${m}`;

    const [tasks, reasonsList] = await Promise.all([
      api.fetchHistory(formattedDate),
      api.fetchDowntimeReasons(formattedDate),
    ]);

    // Build reasons map with full info (reason + author)
    const reasonsMap: Record<string, { reason: string; author: string }> = {};
    reasonsList.forEach((r) => {
      reasonsMap[`${r.zone}_${r.start_time}`] = {
        reason: r.reason,
        author: r.author || "",
      };
    });
    setDowntimeReasons(reasonsMap);

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "DONE").length;
    const planCompleted = totalTasks > 0 && totalTasks === doneTasks;
    setIsPlanCompleted(planCompleted);

    // ✅ ИСПРАВЛЕНИЕ: Находим время завершения последнего контейнера
    if (planCompleted && totalTasks > 0) {
      // Находим все завершённые контейнеры с end_time
      const completedWithTime = tasks.filter((t) => t.end_time);

      if (completedWithTime.length > 0) {
        // Сортируем по времени и берём последний
        const sorted = completedWithTime.sort((a, b) => {
          const timeA = parseTime(a.end_time!);
          const timeB = parseTime(b.end_time!);
          return timeB - timeA; // от последнего к первому
        });

        setLastCompletionTime(sorted[0].end_time!);
      }
    } else {
      setLastCompletionTime("");
    }

    const zoneMap = new Map<string, DowntimeRecord[]>();

    // ─── Dock process time offsets ────────────────────────────────────────────
    // start_time is recorded AFTER step 3 (inspection/photos/seal check = 4 min)
    // end_time   is recorded BEFORE step 10 (notify driver to pull out    = 1 min)
    // ∴ real dock idle = (next.start_time − 4) − (prev.end_time + 1)
    //                  = raw_diff − DOCK_INTERVAL_OFFSET
    // For active (live) idle: dock truly free at end_time + DOCK_END_OFFSET
    const DOCK_START_OFFSET_MIN = 4; // step 3
    const DOCK_END_OFFSET_MIN = 1; // step 10
    const DOCK_INTERVAL_OFFSET = DOCK_START_OFFSET_MIN + DOCK_END_OFFSET_MIN; // 5 min
    // ─────────────────────────────────────────────────────────────────────────

    const completedTasks = tasks
      .filter((t) => t.end_time && t.zone)
      .sort((a, b) => {
        const timeA = parseTime(a.end_time!);
        const timeB = parseTime(b.end_time!);
        return timeA - timeB;
      });

    const zones = [...new Set(completedTasks.map((t) => t.zone!))];

    const activeIdleZones: ActiveIdleZone[] = [];
    const now = new Date();

    zones.forEach((zone) => {
      const zoneTasks = completedTasks.filter((t) => t.zone === zone);
      const downtimes: DowntimeRecord[] = [];

      for (let i = 0; i < zoneTasks.length - 1; i++) {
        const current = zoneTasks[i];
        const next = zoneTasks[i + 1];

        if (current.end_time && next.start_time) {
          const endTime = parseTime(current.end_time);
          const startTime = parseTime(next.start_time);

          // Subtract dock-process offsets: operator records times with inherent delays
          const rawMinutes = (startTime - endTime) / (1000 * 60);
          const downtimeMinutes = rawMinutes - DOCK_INTERVAL_OFFSET;

          if (downtimeMinutes > 1) {
            downtimes.push({
              zone,
              containerId: current.id,
              endTime: current.end_time,
              nextContainerId: next.id,
              nextStartTime: next.start_time,
              downtimeMinutes: Math.round(downtimeMinutes),
            });
          }
        }
      }

      if (isToday(date) && zoneTasks.length > 0 && !planCompleted) {
        const lastTask = zoneTasks[zoneTasks.length - 1];

        const allTasksInZone = tasks.filter((t) => t.zone === zone);
        const hasActiveOrWaiting = allTasksInZone.some(
          (t) => (t.status === "ACTIVE" && !t.end_time) || t.status === "WAIT"
        );

        if (lastTask.end_time && !hasActiveOrWaiting) {
          const dockFreeTime =
            parseTime(lastTask.end_time) + DOCK_END_OFFSET_MIN * 60 * 1000;
          const idleMinutes = Math.round(
            (now.getTime() - dockFreeTime) / (1000 * 60)
          );

          if (idleMinutes > 5) {
            let status: "warning" | "critical" | "normal" = "normal";
            if (idleMinutes > 60) status = "critical";
            else if (idleMinutes > 30) status = "warning";

            activeIdleZones.push({
              zone,
              lastContainerId: lastTask.id,
              lastEndTime: lastTask.end_time,
              idleStartTime: new Date(dockFreeTime),
              idleMinutes,
              status,
            });
          }
        }
      }

      if (downtimes.length > 0) {
        zoneMap.set(zone, downtimes);
      }
    });

    const stats: ZoneStats[] = [];
    zoneMap.forEach((records, zone) => {
      const totalDowntime = records.reduce(
        (sum, r) => sum + r.downtimeMinutes,
        0
      );
      stats.push({
        zone,
        totalDowntimeMinutes: totalDowntime,
        averageDowntimeMinutes: Math.round(totalDowntime / records.length),
        downtimeCount: records.length,
        records,
      });
    });

    stats.sort((a, b) => b.totalDowntimeMinutes - a.totalDowntimeMinutes);
    activeIdleZones.sort((a, b) => b.idleMinutes - a.idleMinutes);

    setZoneStats(stats);
    setActiveIdles(activeIdleZones);
    setInitialLoading(false);
    setRefreshing(false);
  };

  const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const today = new Date();
    today.setHours(hours, minutes, 0, 0);
    return today.getTime();
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}ч ${mins}мин`;
    }
    return `${mins}мин`;
  };

  const formatLiveIdleTime = (idleStartTime: Date): string => {
    const diffMs = currentTime.getTime() - idleStartTime.getTime();
    const minutes = Math.floor(diffMs / (1000 * 60));
    return formatMinutes(minutes);
  };

  const getTotalDowntime = (): number => {
    return zoneStats.reduce((sum, z) => sum + z.totalDowntimeMinutes, 0);
  };

  const getAverageDowntime = (): number => {
    if (zoneStats.length === 0) return 0;
    return Math.round(getTotalDowntime() / zoneStats.length);
  };

  const exportToCSV = () => {
    let csv =
      "Зона,Контейнер (окончание),Время окончания,Следующий контейнер,Время начала,Простой (мин)\n";

    zoneStats.forEach((stat) => {
      stat.records.forEach((record) => {
        csv += `${record.zone},${record.containerId},${record.endTime},${record.nextContainerId},${record.nextStartTime},${record.downtimeMinutes}\n`;
      });
    });

    if (activeIdles.length > 0) {
      csv += "\n\nАКТИВНЫЕ ПРОСТОИ\n";
      csv += "Зона,Последний контейнер,Время завершения,Простаивает (мин)\n";
      activeIdles.forEach((idle) => {
        csv += `${idle.zone},${idle.lastContainerId},${idle.lastEndTime},${idle.idleMinutes}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `zone_downtime_${date}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
      {/* Edit Reason Modal */}
      {editingDowntime && (
        <DowntimeNotificationModal
          activeDowntimes={[editingDowntime]}
          currentDate={(() => {
            const [y, m, day] = date.split("-");
            return `${day}.${m}`;
          })()}
          userName={userName}
          onClose={() => setEditingDowntime(null)}
          onReasonUpdated={() => {
            loadDowntimeData();
            setEditingDowntime(null);
          }}
        />
      )}

      {/* Header Card */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <TrendingDown className="text-white w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-white">
                Анализ простоев зон
              </h2>
              <p className="text-sm text-white/50 font-medium flex items-center gap-2">
                Время между выгрузками по зонам
                {refreshing && (
                  <span className="inline-flex items-center gap-1 text-white/25 text-xs">
                    <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                    обновление...
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2 border border-white/10">
              <Calendar className="text-white/50" size={20} />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-white font-mono text-lg outline-none border-none [color-scheme:dark]"
              />
            </div>

            {/* Subtle refresh indicator */}
            {refreshing && (
              <div className="flex items-center gap-2 text-white/30 text-xs">
                <span className="w-3 h-3 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
                <span className="hidden sm:inline">Обновление...</span>
              </div>
            )}

            {(zoneStats.length > 0 || activeIdles.length > 0) && (
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 hover:bg-green-500/20 transition-colors font-bold text-sm"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Экспорт CSV</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ✅ ИСПРАВЛЕНО: Показываем время последнего контейнера */}
      {!initialLoading && isToday(date) && isPlanCompleted && (
        <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur-xl border-2 border-green-500/30 rounded-3xl p-6 shadow-2xl animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/50">
              <CheckCircle className="text-green-400 w-10 h-10" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-black text-white mb-1">
                План выполнен! 🎉
              </h3>
              <p className="text-white/70 text-sm">
                Все контейнеры выгружены. Зоны свободны и ожидают следующего
                плана.
              </p>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">
                Завершено
              </div>
              {/* ✅ ИСПРАВЛЕНИЕ: Показываем lastCompletionTime вместо currentTime */}
              <div className="text-3xl font-black text-green-400 font-mono">
                {lastCompletionTime || "--:--"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Активные простои */}
      {!initialLoading &&
        isToday(date) &&
        !isPlanCompleted &&
        activeIdles.length > 0 && (
          <div className="bg-card-bg backdrop-blur-xl border border-red-500/20 rounded-3xl p-6 shadow-2xl animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="text-red-400 w-6 h-6 animate-pulse" />
              <h3 className="text-xl font-black text-white uppercase tracking-wider">
                Активные простои зон
              </h3>
              <span className="text-xs text-white/40 font-mono">
                (обновление каждую минуту)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeIdles.map((idle) => (
                <div
                  key={idle.zone}
                  className={`relative overflow-hidden rounded-2xl border-2 p-5 transition-all hover:scale-[1.02] ${
                    idle.status === "critical"
                      ? "bg-red-500/10 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]"
                      : idle.status === "warning"
                      ? "bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <div
                    className={`absolute top-3 right-3 w-3 h-3 rounded-full animate-pulse ${
                      idle.status === "critical"
                        ? "bg-red-500"
                        : idle.status === "warning"
                        ? "bg-yellow-500"
                        : "bg-blue-500"
                    }`}
                  ></div>

                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-2xl ${
                        idle.status === "critical"
                          ? "bg-red-500/20 text-red-400 border-2 border-red-500/50"
                          : idle.status === "warning"
                          ? "bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500/50"
                          : "bg-blue-500/20 text-blue-400 border-2 border-blue-500/50"
                      }`}
                    >
                      {idle.zone}
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-white/40 font-bold uppercase mb-1">
                        Простаивает
                      </div>
                      <div
                        className={`text-3xl font-black font-mono tabular-nums ${
                          idle.status === "critical"
                            ? "text-red-400"
                            : idle.status === "warning"
                            ? "text-yellow-400"
                            : "text-blue-400"
                        }`}
                      >
                        {formatLiveIdleTime(idle.idleStartTime)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/50">
                        Последний контейнер:
                      </span>
                      <span
                        className="font-mono font-bold text-white truncate ml-2 max-w-[150px]"
                        title={idle.lastContainerId}
                      >
                        {idle.lastContainerId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Завершён в:</span>
                      <span className="font-mono text-green-400">
                        {idle.lastEndTime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Начало простоя:</span>
                      <span className="font-mono text-white/70">
                        {idle.idleStartTime.toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {idle.status !== "normal" &&
                    !downtimeReasons[`${idle.zone}_${idle.lastEndTime}`] && (
                      <div
                        className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg ${
                          idle.status === "critical"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-yellow-500/20 text-yellow-300"
                        }`}
                      >
                        <AlertTriangle size={14} />
                        <span className="text-xs font-bold uppercase">
                          {idle.status === "critical"
                            ? "Критический простой!"
                            : "Требуется внимание"}
                        </span>
                      </div>
                    )}

                  {/* Saved reason for active idle zone - prominent */}
                  {downtimeReasons[`${idle.zone}_${idle.lastEndTime}`] ? (
                    <div
                      className={`mt-3 flex items-start gap-3 px-4 py-3 rounded-xl border ${
                        downtimeReasons[`${idle.zone}_${idle.lastEndTime}`]
                          .reason === "Поставки закончились"
                          ? "bg-blue-500/10 border-blue-500/30"
                          : "bg-orange-500/10 border-orange-500/30"
                      }`}
                    >
                      <CheckCircle
                        size={16}
                        className={
                          downtimeReasons[`${idle.zone}_${idle.lastEndTime}`]
                            .reason === "Поставки закончились"
                            ? "text-blue-400 mt-0.5 shrink-0"
                            : "text-orange-400 mt-0.5 shrink-0"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-bold leading-snug ${
                            downtimeReasons[`${idle.zone}_${idle.lastEndTime}`]
                              .reason === "Поставки закончились"
                              ? "text-blue-300"
                              : "text-orange-300"
                          }`}
                        >
                          {
                            downtimeReasons[`${idle.zone}_${idle.lastEndTime}`]
                              .reason
                          }
                        </div>
                        {downtimeReasons[`${idle.zone}_${idle.lastEndTime}`]
                          .author && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <User
                              size={11}
                              className="text-white/40 shrink-0"
                            />
                            <span className="text-xs text-white/50 font-medium">
                              {
                                downtimeReasons[
                                  `${idle.zone}_${idle.lastEndTime}`
                                ].author
                              }
                            </span>
                          </div>
                        )}
                      </div>
                      {(userRole === "LOGISTIC" || userRole === "ADMIN") && (
                        <button
                          onClick={() =>
                            setEditingDowntime({
                              zone: idle.zone,
                              lastContainerId: idle.lastContainerId,
                              lastEndTime: idle.lastEndTime,
                              idleMinutes: idle.idleMinutes,
                              startTime: idle.lastEndTime,
                            })
                          }
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/30 hover:text-white shrink-0 transition-all"
                        >
                          <Edit3 size={11} />
                        </button>
                      )}
                    </div>
                  ) : userRole === "LOGISTIC" || userRole === "ADMIN" ? (
                    <button
                      onClick={() =>
                        setEditingDowntime({
                          zone: idle.zone,
                          lastContainerId: idle.lastContainerId,
                          lastEndTime: idle.lastEndTime,
                          idleMinutes: idle.idleMinutes,
                          startTime: idle.lastEndTime,
                        })
                      }
                      className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit3 size={12} /> Указать причину простоя
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Summary Cards */}
      {!initialLoading && zoneStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="text-red-400 w-5 h-5" />
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                Общий простой
              </span>
            </div>
            <div className="text-4xl font-black text-white tabular-nums">
              {formatMinutes(getTotalDowntime())}
            </div>
          </div>

          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="text-yellow-400 w-5 h-5" />
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                Средний простой
              </span>
            </div>
            <div className="text-4xl font-black text-white tabular-nums">
              {formatMinutes(getAverageDowntime())}
            </div>
          </div>

          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown className="text-blue-400 w-5 h-5" />
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                Всего зон
              </span>
            </div>
            <div className="text-4xl font-black text-white tabular-nums">
              {zoneStats.length}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - История простоев */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl flex-1 min-h-0 flex flex-col shadow-2xl overflow-hidden">
        {initialLoading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">
            Загрузка данных...
          </div>
        ) : zoneStats.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-4">
            <Clock size={64} strokeWidth={1} />
            <div className="text-xl font-bold">
              Нет исторических данных за эту дату
            </div>
            <p className="text-sm text-white/20">
              Выберите другую дату или дождитесь завершения работ
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="p-6">
              <h3 className="text-lg font-black text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock size={20} />
                История простоев
              </h3>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {zoneStats.map((stat, idx) => (
                <div
                  key={stat.zone}
                  className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden hover:bg-white/10 transition-all"
                >
                  <div
                    className="p-5 flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      setSelectedZone(
                        selectedZone === stat.zone ? null : stat.zone
                      )
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl ${
                          idx === 0
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : idx === 1
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {stat.zone}
                      </div>

                      <div>
                        <div className="text-sm text-white/40 font-bold uppercase tracking-wider">
                          Зона выгрузки
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-white/60 text-sm">
                            <span className="font-bold text-white">
                              {stat.downtimeCount}
                            </span>{" "}
                            простоев
                          </span>
                          <span className="text-white/30">•</span>
                          <span className="text-white/60 text-sm">
                            Среднее:{" "}
                            <span className="font-bold text-white">
                              {formatMinutes(stat.averageDowntimeMinutes)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-white/40 font-bold uppercase tracking-wider mb-1">
                        Общий простой
                      </div>
                      <div className="text-3xl font-black text-white tabular-nums">
                        {formatMinutes(stat.totalDowntimeMinutes)}
                      </div>
                    </div>
                  </div>

                  {selectedZone === stat.zone && (
                    <div className="border-t border-white/5 bg-black/20 p-5 animate-in slide-in-from-top-2 duration-200">
                      <div className="space-y-3">
                        {stat.records.map((record, rIdx) => {
                          const reasonKey = `${record.zone}_${record.endTime}`;
                          const savedReason = downtimeReasons[reasonKey];
                          const canEdit =
                            userRole === "LOGISTIC" || userRole === "ADMIN";
                          return (
                            <div
                              key={rIdx}
                              className="flex flex-col p-4 bg-white/5 rounded-xl border border-white/5 gap-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                  <div>
                                    <div className="text-xs text-white/40 mb-1">
                                      Завершил
                                    </div>
                                    <div className="font-mono text-white font-bold">
                                      {record.containerId}
                                    </div>
                                    <div className="text-xs text-green-400 font-mono mt-0.5">
                                      {record.endTime}
                                    </div>
                                  </div>

                                  <div className="text-white/20">→</div>

                                  <div>
                                    <div className="text-xs text-white/40 mb-1">
                                      Начал
                                    </div>
                                    <div className="font-mono text-white font-bold">
                                      {record.nextContainerId}
                                    </div>
                                    <div className="text-xs text-blue-400 font-mono mt-0.5">
                                      {record.nextStartTime}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="text-right">
                                    <div className="text-xs text-white/40 mb-1">
                                      Простой
                                    </div>
                                    <div
                                      className={`text-2xl font-black tabular-nums ${
                                        record.downtimeMinutes > 30
                                          ? "text-red-400"
                                          : record.downtimeMinutes > 15
                                          ? "text-yellow-400"
                                          : "text-green-400"
                                      }`}
                                    >
                                      {formatMinutes(record.downtimeMinutes)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Reason display - prominent */}
                              {savedReason ? (
                                <div
                                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
                                    savedReason.reason ===
                                    "Поставки закончились"
                                      ? "bg-blue-500/10 border-blue-500/30"
                                      : "bg-orange-500/10 border-orange-500/30"
                                  }`}
                                >
                                  <CheckCircle
                                    size={16}
                                    className={
                                      savedReason.reason ===
                                      "Поставки закончились"
                                        ? "text-blue-400 mt-0.5 shrink-0"
                                        : "text-orange-400 mt-0.5 shrink-0"
                                    }
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className={`text-sm font-bold leading-snug ${
                                        savedReason.reason ===
                                        "Поставки закончились"
                                          ? "text-blue-300"
                                          : "text-orange-300"
                                      }`}
                                    >
                                      {savedReason.reason}
                                    </div>
                                    {savedReason.author && (
                                      <div className="flex items-center gap-1.5 mt-1.5">
                                        <User
                                          size={11}
                                          className="text-white/40 shrink-0"
                                        />
                                        <span className="text-xs text-white/50 font-medium">
                                          {savedReason.author}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {canEdit && (
                                    <button
                                      onClick={() =>
                                        setEditingDowntime({
                                          zone: record.zone,
                                          lastContainerId: record.containerId,
                                          lastEndTime: record.endTime,
                                          idleMinutes: record.downtimeMinutes,
                                          startTime: record.endTime,
                                          isHistorical: true,
                                          nextContainerId:
                                            record.nextContainerId,
                                          nextStartTime: record.nextStartTime,
                                        })
                                      }
                                      title="Изменить причину"
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/30 hover:text-white shrink-0 transition-all"
                                    >
                                      <Edit3 size={11} />
                                    </button>
                                  )}
                                </div>
                              ) : canEdit ? (
                                <button
                                  onClick={() =>
                                    setEditingDowntime({
                                      zone: record.zone,
                                      lastContainerId: record.containerId,
                                      lastEndTime: record.endTime,
                                      idleMinutes: record.downtimeMinutes,
                                      startTime: record.endTime,
                                      isHistorical: true,
                                      nextContainerId: record.nextContainerId,
                                      nextStartTime: record.nextStartTime,
                                    })
                                  }
                                  className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-2 ${
                                    record.downtimeMinutes >= 20
                                      ? "bg-orange-500/10 text-orange-400 border-orange-500/25 hover:bg-orange-500/20"
                                      : "bg-white/5 text-white/30 border-white/5 hover:bg-white/10"
                                  }`}
                                >
                                  <Edit3 size={11} />
                                  Указать причину
                                  {record.downtimeMinutes >= 20 ? " ⚠" : ""}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default ZoneDowntimeView;
