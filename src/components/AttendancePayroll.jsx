// src/components/AttendancePayroll.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db, appId } from '../lib/firebase';
import {
  Users, Calendar, DollarSign, BarChart2, Plus, Edit2, Trash2, Save, X,
  ChevronLeft, ChevronRight, Settings, RefreshCw, TrendingUp, CreditCard,
  Clock, AlertCircle, CheckCircle2, Activity
} from 'lucide-react';

// ─── Firestore helper ──────────────────────────────────────────────────────────
const COLL = (name) =>
  db.collection('artifacts').doc(appId).collection('public').doc('data').collection(name);

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  present:      { abbr: 'P',  label: 'Present',    bg: 'bg-green-500',  text: 'text-white',       effectiveDays: 1 },
  absent:       { abbr: 'A',  label: 'Absent',     bg: 'bg-red-500',    text: 'text-white',       effectiveDays: 0 },
  half_day:     { abbr: 'H',  label: 'Half Day',   bg: 'bg-yellow-400', text: 'text-yellow-900',  effectiveDays: 0.5 },
  late_arrival: { abbr: 'LA', label: 'Late',       bg: 'bg-orange-400', text: 'text-white',       effectiveDays: null },
  left_early:   { abbr: 'LE', label: 'Left Early', bg: 'bg-purple-400', text: 'text-white',       effectiveDays: null },
  ot:           { abbr: 'OT', label: 'OT',         bg: 'bg-blue-500',   text: 'text-white',       effectiveDays: 1 },
  holiday:      { abbr: 'Ho', label: 'Holiday',    bg: 'bg-slate-300',  text: 'text-slate-700',   effectiveDays: 0 },
  week_off:     { abbr: 'WO', label: 'Week Off',   bg: 'bg-slate-400',  text: 'text-white',       effectiveDays: 0 },
};
const STATUS_KEYS = Object.keys(STATUS);

