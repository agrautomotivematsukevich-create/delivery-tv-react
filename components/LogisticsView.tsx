import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TaskInput, PlanRow, TranslationSet } from '../types';
import { Truck, Plus, Trash2, Save, Calendar, Pencil, X, Check, Clipboard } from 'lucide-react';

interface LogisticsViewProps {
  t: TranslationSet;
}

const LogisticsView: React.FC<LogisticsViewProps> = ({ t }) => {
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  
  // Shared
  const [date, setDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] // Default to tomorrow
  );
  
  // CREATE MODE State
  const emptyRow: TaskInput = { id: '', lot: '', ws: 'BS', pallets: '', phone: '', eta: '09:00' };
  const [createRows, setCreateRows] = useState<TaskInput[]>([emptyRow]);
  const [submitting, setSubmitting] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // EDIT MODE State
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanRow | null>(null);

  // === SMART PASTE LOGIC ===
  const handleProcessPaste = () => {
    if (!pasteText.trim()) return;

    const rows = pasteText.trim().split(/\r?\n/);
    const newTasks: TaskInput[] = rows.map(line => {
      const cols = line.split('\t').map(c => c.trim());
      
      // Если колонок мало, возможно разделитель другой (например точка с запятой)
      const data = cols.length > 1 ? cols : line.split(';').map(c => c.trim());

      // Простая логика распределения (можно подстроить под структуру их Excel)
      // Допустим порядок: Лот, W/S, Паллеты, ID, Телефон, ETA
      return {
        lot: data[0] || '',
        ws: (['BS', 'AS', 'PS'].includes(data[1]?.toUpperCase()) ? data[1].toUpperCase() : 'BS') as any,
        pallets: data[2] || '',
        id: data[3]?.toUpperCase() || '',
        phone: data[4] || '',
        eta: data[5] || '09:00'
      };
    }).filter(task => task.id || task.lot); // Убираем совсем пустые строки

    if (newTasks.length > 0) {
      // Если в таблице была только одна пустая строка, заменяем её
      if (createRows.length === 1 && !createRows[0].id && !createRows[0].lot) {
        setCreateRows(newTasks);
      } else {
        setCreateRows([...createRows, ...newTasks]);
      }
    }

    setPasteText('');
    setIsPasteModalOpen(false);
  };

  // === CREATE MODE LOGIC ===
  const addCreateRow = () => setCreateRows([...createRows, { ...emptyRow }]);
  
  const removeCreateRow = (idx: number) => {
    if (createRows.length > 1) setCreateRows(createRows.filter((_, i) => i !== idx));
    else setCreateRows([emptyRow]);
  };

  const updateCreateRow = (idx: number, field: keyof TaskInput, value: string) => {
    const newRows = [...createRows];
    newRows[idx] = { ...newRows[idx], [field]: value };
    setCreateRows(newRows);
  };

  const handleSubmitCreate = async () => {
    if (createRows.some(r => !r.id)) {
      alert("Заполните ID контейнеров во всех строках");
      return;
    }
    setSubmitting(true);
    const [y, m, day] = date.split('-');
    const formattedDate = `${day}.${m}`;
    const success = await api.createPlan(formattedDate, createRows);
    setSubmitting(false);
    if (success) {
      alert(t.log_success);
      setCreateRows([{ ...emptyRow }]);
    } else {
      alert("Ошибка при создании плана");
    }
  };

  // === EDIT MODE LOGIC ===
  const loadPlan = async () => {
    setLoadingPlan(true);
    const [y, m, day] = date.split('-');
    const formattedDate = `${day}.${m}`;
    const data = await api.fetchFullPlan(formattedDate);
    setPlanRows(data);
    setLoadingPlan(false);
  };

  useEffect(() => {
    if (mode === 'edit') {
      loadPlan();
    }
  }, [mode, date]);

  const handleEditSave = async () => {
    if (!editingItem) return;
    setSubmitting(true);
    const [y, m, day] = date.split('-');
    const formattedDate = `${day}.${m}`;
    
    const success = await api.updatePlanRow(formattedDate, editingItem);
    setSubmitting(false);
    
    if (success) {
      setEditingItem(null);
      loadPlan();
    } else {
      alert("Ошибка при обновлении");
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
      
      {/* Top Card */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl shrink-0">
         <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
               <h2 className="text-2xl font-extrabold text-white flex items-center gap-3">
                 <Truck className="text-accent-purple" size={32} />
                 {t.log_title}
               </h2>
               
               <div className="bg-white/5 rounded-full p-1 border border-white/10 flex">
                  <button 
                    onClick={() => setMode('create')}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${mode === 'create' ? 'bg-accent-purple text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                  >
                    {t.log_mode_create}
                  </button>
                  <button 
                    onClick={() => setMode('edit')}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${mode === 'edit' ? 'bg-accent-purple text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                  >
                    {t.log_mode_edit}
                  </button>
               </div>
            </div>

            <div className="flex items-center gap-3 bg-white/5 rounded-xl p-2 border border-white/10 w-full lg:w-auto">
              <Calendar className="text-white/50 ml-2" size={20} />
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-white font-mono text-lg outline-none border-none [color-scheme:dark] p-2 w-full lg:w-auto"
              />
            </div>
         </div>
      </div>

      {/* Main Content */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-8 flex-1 min-h-0 flex flex-col shadow-2xl relative overflow-hidden">
        
        {mode === 'create' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <div className="text-xs font-bold text-white/30 uppercase tracking-[2px]">Список новых поставок</div>
              <button 
                onClick={() => setIsPasteModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-accent-purple text-sm font-bold transition-all"
              >
                <Clipboard size={16} /> Импорт из таблицы
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4">
              <div className="grid grid-cols-[40px_100px_80px_100px_1fr_120px_80px_40px] gap-4 mb-2 text-[10px] font-bold text-white/30 uppercase tracking-widest px-2 min-w-[800px]">
                  <div className="flex items-center justify-center">#</div>
                  <div>{t.log_lot}</div>
                  <div>{t.log_ws}</div>
                  <div>{t.log_pallets}</div>
                  <div>{t.log_id}</div>
                  <div>{t.log_phone}</div>
                  <div>{t.log_eta}</div>
                  <div></div>
              </div>
              
              <div className="space-y-2 min-w-[800px]">
                {createRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[40px_100px_80px_100px_1fr_120px_80px_40px] gap-4 items-center bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors">
                      <div className="text-white/30 font-mono text-center">{idx + 1}</div>
                      <input type="text" value={row.lot} onChange={(e) => updateCreateRow(idx, 'lot', e.target.value)} placeholder="Лот..." className="bg-transparent border-b border-white/10 text-white text-sm focus:border-accent-purple outline-none w-full" />
                      <div className="relative">
                        <input list={`ws-options-${idx}`} value={row.ws} onChange={(e) => updateCreateRow(idx, 'ws', e.target.value)} className="bg-black/20 border border-white/10 rounded text-white text-sm p-1 w-full text-center uppercase font-bold" />
                        <datalist id={`ws-options-${idx}`}><option value="BS" /><option value="AS" /><option value="PS" /></datalist>
                      </div>
                      <input type="text" value={row.pallets} onChange={(e) => updateCreateRow(idx, 'pallets', e.target.value)} placeholder="24 EU" className="bg-transparent border-b border-white/10 text-white text-sm focus:border-accent-purple outline-none w-full" />
                      <input type="text" value={row.id} onChange={(e) => updateCreateRow(idx, 'id', e.target.value)} placeholder="WSDU..." className="bg-transparent border-b border-white/10 text-white font-mono font-bold focus:border-accent-purple outline-none w-full uppercase" />
                      <input type="text" value={row.phone} onChange={(e) => updateCreateRow(idx, 'phone', e.target.value)} placeholder="89..." className="bg-transparent border-b border-white/10 text-white text-sm focus:border-accent-purple outline-none w-full" />
                      <input type="time" value={row.eta} onChange={(e) => updateCreateRow(idx, 'eta', e.target.value)} className="bg-transparent border-b border-white/10 text-white text-sm focus:border-accent-purple outline-none w-full [color-scheme:dark]" />
                      <button onClick={() => removeCreateRow(idx)} className="text-white/20 hover:text-accent-red transition-colors flex justify-center"><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
              
              <button onClick={addCreateRow} className="mt-6 w-full py-3 border border-dashed border-white/20 rounded-xl text-white/50 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest">
                <Plus size={16} /> {t.log_add_row}
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-white/10 flex justify-end">
              <button onClick={handleSubmitCreate} disabled={submitting} className="px-8 py-4 bg-accent-purple hover:bg-accent-purple/90 text-white font-bold rounded-2xl shadow-lg shadow-accent-purple/20 transition-all flex items-center gap-3 disabled:opacity-50 active:scale-[0.98]">
                {submitting ? '...' : <><Save size={20} /> {t.log_submit}</>}
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <div className="flex-1 flex flex-col min-h-0">
             {loadingPlan ? (
               <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">Загрузка...</div>
             ) : planRows.length === 0 ? (
               <div className="flex-1 flex items-center justify-center text-white/30">{t.log_no_data}</div>
             ) : (
               <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#16161d] z-10 shadow-md">
                      <tr>
                        {['#', t.log_lot, t.log_ws, t.log_pallets, t.log_id, t.log_phone, t.log_eta, ''].map((h, i) => (
                          <th key={i} className="p-4 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/10">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planRows.map((row) => (
                        <tr key={row.rowIndex} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                           <td className="p-4 font-mono text-white/50">{row.index}</td>
                           <td className="p-4 text-white">{row.lot}</td>
                           <td className="p-4"><span className="px-2 py-1 bg-white/10 rounded text-xs font-bold">{row.ws}</span></td>
                           <td className="p-4 text-white">{row.pallets}</td>
                           <td className="p-4 font-mono font-bold text-white">{row.id}</td>
                           <td className="p-4 text-white/70 text-sm">{row.phone}</td>
                           <td className="p-4 font-mono text-accent-purple">{row.eta}</td>
                           <td className="p-4 text-right">
                              <button 
                                onClick={() => setEditingItem(row)}
                                className="p-2 bg-white/5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                              >
                                <Pencil size={16} />
                              </button>
                           </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
             )}
          </div>
        )}
      </div>

      {/* PASTE MODAL */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-[#121217] border border-white/10 p-8 rounded-3xl w-full max-w-2xl shadow-2xl">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-extrabold text-white">Умный импорт</h3>
                  <p className="text-sm text-white/40 mt-1">Скопируйте таблицу в Excel и вставьте её сюда (Ctrl+V)</p>
                </div>
                <button onClick={() => setIsPasteModalOpen(false)} className="text-white/50 hover:text-white"><X /></button>
             </div>
             
             <textarea 
               value={pasteText}
               onChange={(e) => setPasteText(e.target.value)}
               placeholder="Вставьте данные здесь..."
               className="w-full h-64 bg-black/40 border border-white/5 rounded-2xl p-4 text-white font-mono text-sm focus:border-accent-purple outline-none resize-none custom-scrollbar"
             />

             <div className="flex gap-4 mt-6">
                <button 
                  onClick={handleProcessPaste}
                  className="flex-1 py-4 bg-accent-purple text-white font-bold rounded-2xl hover:bg-accent-purple/90 transition-all flex items-center justify-center gap-2"
                >
                  <Check size={20} /> Распознать и добавить
                </button>
                <button 
                  onClick={() => setIsPasteModalOpen(false)}
                  className="px-8 py-4 border border-white/10 text-white/70 rounded-2xl hover:bg-white/5"
                >
                  Отмена
                </button>
             </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col gap-6">
               <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h3 className="text-xl font-extrabold text-white">{t.log_edit_title}</h3>
                  <button onClick={() => setEditingItem(null)} className="text-white/50 hover:text-white"><X /></button>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                     <label className="text-xs font-bold text-white/40 mb-1 block">{t.log_lot}</label>
                     <input type="text" value={editingItem.lot} onChange={e => setEditingItem({...editingItem, lot: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-accent-purple outline-none" />
                  </div>
                  <div className="col-span-1">
                     <label className="text-xs font-bold text-white/40 mb-1 block">{t.log_ws}</label>
                     <input type="text" value={editingItem.ws} onChange={e => setEditingItem({...editingItem, ws: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-accent-purple outline-none uppercase" />
                  </div>
                  <div className="col-span-2">
                     <label className="text-xs font-bold text-white/40 mb-1 block">{t.log_id}</label>
                     <input type="text" value={editingItem.id} onChange={e => setEditingItem({...editingItem, id: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white font-mono font-bold focus:border-accent-purple outline-none uppercase" />
                  </div>
                  <div className="col-span-1">
                     <label className="text-xs font-bold text-white/40 mb-1 block">{t.log_pallets}</label>
                     <input type="text" value={editingItem.pallets} onChange={e => setEditingItem({...editingItem, pallets: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-accent-purple outline-none" />
                  </div>
                  <div className="col-span-1">
                     <label className="text-xs font-bold text-white/40 mb-1 block">{t.log_eta}</label>
                     <input type="time" value={editingItem.eta} onChange={e => setEditingItem({...editingItem, eta: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-accent-purple outline-none [color-scheme:dark]" />
                  </div>
                  <div className="col-span-2">
                     <label className="text-xs font-bold text-white/40 mb-1 block">{t.log_phone}</label>
                     <input type="text" value={editingItem.phone} onChange={e => setEditingItem({...editingItem, phone: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-accent-purple outline-none" />
                  </div>
               </div>

               <div className="flex gap-3 mt-2">
                  <button 
                    onClick={handleEditSave}
                    disabled={submitting}
                    className="flex-1 py-3 bg-accent-purple hover:bg-accent-purple/90 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    {submitting ? '...' : <><Check size={18} /> {t.log_btn_save}</>}
                  </button>
                  <button onClick={() => setEditingItem(null)} className="px-6 py-3 border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-white/5">
                    {t.btn_cancel}
                  </button>
               </div>
            </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default LogisticsView;