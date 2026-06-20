import React, { useEffect, useMemo, useState } from 'react';
import { DashboardData, Task, TranslationSet } from '../types';
import { calculateShiftFact, calculateShiftTargets, calculateTimeDiff, currentShift, ShiftName } from '../utils/business';
import { elapsedMin } from '../utils/time';
import { AVAILABLE_ZONES, UNLOAD_TARGET } from '../utils/zones';

interface TvCommandCenterLightProps {
  data: DashboardData | null;
  allTasks: Task[];
  isTasksLoading: boolean;
  t: TranslationSet;
}

const ARTBOARD_W = 1920;
const ARTBOARD_H = 1080;
const BIG_CIRC = 2 * Math.PI * 130;
const SMALL_CIRC = 2 * Math.PI * 50;

type Tone = 'ok' | 'warn' | 'over';

function useTvScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const next = Math.min(window.innerWidth / ARTBOARD_W, window.innerHeight / ARTBOARD_H);
      if (Number.isFinite(next) && next > 0) setScale(next);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return scale;
}

function useClock() {
  const read = () => {
    const now = new Date();
    return {
      clock: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      dateBig: now.toLocaleDateString('ru-RU', { weekday: 'long' }).toUpperCase(),
      dateSmall: now.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase(),
    };
  };
  const [value, setValue] = useState(read);

  useEffect(() => {
    const id = setInterval(() => setValue(read()), 30000);
    return () => clearInterval(id);
  }, []);

  return value;
}

function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function shiftFraction(shift: ShiftName, minuteOfDay: number): number {
  if (shift === 'morning') return (minuteOfDay - 470) / 540;
  if (shift === 'evening') {
    const adjusted = minuteOfDay < 110 ? minuteOfDay + 1440 : minuteOfDay;
    return (adjusted - 1010) / 540;
  }
  if (shift === 'night') return (minuteOfDay - 110) / 360;
  return 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function waitTone(minutes: number): Tone {
  if (minutes >= 60) return 'over';
  if (minutes >= 30) return 'warn';
  return 'ok';
}

function elapsedTone(minutes: number): Tone {
  if (minutes > UNLOAD_TARGET) return 'over';
  if (minutes >= UNLOAD_TARGET - 5) return 'warn';
  return 'ok';
}

function toneColor(tone: Tone): string {
  if (tone === 'over') return '#dc2626';
  if (tone === 'warn') return '#d97706';
  return '#059669';
}

function statusLabel(status?: string): string {
  if (status === 'ACTIVE') return 'В РАБОТЕ';
  if (status === 'PAUSE') return 'ПАУЗА';
  return 'ОЖИДАНИЕ';
}

function shiftLabel(shift: ShiftName): string {
  if (shift === 'morning') return 'УТРО';
  if (shift === 'evening') return 'ВЕЧЕР';
  if (shift === 'night') return 'НОЧЬ';
  return 'СМЕНА';
}

function formatNextDelay(time: string | undefined, t: TranslationSet): string {
  if (!time?.trim()) return 'НЕТ ETA';
  return calculateTimeDiff(time, t).toUpperCase();
}

const Kicker: React.FC<{ accent?: string; children: React.ReactNode }> = ({ accent = '#059669', children }) => (
  <div className="tv3-kicker"><span style={{ color: accent }}>//</span> {children}</div>
);

const ClockIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const TruckIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" />
    <path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1" />
    <circle cx="7.5" cy="18.5" r="2.5" />
    <circle cx="17.5" cy="18.5" r="2.5" />
  </svg>
);