// ─── Helpers ───────────────────────────────────────────────────────────────────
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getDayName = (year, month, day) => ['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(year, month, day).getDay()];
const isWeekend = (year, month, day) => { const d = new Date(year, month, day).getDay(); return d === 0 || d === 6; };

const fmt = (n) => '₹' + (Math.round(n || 0)).toLocaleString('en-IN');
const fmtN = (n, dec = 2) => (n || 0).toFixed(dec);

const parseYM = (ym) => { const [y, m] = ym.split('-').map(Number); return { year: y, month: m - 1 }; };
const todayYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const prevMonth = (ym) => { const { year, month } = parseYM(ym); const d = new Date(year, month - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nextMonth = (ym) => { const { year, month } = parseYM(ym); const d = new Date(year, month + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const getCurrentSalary = (emp) => {
  if (!emp) return 0;
  return (emp.baseSalary || 0) + (emp.incrementHistory || []).reduce((s, i) => s + (i.amount || 0), 0);
};

const getAdvanceBalance = (advances, empId) =>
  advances.filter(a => a.employeeId === empId).reduce((bal, a) => a.type === 'advance' ? bal + (a.amount || 0) : bal - (a.amount || 0), 0);

// shared input & label classes
const inp = (extra = '') => `w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none ${extra}`;
const lbl = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

// ─── Month Picker ──────────────────────────────────────────────────────────────
function MonthPicker({ value, onChange }) {
  const { year, month } = parseYM(value);
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(prevMonth(value))} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 w-32 text-center">
        {MONTHS_LONG[month]} {year}
      </span>
      <button onClick={() => onChange(nextMonth(value))} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Employee Modal ────────────────────────────────────────────────────────────
function EmployeeModal({ emp, onClose }) {
  const isNew = !emp?.id;
  const [form, setForm] = useState({
    name: emp?.name || '',
    department: emp?.department || '',
    joiningDate: emp?.joiningDate || '',
    baseSalary: emp?.baseSalary ?? '',
    shiftHours: emp?.shiftHours ?? 9,
    ptType: emp?.ptType || 'fixed',
    ptAmount: emp?.ptAmount ?? 200,
    incrementHistory: emp?.incrementHistory || [],
  });
  const [newIncDate, setNewIncDate] = useState('');
  const [newIncAmt, setNewIncAmt] = useState('');
  const [saving, setSaving] = useState(false);

  const addIncrement = () => {
    if (!newIncDate || !newIncAmt) return;
    setForm(f => ({
      ...f,
      incrementHistory: [...f.incrementHistory, { date: newIncDate, amount: Number(newIncAmt) }]
        .sort((a, b) => a.date.localeCompare(b.date))
    }));
    setNewIncDate('');
    setNewIncAmt('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Employee name is required');
    if (form.baseSalary === '' || form.baseSalary === null) return alert('Base salary is required');
    setSaving(true);
    try {
      const data = { ...form, baseSalary: Number(form.baseSalary), shiftHours: Number(form.shiftHours), ptAmount: Number(form.ptAmount), updatedAt: new Date() };
      if (isNew) { data.createdAt = new Date(); await COLL('payroll_employees').add(data); }
      else await COLL('payroll_employees').doc(emp.id).update(data);
      onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const currentSalary = getCurrentSalary({ baseSalary: Number(form.baseSalary) || 0, incrementHistory: form.incrementHistory });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-bold dark:text-white">{isNew ? 'Add Employee' : 'Edit Employee'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Full Name *</label>
              <input className={inp()} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Employee name" />
            </div>
            <div>
              <label className={lbl}>Department</label>
              <input className={inp()} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Operations" />
            </div>
            <div>
              <label className={lbl}>Joining Date</label>
              <input type="date" className={inp()} value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Base Salary (₹) *</label>
              <input type="number" className={inp()} value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))} min="0" />
            </div>
            <div>
              <label className={lbl}>Shift Hours / Day</label>
              <input type="number" className={inp()} value={form.shiftHours} onChange={e => setForm(f => ({ ...f, shiftHours: e.target.value }))} min="1" max="24" />
            </div>
            <div>
              <label className={lbl}>Professional Tax</label>
              <select className={inp()} value={form.ptType} onChange={e => setForm(f => ({ ...f, ptType: e.target.value }))}>
                <option value="fixed">Fixed Amount</option>
                <option value="exempt">Exempt</option>
              </select>
            </div>
            {form.ptType === 'fixed' && (
              <div>
                <label className={lbl}>PT Amount (₹/month)</label>
                <input type="number" className={inp()} value={form.ptAmount} onChange={e => setForm(f => ({ ...f, ptAmount: e.target.value }))} />
              </div>
            )}
          </div>

          {/* Increment History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={lbl + ' mb-0'}>
                Increment History
                {currentSalary > 0 && <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-bold">→ Current: {fmt(currentSalary)}</span>}
              </label>
            </div>
            <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
              {form.incrementHistory.map((inc, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-1.5 text-sm">
                  <span className="text-slate-500 dark:text-slate-400 text-xs">{inc.date}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{fmt(inc.amount)}</span>
                  <button onClick={() => setForm(f => ({ ...f, incrementHistory: f.incrementHistory.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={13} /></button>
                </div>
              ))}
              {!form.incrementHistory.length && <p className="text-xs text-slate-400 text-center py-2">No increments yet</p>}
            </div>
            <div className="flex gap-2">
              <input type="date" className={inp('flex-1')} value={newIncDate} onChange={e => setNewIncDate(e.target.value)} />
              <input type="number" className={inp('w-28')} placeholder="₹ Amount" value={newIncAmt} onChange={e => setNewIncAmt(e.target.value)} />
              <button onClick={addIncrement} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1 whitespace-nowrap">
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Add Employee' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Employee Tab ──────────────────────────────────────────────────────────────
function EmployeeTab({ employees }) {
  const [modalEmp, setModalEmp] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
    setDeleting(emp.id);
    try { await COLL('payroll_employees').doc(emp.id).delete(); } catch (e) { alert(e.message); }
    setDeleting(null);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <input type="text" placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)}
          className={inp('sm:w-64')} />
        <button onClick={() => { setModalEmp(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg">
          <Plus size={16} /> Add Employee
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                {['Name','Department','Joining Date','Base Salary','Current Salary','Shift Hrs','PT','Actions'].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide ${h === 'Actions' ? 'text-center' : ['Base Salary','Current Salary'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const current = getCurrentSalary(emp);
                const hasInc = (emp.incrementHistory || []).length > 0;
                return (
                  <tr key={emp.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-semibold dark:text-slate-100">{emp.name}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{emp.department || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{emp.joiningDate || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmt(emp.baseSalary)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${hasInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>{fmt(current)}</span>
                      {hasInc && <span className="ml-1 text-[10px] text-slate-400">+{(emp.incrementHistory || []).length} inc</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{emp.shiftHours}h</td>
                    <td className="px-4 py-3 text-center">
                      {emp.ptType === 'exempt'
                        ? <span className="text-xs text-slate-400">Exempt</span>
                        : <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{fmt(emp.ptAmount)}/mo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setModalEmp(emp); setShowModal(true); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-600"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(emp)} disabled={deleting === emp.id} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-40"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <EmployeeModal emp={modalEmp} onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ─── Attendance Status Picker (fixed-position, never clipped) ─────────────────
function StatusPicker({ picker, onSelect, onClear, onClose, currentStatus, otInput, setOtInput, onSaveOT, saving }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Compute safe position: keep picker inside viewport
  const PICKER_W = 220;
  const PICKER_H = currentStatus === 'ot' ? 310 : 240;
  let left = picker.cx - PICKER_W / 2;
  let top = picker.below ? picker.cellBottom + 8 : picker.cellTop - PICKER_H - 8;

  // clamp horizontally
  if (left < 8) left = 8;
  if (left + PICKER_W > window.innerWidth - 8) left = window.innerWidth - PICKER_W - 8;
  // flip vertical if still off-screen
  if (top < 8) top = picker.cellBottom + 8;
  if (top + PICKER_H > window.innerHeight - 8) top = picker.cellTop - PICKER_H - 8;

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, width: PICKER_W, zIndex: 9999 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-600">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          {picker.empName} — Day {picker.day}
        </span>
        <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded">
          <X size={14} />
        </button>
      </div>

      {/* Status grid */}
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {STATUS_KEYS.map(k => {
          const isActive = currentStatus === k;
          return (
            <button
              key={k}
              onClick={() => onSelect(k)}
              disabled={saving}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-60
                ${isActive
                  ? `${STATUS[k].bg} ${STATUS[k].text} ring-2 ring-offset-1 ring-slate-500 dark:ring-slate-300`
                  : `${STATUS[k].bg} ${STATUS[k].text} opacity-75 hover:opacity-100`}`}
            >
              <span className="text-sm font-black leading-none w-6 text-center">{STATUS[k].abbr}</span>
              <span>{STATUS[k].label}</span>
            </button>
          );
        })}
      </div>

      {/* OT hours section */}
      {currentStatus === 'ot' && (
        <div className="mx-2 mb-2 p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-700">
          <label className="text-xs font-bold text-blue-700 dark:text-blue-300 block mb-1.5">OT Hours</label>
          <div className="flex gap-1.5">
            <input
              type="number"
              value={otInput}
              onChange={e => setOtInput(e.target.value)}
              min="0" max="24" step="0.5"
              autoFocus
              className="flex-1 border border-blue-200 dark:border-blue-600 rounded-lg px-2 py-1.5 text-sm font-semibold dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-center"
              placeholder="0"
            />
            <button
              onClick={onSaveOT}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Clear */}
      <div className="px-2 pb-2">
        <button
          onClick={onClear}
          disabled={saving}
          className="w-full py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ─── Attendance Tab ────────────────────────────────────────────────────────────
function AttendanceTab({ employees, attendance, selectedMonth }) {
  const { year, month } = parseYM(selectedMonth);
  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // picker: { empId, empName, day, cx, cellTop, cellBottom, below }
  const [picker, setPicker] = useState(null);
  const [otInput, setOtInput] = useState('');
  const [saving, setSaving] = useState(false);

  const attKey = (empId, day) => `${empId}_${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getStatus = (empId, day) => attendance[attKey(empId, day)]?.status || null;
  const getOtH = (empId, day) => attendance[attKey(empId, day)]?.otHours || 0;

  const writeStatus = async (empId, day, status, otHours = 0) => {
    const key = attKey(empId, day);
    setSaving(true);
    try {
      if (!status) {
        await COLL('payroll_attendance').doc(key).delete();
      } else {
        await COLL('payroll_attendance').doc(key).set({
          employeeId: empId,
          date: dateStr(day),
          status,
          otHours: status === 'ot' ? Number(otHours) : 0,
          updatedAt: new Date(),
        });
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleCellClick = (e, emp, day) => {
    // If same cell is open, close it
    if (picker?.empId === emp.id && picker?.day === day) { setPicker(null); return; }

    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cellTop = rect.top;
    const cellBottom = rect.bottom;
    const below = cellBottom + 260 < window.innerHeight;

    setPicker({ empId: emp.id, empName: emp.name, day, cx, cellTop, cellBottom, below });
    setOtInput(String(getOtH(emp.id, day) || ''));
  };

  const handleSelect = async (status) => {
    if (!picker) return;
    const { empId, day } = picker;
    const curOt = status === 'ot' ? (Number(otInput) || 0) : 0;
    await writeStatus(empId, day, status, curOt);
    // keep open for OT input; close for all other statuses
    if (status !== 'ot') setPicker(null);
  };

  const handleClear = async () => {
    if (!picker) return;
    await writeStatus(picker.empId, picker.day, null);
    setPicker(null);
  };

  const handleSaveOT = async () => {
    if (!picker) return;
    await writeStatus(picker.empId, picker.day, 'ot', Number(otInput) || 0);
    setPicker(null);
  };

  const empSummary = (empId) => {
    const counts = { present: 0, absent: 0, half_day: 0, late_arrival: 0, left_early: 0, ot: 0, holiday: 0, week_off: 0 };
    let otHours = 0;
    days.forEach(d => {
      const s = getStatus(empId, d);
      if (s) { counts[s] = (counts[s] || 0) + 1; if (s === 'ot') otHours += getOtH(empId, d); }
    });
    return { counts, otHours };
  };

  const pickerCurrentStatus = picker ? getStatus(picker.empId, picker.day) : null;

  return (
    <div>
      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUS_KEYS.map(k => (
          <span key={k} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${STATUS[k].bg} ${STATUS[k].text} font-bold`}>
            {STATUS[k].abbr} — {STATUS[k].label}
          </span>
        ))}
      </div>

      {!employees.length ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Users size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No employees. Add employees first.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: `${300 + daysInMonth * 30}px` }}>
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-700/50 border-b border-r border-slate-200 dark:border-slate-600 px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[150px]">Employee</th>
                  {days.map(d => (
                    <th key={d} className={`border-b border-slate-200 dark:border-slate-600 px-0.5 py-1 text-center font-semibold min-w-[30px] ${isWeekend(year, month, d) ? 'text-red-400 bg-red-50/60 dark:bg-red-900/10' : 'text-slate-500 dark:text-slate-400'}`}>
                      <div className="text-xs">{d}</div>
                      <div className="text-[9px] font-normal opacity-70">{getDayName(year, month, d)}</div>
                    </th>
                  ))}
                  <th className="border-b border-l border-slate-200 dark:border-slate-600 px-2 py-2 text-center text-slate-600 dark:text-slate-300 font-semibold min-w-[56px] whitespace-nowrap">P / OT</th>
                  <th className="border-b border-slate-200 dark:border-slate-600 px-2 py-2 text-center text-slate-600 dark:text-slate-300 font-semibold min-w-[40px]">Abs</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const { counts, otHours } = empSummary(emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 border-b border-slate-100 dark:border-slate-700/50">
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-600 px-3 py-2">
                        <div className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[138px]">{emp.name}</div>
                        <div className="text-[10px] text-slate-400">{emp.department}</div>
                      </td>
                      {days.map(d => {
                        const status = getStatus(emp.id, d);
                        const isActivePicker = picker?.empId === emp.id && picker?.day === d;
                        const otH = status === 'ot' ? getOtH(emp.id, d) : 0;
                        return (
                          <td key={d} className={`px-0.5 py-1 text-center ${isWeekend(year, month, d) ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}>
                            <button
                              onClick={e => handleCellClick(e, emp, d)}
                              className={`w-[28px] h-[28px] rounded-md text-[9px] font-bold flex flex-col items-center justify-center mx-auto transition-all active:scale-90
                                ${status
                                  ? `${STATUS[status].bg} ${STATUS[status].text} hover:opacity-85`
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}
                                ${isActivePicker ? 'ring-2 ring-offset-1 ring-slate-400 dark:ring-slate-300' : ''}`}
                            >
                              <span>{status ? STATUS[status].abbr : '·'}</span>
                              {status === 'ot' && otH > 0 && (
                                <span className="text-[7px] leading-none opacity-90">{otH}h</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-l border-slate-200 dark:border-slate-600 px-2 py-2 text-center">
                        <div className="font-bold text-green-600 dark:text-green-400">{counts.present + counts.ot}</div>
                        {otHours > 0 && <div className="text-[10px] text-blue-500">{otHours}h</div>}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-red-500">{counts.absent || '·'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fixed-position picker — rendered outside scrollable container, never clipped */}
      {picker && (
        <StatusPicker
          picker={picker}
          currentStatus={pickerCurrentStatus}
          otInput={otInput}
          setOtInput={setOtInput}
          onSelect={handleSelect}
          onClear={handleClear}
          onSaveOT={handleSaveOT}
          onClose={() => setPicker(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── Advance Ledger Tab ────────────────────────────────────────────────────────
function AdvanceTab({ employees, advances }) {
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [form, setForm] = useState({ type: 'advance', amount: '', date: new Date().toISOString().split('T')[0], note: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const selectedEmp = employees.find(e => e.id === selectedEmpId);
  const empAdvances = advances.filter(a => a.employeeId === selectedEmpId).sort((a, b) => a.date.localeCompare(b.date));

  // Running balance per row
  let running = 0;
  const rows = empAdvances.map(a => {
    running += a.type === 'advance' ? (a.amount || 0) : -(a.amount || 0);
    return { ...a, balance: running };
  });

  const outstanding = selectedEmpId ? getAdvanceBalance(advances, selectedEmpId) : 0;

  const handleAdd = async () => {
    if (!selectedEmpId) return alert('Select an employee');
    if (!form.amount || Number(form.amount) <= 0) return alert('Enter a valid amount');
    setSaving(true);
    try {
      await COLL('payroll_advances').add({
        employeeId: selectedEmpId,
        employeeName: selectedEmp?.name || '',
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        note: form.note || '',
        createdAt: new Date(),
      });
      setForm(f => ({ ...f, amount: '', note: '' }));
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    setDeleting(id);
    try { await COLL('payroll_advances').doc(id).delete(); } catch (e) { alert(e.message); }
    setDeleting(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Employee selector + add form */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Select Employee</h3>
          <select className={inp()} value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}>
            <option value="">-- Choose Employee --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          {selectedEmpId && (
            <div className={`mt-3 p-3 rounded-lg text-center ${outstanding > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
              <div className="text-xs text-slate-500 dark:text-slate-400">Outstanding Balance</div>
              <div className={`text-xl font-black ${outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmt(outstanding)}</div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Add Entry</h3>
          <div className="space-y-3">
            <div>
              <label className={lbl}>Type</label>
              <div className="flex gap-2">
                {['advance', 'repayment'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors
                      ${form.type === t
                        ? t === 'advance' ? 'bg-orange-500 text-white border-orange-500' : 'bg-emerald-500 text-white border-emerald-500'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                    {t === 'advance' ? 'Advance' : 'Repayment'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Date</label>
              <input type="date" className={inp()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Amount (₹)</label>
              <input type="number" className={inp()} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Note</label>
              <input className={inp()} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" />
            </div>
            <button onClick={handleAdd} disabled={saving || !selectedEmpId}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Entry
            </button>
          </div>
        </div>
      </div>

      {/* Right: Ledger table */}
      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {selectedEmp ? `${selectedEmp.name}'s Advance Ledger` : 'Select an employee to view ledger'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  {['Date','Type','Amount','Note','Balance',''].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase ${['Amount','Balance'].includes(h) ? 'text-right' : h === '' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.type === 'advance' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                        {row.type === 'advance' ? 'ADVANCE' : 'REPAID'}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${row.type === 'advance' ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {row.type === 'advance' ? '+' : '-'}{fmt(row.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">{row.note || '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${row.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmt(row.balance)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => handleDelete(row.id)} disabled={deleting === row.id} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-300 hover:text-red-500 disabled:opacity-40">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
                    {selectedEmpId ? 'No advance entries' : 'Select an employee'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Salary Calculator Tab ─────────────────────────────────────────────────────
function computeSalary(emp, attendance, advances, selectedMonth, settings) {
  const { year, month } = parseYM(selectedMonth);
  const totalDays = getDaysInMonth(year, month);
  const currentSalary = getCurrentSalary(emp);
  const perDay = currentSalary / totalDays;
  const perHour = perDay / (emp.shiftHours || 9);

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  let presentDays = 0, halfDays = 0, lateDays = 0, leftEarlyDays = 0, otDays = 0, otHours = 0, absentDays = 0;

  days.forEach(d => {
    const key = `${emp.id}_${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = attendance[key];
    if (!rec) return;
    switch (rec.status) {
      case 'present': presentDays++; break;
      case 'absent': absentDays++; break;
      case 'half_day': halfDays++; break;
      case 'late_arrival': lateDays++; break;
      case 'left_early': leftEarlyDays++; break;
      case 'ot': otDays++; otHours += rec.otHours || 0; break;
      default: break;
    }
  });

  const lateDeduct = settings.lateDeductFraction ?? 0.25;
  const leftEarlyDeduct = settings.leftEarlyDeductFraction ?? 0.25;

  const effectiveDays =
    presentDays +
    otDays +
    halfDays * 0.5 +
    lateDays * (1 - lateDeduct) +
    leftEarlyDays * (1 - leftEarlyDeduct);

  const gross = currentSalary * (effectiveDays / totalDays);
  const otPay = perHour * otHours;
  const advanceOutstanding = getAdvanceBalance(advances, emp.id);
  const pt = emp.ptType === 'exempt' ? 0 : (emp.ptAmount || 0);

  return {
    empId: emp.id,
    currentSalary,
    totalDays,
    effectiveDays: Math.round(effectiveDays * 100) / 100,
    presentDays, halfDays, lateDays, leftEarlyDays, otDays, otHours, absentDays,
    gross: Math.round(gross * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    advanceOutstanding,
    advanceDeduction: 0, // user-set
    pt,
    net: 0, // computed after advanceDeduction is set
  };
}

function SalaryTab({ employees, attendance, advances, salaries, selectedMonth, settings, onSaveSettings }) {
  const [calcResults, setCalcResults] = useState({});
  const [advDeductions, setAdvDeductions] = useState({});
  const [saving, setSaving] = useState({});
  const [savedIds, setSavedIds] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ lateDeductFraction: settings.lateDeductFraction ?? 0.25, leftEarlyDeductFraction: settings.leftEarlyDeductFraction ?? 0.25 });

  useEffect(() => {
    const results = {};
    employees.forEach(emp => {
      results[emp.id] = computeSalary(emp, attendance, advances, selectedMonth, settings);
    });
    setCalcResults(results);
    // init advance deductions from saved salaries
    const initDed = {};
    salaries.forEach(s => { initDed[s.employeeId] = s.advanceDeduction || 0; });
    setAdvDeductions(initDed);
    // init saved ids
    const ids = {};
    salaries.forEach(s => { ids[s.employeeId] = s.id; });
    setSavedIds(ids);
  }, [employees, attendance, advances, salaries, selectedMonth, settings]);

  const getNet = (empId) => {
    const c = calcResults[empId];
    if (!c) return 0;
    const adv = advDeductions[empId] || 0;
    return Math.round((c.gross + c.otPay - adv - c.pt) * 100) / 100;
  };

  const handleSaveSalary = async (emp) => {
    const c = calcResults[emp.id];
    if (!c) return;
    setSaving(s => ({ ...s, [emp.id]: true }));
    try {
      const adv = advDeductions[emp.id] || 0;
      const net = Math.round((c.gross + c.otPay - adv - c.pt) * 100) / 100;
      const data = {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || '',
        month: selectedMonth,
        ...c,
        advanceDeduction: adv,
        net,
        savedAt: new Date(),
      };
      const existing = savedIds[emp.id];
      if (existing) {
        await COLL('payroll_salaries').doc(existing).update(data);
      } else {
        const ref = await COLL('payroll_salaries').add(data);
        setSavedIds(s => ({ ...s, [emp.id]: ref.id }));
      }
      setSaving(s => { const n = { ...s }; delete n[emp.id]; return n; });
    } catch (e) {
      alert('Error saving: ' + e.message);
      setSaving(s => { const n = { ...s }; delete n[emp.id]; return n; });
    }
  };

  const handleSaveSettings = async () => {
    await onSaveSettings(settingsForm);
    setShowSettings(false);
  };

  const { year, month } = parseYM(selectedMonth);
  const { lateDeductFraction = 0.25, leftEarlyDeductFraction = 0.25 } = settings;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Late deduction: <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(lateDeductFraction * 100)}%</span> of a day •
          Left early: <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(leftEarlyDeductFraction * 100)}%</span> of a day
        </div>
        <button onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
          <Settings size={14} /> Settings
        </button>
      </div>

      {showSettings && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Deduction Settings</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Late Arrival Deduction (fraction of 1 day)</label>
              <input type="number" className={inp()} value={settingsForm.lateDeductFraction} step="0.05" min="0" max="1"
                onChange={e => setSettingsForm(f => ({ ...f, lateDeductFraction: Number(e.target.value) }))} />
              <p className="text-[10px] text-slate-400 mt-1">e.g. 0.25 = deduct 25% of a day's salary</p>
            </div>
            <div>
              <label className={lbl}>Left Early Deduction (fraction of 1 day)</label>
              <input type="number" className={inp()} value={settingsForm.leftEarlyDeductFraction} step="0.05" min="0" max="1"
                onChange={e => setSettingsForm(f => ({ ...f, leftEarlyDeductFraction: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">Save Settings</button>
            <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {!employees.length ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Users size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No employees found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  {['Employee','Eff. Days','Gross','OT Pay','Adv. Balance','Adv. Deduct','PT','Net Pay',''].map(h => (
                    <th key={h} className={`px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${['Gross','OT Pay','Adv. Balance','Adv. Deduct','PT','Net Pay'].includes(h) ? 'text-right' : h === 'Eff. Days' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const c = calcResults[emp.id];
                  if (!c) return null;
                  const adv = advDeductions[emp.id] || 0;
                  const net = getNet(emp.id);
                  const isSaved = !!savedIds[emp.id];
                  const totalDays = getDaysInMonth(year, month);

                  return (
                    <tr key={emp.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{emp.name}</div>
                        <div className="text-[10px] text-slate-400">{emp.department} • {fmt(c.currentSalary)}/mo</div>
                        <div className="text-[10px] text-slate-400">
                          P:{c.presentDays + c.otDays} H:{c.halfDays} L:{c.lateDays} LE:{c.leftEarlyDays} A:{c.absentDays}
                          {c.otHours > 0 && ` OT:${c.otHours}h`}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtN(c.effectiveDays, 2)}</div>
                        <div className="text-[10px] text-slate-400">/ {totalDays}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">{fmt(c.gross)}</td>
                      <td className="px-3 py-3 text-right">
                        {c.otPay > 0 ? <span className="font-semibold text-blue-600 dark:text-blue-400">+{fmt(c.otPay)}</span> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-semibold text-xs ${c.advanceOutstanding > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'}`}>
                          {fmt(c.advanceOutstanding)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={adv === 0 ? '' : adv}
                          onChange={e => setAdvDeductions(d => ({ ...d, [emp.id]: Number(e.target.value) || 0 }))}
                          className="w-24 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs text-right dark:bg-slate-700 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="0"
                          min="0"
                          max={c.advanceOutstanding}
                        />
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">{c.pt > 0 ? fmt(c.pt) : '—'}</td>
                      <td className="px-3 py-3 text-right">
                        <span className={`text-base font-black ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmt(net)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => handleSaveSalary(emp)} disabled={saving[emp.id]}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors
                            ${isSaved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200' : 'bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700'}
                            disabled:opacity-50 whitespace-nowrap`}>
                          {saving[emp.id] ? <RefreshCw size={12} className="animate-spin" /> : isSaved ? <CheckCircle2 size={12} /> : <Save size={12} />}
                          {isSaved ? 'Saved' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {employees.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-700/50 border-t-2 border-slate-300 dark:border-slate-600">
                    <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">TOTAL</td>
                    <td></td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700 dark:text-slate-200">
                      {fmt(Object.values(calcResults).reduce((s, c) => s + (c?.gross || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-blue-600 dark:text-blue-400">
                      {fmt(Object.values(calcResults).reduce((s, c) => s + (c?.otPay || 0), 0))}
                    </td>
                    <td></td>
                    <td className="px-3 py-3 text-right font-bold text-orange-600 dark:text-orange-400">
                      {fmt(Object.values(advDeductions).reduce((s, v) => s + v, 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-600 dark:text-slate-300">
                      {fmt(Object.values(calcResults).reduce((s, c) => s + (c?.pt || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700 dark:text-emerald-400 text-base">
                      {fmt(employees.reduce((s, emp) => s + getNet(emp.id), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ employees, attendance, advances, salaries, selectedMonth, settings }) {
  const { year, month } = parseYM(selectedMonth);
  const totalDays = getDaysInMonth(year, month);

  // Compute live salary for every employee (same logic as Salary tab)
  const liveCalc = useMemo(() => {
    const results = {};
    employees.forEach(emp => {
      results[emp.id] = computeSalary(emp, attendance, advances, selectedMonth, settings);
    });
    return results;
  }, [employees, attendance, advances, selectedMonth, settings]);

  // Use saved advance deductions if the salary has been saved, else 0
  const getSavedAdvDeduction = (empId) => {
    const saved = salaries.find(s => s.employeeId === empId);
    return saved ? (saved.advanceDeduction || 0) : 0;
  };

  const getLiveNet = (emp) => {
    const c = liveCalc[emp.id];
    if (!c) return 0;
    const adv = getSavedAdvDeduction(emp.id);
    return Math.round((c.gross + c.otPay - adv - c.pt) * 100) / 100;
  };

  // Summary cards — all live
  const headcount = employees.length;
  const totalGross = employees.reduce((s, emp) => s + (liveCalc[emp.id]?.gross || 0), 0);
  const totalNet = employees.reduce((s, emp) => s + getLiveNet(emp), 0);
  const totalAdvOut = employees.reduce((s, emp) => s + Math.max(0, getAdvanceBalance(advances, emp.id)), 0);

  // Dept-wise — live gross
  const deptMap = {};
  employees.forEach(emp => {
    const dept = emp.department || 'Unassigned';
    if (!deptMap[dept]) deptMap[dept] = { gross: 0, count: 0 };
    deptMap[dept].gross += liveCalc[emp.id]?.gross || 0;
    deptMap[dept].count++;
  });
  const maxDeptGross = Math.max(...Object.values(deptMap).map(d => d.gross), 1);

  const attKeyFn = (empId, day) => `${empId}_${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  const cards = [
    { label: 'Headcount', value: headcount, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Total Gross', value: fmt(totalGross), icon: DollarSign, color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-700/50', sub: 'Live from attendance' },
    { label: 'Total Net Payable', value: fmt(totalNet), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', sub: 'Live from attendance' },
    { label: 'Advance Outstanding', value: fmt(totalAdvOut), icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4 border border-slate-200 dark:border-slate-700`}>
            <div className={`${card.color} mb-2`}><card.icon size={20} /></div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{card.label}</div>
            <div className={`text-xl font-black ${card.color}`}>{card.value}</div>
            {card.sub && <div className="text-[10px] text-slate-400 mt-0.5">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Attendance Heatmap */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <Activity size={16} className="text-slate-500" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Attendance Heatmap — {MONTHS_LONG[month]} {year}</h3>
        </div>
        {!employees.length ? (
          <div className="p-8 text-center text-slate-400 text-sm">No employees</div>
        ) : (
          <div className="p-4 overflow-x-auto">
            {/* Day header */}
            <div className="flex gap-[2px] mb-1 pl-[130px]">
              {days.map(d => (
                <div key={d} className={`text-[9px] font-bold text-center flex-shrink-0 w-[18px] ${isWeekend(year, month, d) ? 'text-red-400' : 'text-slate-400'}`}>
                  {d}
                </div>
              ))}
            </div>
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center gap-[2px] mb-[3px]">
                <div className="w-[128px] pr-2 text-right text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate flex-shrink-0">{emp.name}</div>
                {days.map(d => {
                  const s = attendance[attKeyFn(emp.id, d)]?.status;
                  const sc = s ? STATUS[s] : null;
                  return (
                    <div key={d} title={s ? STATUS[s].label : 'No record'}
                      className={`w-[18px] h-[18px] rounded-sm flex-shrink-0 ${sc ? sc.bg : 'bg-slate-100 dark:bg-slate-700'} ${isWeekend(year, month, d) && !sc ? 'opacity-50' : ''}`} />
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              {STATUS_KEYS.map(k => (
                <div key={k} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <div className={`w-3 h-3 rounded-sm ${STATUS[k].bg}`} />
                  {STATUS[k].label}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                <div className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-700" />No Record
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Department Chart + Advance Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dept salary distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <BarChart2 size={16} className="text-slate-500" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Department-wise Gross Salary</h3>
          </div>
          <div className="p-4 space-y-3">
            {Object.entries(deptMap).map(([dept, info]) => (
              <div key={dept}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{dept}</span>
                  <span className="text-slate-500 dark:text-slate-400">{info.count} emp • {fmt(info.gross)}</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.round((info.gross / maxDeptGross) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!Object.keys(deptMap).length && <p className="text-sm text-slate-400 text-center py-4">No data. Save salary records first.</p>}
          </div>
        </div>

        {/* Advance balance table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <CreditCard size={16} className="text-slate-500" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Advance Balance Table</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  {['Employee','Department','Outstanding'].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase ${h === 'Outstanding' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.filter(e => getAdvanceBalance(advances, e.id) !== 0).map(emp => {
                  const bal = getAdvanceBalance(advances, emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="px-4 py-2.5 font-medium dark:text-slate-100">{emp.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{emp.department || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-bold ${bal > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmt(bal)}</td>
                    </tr>
                  );
                })}
                {!employees.some(e => getAdvanceBalance(advances, e.id) !== 0) && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">No advance balances</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AttendancePayroll({ user, userRole }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(todayYM());
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [advances, setAdvances] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [settings, setSettings] = useState({ lateDeductFraction: 0.25, leftEarlyDeductFraction: 0.25 });
  const [loadingEmp, setLoadingEmp] = useState(true);

  // Employees & settings listener (persistent)
  useEffect(() => {
    const unsubEmp = COLL('payroll_employees').orderBy('name').onSnapshot(snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingEmp(false);
    }, () => setLoadingEmp(false));

    const unsubSettings = COLL('payroll_settings').doc('global').onSnapshot(doc => {
      if (doc.exists) setSettings(doc.data());
    });

    const unsubAdv = COLL('payroll_advances').orderBy('date').onSnapshot(snap => {
      setAdvances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubEmp(); unsubSettings(); unsubAdv(); };
  }, []);

  // Attendance & salary listener (month-scoped)
  useEffect(() => {
    const { year, month } = parseYM(selectedMonth);
    const totalDays = getDaysInMonth(year, month);
    const mm = String(month + 1).padStart(2, '0');
    const start = `${year}-${mm}-01`;
    const end = `${year}-${mm}-${String(totalDays).padStart(2, '0')}`;

    const unsubAtt = COLL('payroll_attendance')
      .where('date', '>=', start).where('date', '<=', end)
      .onSnapshot(snap => {
        const map = {};
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
        setAttendance(map);
      });

    const unsubSal = COLL('payroll_salaries').where('month', '==', selectedMonth).onSnapshot(snap => {
      setSalaries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubAtt(); unsubSal(); };
  }, [selectedMonth]);

  const handleSaveSettings = async (newSettings) => {
    try {
      await COLL('payroll_settings').doc('global').set(newSettings, { merge: true });
    } catch (e) { alert('Error saving settings: ' + e.message); }
  };

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'advances', label: 'Advances', icon: CreditCard },
    { id: 'salary', label: 'Salary', icon: DollarSign },
  ];

  return (
    <div className="animate-in fade-in duration-300">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Attendance & Payroll</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Track attendance, advances and compute monthly salaries</p>
        </div>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl mb-5 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all
              ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loadingEmp ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <DashboardTab employees={employees} attendance={attendance} advances={advances} salaries={salaries} selectedMonth={selectedMonth} settings={settings} />
          )}
          {activeTab === 'employees' && (
            <EmployeeTab employees={employees} userRole={userRole} />
          )}
          {activeTab === 'attendance' && (
            <AttendanceTab employees={employees} attendance={attendance} selectedMonth={selectedMonth} />
          )}
          {activeTab === 'advances' && (
            <AdvanceTab employees={employees} advances={advances} />
          )}
          {activeTab === 'salary' && (
            <SalaryTab
              employees={employees}
              attendance={attendance}
              advances={advances}
              salaries={salaries}
              selectedMonth={selectedMonth}
              settings={settings}
              onSaveSettings={handleSaveSettings}
            />
          )}
        </>
      )}
    </div>
  );
}