const TvCommandCenterLight: React.FC<TvCommandCenterLightProps> = ({ data, allTasks, isTasksLoading, t }) => {
  const scale = useTvScale();
  const clock = useClock();
  const [minuteOfDay, setMinuteOfDay] = useState(nowMinutes);

  useEffect(() => {
    const id = setInterval(() => setMinuteOfDay(nowMinutes()), 30000);
    return () => clearInterval(id);
  }, []);

  const model = useMemo(() => {
    const safeData: DashboardData = data ?? {
      status: 'WAIT',
      done: 0,
      total: 0,
      nextId: '',
      nextTime: '',
      activeList: [],
      onTerritory: 0,
      shiftCounts: { morning: 0, evening: 0, night: 0 },
      shiftFacts: { morning: 0, evening: 0, night: 0 },
      shiftTargets: { morning: 0, evening: 0, night: 0 },
    };

    const activeShift = currentShift();
    const facts = allTasks.length > 0 ? calculateShiftFact(allTasks) : { ...safeData.shiftFacts, none: 0 };
    const targets = allTasks.length > 0 ? calculateShiftTargets(allTasks, facts, activeShift) : { ...safeData.shiftTargets, none: 0 };
    const percent = safeData.total > 0 ? Math.round((safeData.done / safeData.total) * 100) : 0;

    const territoryTasks = allTasks
      .filter((task) =>
        task.arrival_time?.trim() &&
        !task.start_time?.trim() &&
        !task.end_time?.trim()
      )
      .map((task) => ({
        id: task.id,
        time: task.arrival_time || '',
        wait: elapsedMin(task.arrival_time || ''),
      }))
      .sort((a, b) => b.wait - a.wait);

    const activeCards = safeData.activeList
      .map((item) => ({
        id: item.id,
        zone: item.zone || '—',
        start: item.start,
        elapsed: elapsedMin(item.start),
      }))
      .sort((a, b) => b.elapsed - a.elapsed);

    const zoneMap = new Map<string, { id: string; elapsed: number }>();
    for (const item of safeData.activeList) {
      if (!item.zone) continue;
      zoneMap.set(item.zone, { id: item.id, elapsed: elapsedMin(item.start) });
    }

    const zones = AVAILABLE_ZONES.map((name) => {
      const task = zoneMap.get(name);
      if (!task) return { name, busy: false as const };
      return { name, busy: true as const, id: task.id, elapsed: task.elapsed, tone: elapsedTone(task.elapsed) };
    });

    const normTarget = activeShift !== 'none' ? targets[activeShift] || 0 : 0;
    const normDone = activeShift !== 'none' ? facts[activeShift] || 0 : 0;
    const fraction = Math.max(0, Math.min(1, shiftFraction(activeShift, minuteOfDay)));
    const expected = Math.round(normTarget * fraction);
    const delta = normDone - expected;
    const normStatus = normTarget > 0 && normDone >= normTarget
      ? 'НОРМА'
      : delta >= 1
        ? 'ОПЕРЕЖАЕМ'
        : delta <= -2
          ? 'ОТСТАЕМ'
          : 'В ГРАФИКЕ';

    return {
      safeData,
      percent,
      progressOffset: BIG_CIRC * (1 - Math.max(0, Math.min(1, percent / 100))),
      activeShift,
      facts,
      targets,
      normTarget,
      normDone,
      normStatus,
      normPct: normTarget > 0 ? clampPercent((normDone / normTarget) * 100) : normDone > 0 ? 100 : 0,
      normMark: normTarget > 0 ? clampPercent(fraction * 100) : 0,
      territoryCount: Math.max(territoryTasks.length, safeData.onTerritory || 0),
      territoryCards: territoryTasks.slice(0, 3),
      activeCards: activeCards.slice(0, 4),
      activeCount: safeData.activeList.length,
      zones,
      busyCount: zones.filter((zone) => zone.busy).length,
    };
  }, [allTasks, data, minuteOfDay]);

  const shiftCards = (['morning', 'evening', 'night'] as const).map((key) => {
    const isActive = key === model.activeShift;
    const accent = key === 'morning' ? '#d97706' : key === 'evening' ? '#ea580c' : '#4f46e5';
    const tintBg = key === 'morning' ? '#fffbeb' : key === 'evening' ? '#fff7ed' : '#eef2ff';
    const tintBd = key === 'morning' ? '#fde68a' : key === 'evening' ? '#fed7aa' : '#c7d2fe';
    const count = model.facts[key] || 0;
    const target = model.targets[key] || 0;
    return {
      key,
      label: shiftLabel(key),
      count,
      target,
      fillPct: target > 0 ? Math.max(4, Math.min(100, (count / target) * 100)) : 0,
      accent,
      isActive,
      style: isActive ? { background: tintBg, borderColor: tintBd } : undefined,
    };
  });

  return (
    <div className="tv3-root">
      <div className="tv3-stage" style={{ transform: `scale(${scale})` }}>
        <div className="tv3-row tv3-row--top">
          <section className="tv3-card tv3-hero">
            <div className="tv3-hero-orb" />
            <div className="tv3-hero-head">
              <Kicker>СЛЕДУЮЩИЙ КОНТЕЙНЕР</Kicker>
              <div className="tv3-live-cluster">
                <div className="tv3-live-pill"><span />LIVE</div>
                <div className="tv3-clock">{clock.clock}</div>
                <div className="tv3-date">
                  <div>{clock.dateBig}</div>
                  <span>{clock.dateSmall}</span>
                </div>
              </div>
            </div>

            <div className="tv3-next">
              <div className="tv3-next-id">{model.safeData.nextId || 'НЕТ ДАННЫХ'}</div>
              <div className="tv3-next-delay">
                <ClockIcon />
                <span>{formatNextDelay(model.safeData.nextTime, t)}</span>
              </div>
            </div>

            <div className="tv3-territory">
              <div className="tv3-territory-head">
                <div className="tv3-territory-label">
                  <TruckIcon />
                  <span>НА ТЕРРИТОРИИ — ОЖИДАЮТ ВЫГРУЗКИ</span>
                </div>
                <span className="tv3-territory-count">{model.territoryCount}</span>
              </div>
              <div className="tv3-territory-list">
                {model.territoryCards.length > 0 ? model.territoryCards.map((task) => {
                  const tone = waitTone(task.wait);
                  return (
                    <div className="tv3-territory-item" key={task.id}>
                      <div>{task.id}</div>
                      <div>
                        <span>{task.time}</span>
                        <strong className={`tv3-wait tv3-wait--${tone}`}>{task.wait} мин</strong>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="tv3-empty-line">НЕТ МАШИН В ОЖИДАНИИ</div>
                )}
              </div>
            </div>
          </section>

          <section className="tv3-card tv3-progress">
            <div className="tv3-card-head">
              <Kicker>ПРОГРЕСС</Kicker>
              <div className="tv3-status"><span />{statusLabel(model.safeData.status)}</div>
            </div>

            <div className="tv3-progress-ring">
              <svg width="282" height="282" viewBox="0 0 300 300">
                <circle cx="150" cy="150" r="130" fill="none" stroke="#eef1f5" strokeWidth="18" />
                <circle cx="150" cy="150" r="130" fill="none" stroke="#10b981" strokeWidth="18" strokeLinecap="round" strokeDasharray={BIG_CIRC.toFixed(1)} strokeDashoffset={model.progressOffset.toFixed(1)} />
              </svg>
              <div>
                <strong>{model.percent}%</strong>
                <span>{model.safeData.done} <em>/</em> {model.safeData.total}</span>
              </div>
            </div>

            <div className="tv3-norm">
              <div className="tv3-norm-top">
                <div><strong>{model.normDone}</strong><span>/ {model.normTarget}</span></div>
                <div><span>НОРМА СМЕНЫ</span><strong>{isTasksLoading ? 'ОБНОВЛЕНИЕ' : model.normStatus}</strong></div>
              </div>
              <div className="tv3-norm-bar">
                <span style={{ width: `${model.normPct}%` }} />
                <i style={{ left: `${model.normMark}%` }} />
              </div>
            </div>
          </section>

          <section className="tv3-card tv3-shifts">
            <Kicker>ПО СМЕНАМ</Kicker>
            <div className="tv3-shift-grid">
              {shiftCards.map((shift) => (
                <div className="tv3-shift-card" key={shift.key} style={shift.style}>
                  <div style={{ color: shift.isActive ? shift.accent : '#94a3b8' }}>{shift.label}</div>
                  <div className="tv3-shift-gauge">
                    <span>
                      <i
                        style={{
                          height: `${shift.fillPct}%`,
                          background: shift.isActive ? shift.accent : '#cbd5e1',
                          boxShadow: shift.isActive ? `0 2px 10px ${shift.accent}66` : 'none',
                        }}
                      />
                    </span>
                  </div>
                  <div className="tv3-shift-count">
                    <strong style={{ color: shift.isActive ? shift.accent : '#cbd5e1' }}>{shift.count}</strong>
                    <span>/ {shift.target}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="tv3-row tv3-row--bottom">
          <section className="tv3-card tv3-active">
            <div className="tv3-card-head tv3-card-head--spaced">
              <Kicker>АКТИВНЫЕ — В РАБОТЕ</Kicker>
              <span className="tv3-active-total">{model.activeCount} В РАБОТЕ</span>
            </div>
            <div className="tv3-active-list">
              {model.activeCards.length > 0 ? model.activeCards.map((item) => {
                const tone = elapsedTone(item.elapsed);
                const color = toneColor(tone);
                const frac = Math.min(1, item.elapsed / UNLOAD_TARGET);
                const isOver = tone === 'over';
                return (
                  <div className={`tv3-active-card ${isOver ? 'tv3-active-card--over' : ''}`} key={`${item.zone}-${item.id}`}>
                    <div className="tv3-active-head">
                      <span>{item.zone}</span>
                      <em style={{ color }}>{isOver ? 'ПРЕВЫШЕН' : 'АКТИВНО'}</em>
                    </div>
                    <div className="tv3-active-mid">
                      <div className="tv3-small-ring">
                        <svg width="120" height="120" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="#eef1f5" strokeWidth="9" />
                          <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={SMALL_CIRC.toFixed(1)} strokeDashoffset={(SMALL_CIRC * (1 - frac)).toFixed(1)} />
                        </svg>
                        <div><strong style={{ color }}>{isOver ? `+${item.elapsed - UNLOAD_TARGET}` : Math.max(0, UNLOAD_TARGET - item.elapsed)}</strong><span>МИН</span></div>
                      </div>
                      <strong>{item.id}</strong>
                    </div>
                    <div className="tv3-active-start"><span>НАЧАЛО</span><strong>{item.start}</strong></div>
                  </div>
                );
              }) : (
                <div className="tv3-empty-line tv3-empty-line--active">НЕТ АКТИВНЫХ КОНТЕЙНЕРОВ</div>
              )}
            </div>
          </section>

          <section className="tv3-card tv3-zones">
            <div className="tv3-card-head tv3-card-head--spaced">
              <Kicker>ЗОНЫ ВЫГРУЗКИ</Kicker>
              <span className="tv3-zone-total"><strong>{model.busyCount}</strong> <em>/</em> {AVAILABLE_ZONES.length}</span>
            </div>
            <div className="tv3-zone-grid">
              {model.zones.map((zone) => {
                if (!zone.busy) {
                  return (
                    <div className="tv3-zone-card" key={zone.name}>
                      <div className="tv3-zone-name tv3-zone-name--free"><span />{zone.name}</div>
                      <div className="tv3-zone-free">СВОБОДНО</div>
                    </div>
                  );
                }
                const color = toneColor(zone.tone);
                const isOver = zone.tone === 'over';
                const barPct = Math.min(100, Math.round((zone.elapsed / UNLOAD_TARGET) * 100));
                return (
                  <div className={`tv3-zone-card tv3-zone-card--busy ${isOver ? 'tv3-zone-card--over' : ''}`} key={zone.name}>
                    <div className="tv3-zone-row">
                      <div className="tv3-zone-name" style={{ color: isOver ? '#b91c1c' : '#047857' }}>
                        <span style={{ background: color, boxShadow: `0 0 0 4px ${isOver ? 'rgba(220,38,38,0.13)' : 'rgba(5,150,105,0.13)'}` }} />
                        {zone.name}
                      </div>
                      <em style={{ color, borderColor: isOver ? '#fecaca' : '#a7f3d0', background: isOver ? '#fef2f2' : '#ecfdf5' }}>{isOver ? 'ПРЕВЫШЕН' : 'АКТИВНО'}</em>
                    </div>
                    <div className="tv3-zone-body">
                      <span>{zone.id}</span>
                      <div><strong style={{ color }}>{isOver ? `+${zone.elapsed - UNLOAD_TARGET}` : Math.max(0, UNLOAD_TARGET - zone.elapsed)}</strong><em>МИН</em></div>
                    </div>
                    <div className="tv3-zone-bar"><span style={{ width: `${barPct}%`, background: color }} /></div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TvCommandCenterLight;
