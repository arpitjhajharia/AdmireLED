import React, { useState, useEffect, useMemo } from 'react';
import { db, appId } from '../lib/firebase';
import {
    Plus,
    Trash2,
    Circle,
    CheckCircle2,
    Edit2,
    X,
    Calendar,
    Briefcase,
    UserCircle2,
    Filter,
    ChevronUp,
    ChevronDown,
    ArrowUpDown,
    Save
} from 'lucide-react';

// Move SortableHeader outside to avoid "Cannot create components during render"
const SortableHeader = ({ label, columnKey, sortConfig, onSort, className = "" }) => {
    const getSortIcon = (columnKey) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-teal-400" /> : <ChevronDown className="w-3 h-3 text-teal-400" />;
    };

    return (
        <th
            scope="col"
            className={`px-1.5 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap cursor-pointer hover:bg-slate-800/80 dark:hover:bg-slate-900/50 group transition-colors select-none ${className}`}
            onClick={() => onSort(columnKey)}
        >
            <div className="flex items-center gap-1.5">
                {label}
                {getSortIcon(columnKey)}
            </div>
        </th>
    );
};

const TaskManager = ({ user, userRole }) => {
    const [tasks, setTasks] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);
    const [clientsList, setClientsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hideCompleted, setHideCompleted] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'dueDate', direction: 'asc' });
    const [expandedGroups, setExpandedGroups] = useState({
        myTasks: true,
        otherTasks: true,
        completedTasks: false
    });

    const toggleGroup = (group) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    // Editing State
    const [editingTask, setEditingTask] = useState(null);

    // Form State
    const [title, setTitle] = useState('');
    const [project, setProject] = useState('');
    const [clientId, setClientId] = useState('');   // set when project dropdown picks a CRM Client
    const [description, setDescription] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [assignedBy, setAssignedBy] = useState('');
    const [assignedOn, setAssignedOn] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [status, setStatus] = useState('open');
    const [priority, setPriority] = useState('normal'); // high, normal

    // Helper: given a selected value, resolve clientId (empty string if it's a Project, not a Client)
    const resolveClientId = (selectedValue) => {
        if (!selectedValue) return '';
        const matched = clientsList.find(c => c.companyName === selectedValue);
        return matched ? matched.id : '';
    };

    // Handle project/client dropdown change — sets both project label and clientId
    const handleProjectChange = (value) => {
        setProject(value);
        setClientId(resolveClientId(value));
    };

    // Fetch tasks & users from Firestore
    useEffect(() => {
        if (!user || !db) return;

        const tasksRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('tasks');
        const usersRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles');
        const projectsRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('projects');
        const clientsRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('crm_leads');

        const unsubTasks = tasksRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTasks(tasksData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching tasks:", error);
            setLoading(false);
        });

        const unsubUsers = usersRef.onSnapshot((snapshot) => {
            const usersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
            setUsersList(usersData);
        }, (error) => {
            console.error("Error fetching users:", error);
        });

        const unsubProjects = projectsRef.onSnapshot((snapshot) => {
            const projectsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setProjectsList(projectsData);
        }, (error) => {
            console.error("Error fetching projects:", error);
        });

        const unsubClients = clientsRef.onSnapshot((snapshot) => {
            const clientsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
            setClientsList(clientsData);
        }, (error) => {
            console.error("Error fetching clients:", error);
        });

        return () => {
            unsubTasks();
            unsubUsers();
            unsubProjects();
            unsubClients();
        };
    }, [user]);

    const getTodayStr = () => new Date().toISOString().split('T')[0];

    const startEdit = (task = null) => {
        if (task) {
            setEditingTask(task);
            setTitle(task.title || '');
            setProject(task.project || '');
            setClientId(task.clientId || '');
            setDescription(task.description || '');
            setAssignedTo(task.assignedTo || '');
            setAssignedBy(task.assignedBy || '');
            setAssignedOn(task.assignedOn || getTodayStr());
            setDueDate(task.dueDate || '');
            setStatus(task.status || 'open');
            setPriority(task.priority || 'normal');
        } else {
            setEditingTask({ id: 'new' });
            setTitle('');
            setProject('');
            setClientId('');
            setDescription('');
            setAssignedTo('');
            setAssignedBy(user?.username || '');
            setAssignedOn(getTodayStr());
            setDueDate('');
            setStatus('open');
            setPriority('normal');
        }
    };

    const cancelEdit = () => {
        setEditingTask(null);
    };

    const handleSaveTask = async () => {
        if (!title || !title.trim()) return;

        // Resolve client linkage: re-check at save time in case clientsList arrived after selection
        const resolvedClientId = clientId || resolveClientId(project);
        const resolvedClient = resolvedClientId
            ? clientsList.find(c => c.id === resolvedClientId)
            : null;

        const taskData = {
            title: title.trim(),
            project: project ? project.trim() : '',
            description: description ? description.trim() : '',
            assignedTo: assignedTo || '',
            assignedBy: assignedBy || '',
            assignedOn: assignedOn || '',
            dueDate: dueDate || '',
            status: status || 'open',
            priority: priority || 'normal',
            // CRM cross-link fields
            clientId: resolvedClientId || '',
            clientName: resolvedClient ? (resolvedClient.companyName || '') : '',
            updatedAt: new Date(),
        };

        try {
            const tasksRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('tasks');

            if (editingTask && editingTask.id !== 'new') {
                await tasksRef.doc(editingTask.id).update(taskData);
            } else {
                taskData.createdAt = new Date();
                taskData.createdBy = (user && user.email) ? user.email : 'unknown';
                await tasksRef.add(taskData);
            }
            cancelEdit();
        } catch (error) {
            console.error("Error saving task:", error);
            alert(`Error saving task: ${error.message || error.code || "Unknown Error"}. Please check console or permissions.`);
        }
    };

    const handleDeleteTask = async (id) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('tasks').doc(id).delete();
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };

    const updateTaskStatus = async (id, newStatus) => {
        try {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('tasks').doc(id).update({
                status: newStatus,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating task status:", error);
        }
    };

    const toggleTaskStatus = (task, e) => {
        e.stopPropagation();
        const newStatus = task.status === 'completed' ? 'open' : 'completed';
        updateTaskStatus(task.id, newStatus);
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Shared sort icon logic removed as it's now inside the outside SortableHeader component

    // Grouping Tasks
    const { myTasks, otherTasks, completedTasks } = useMemo(() => {
        let sortedTasks = [...tasks];

        if (sortConfig.key) {
            sortedTasks.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (aVal === undefined || aVal === null) aVal = '';
                if (bVal === undefined || bVal === null) bVal = '';

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (sortConfig.key === 'createdAt' || sortConfig.key === 'updatedAt') {
                    aVal = a[sortConfig.key]?.toMillis?.() || 0;
                    bVal = b[sortConfig.key]?.toMillis?.() || 0;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        const myTasksList = [];
        const otherTasksList = [];
        const completedTasksList = [];
        sortedTasks.forEach(t => {
            const isCompleted = t.status === 'completed' || t.status === 'done';
            if (hideCompleted && isCompleted) {
                return;
            }
            if (isCompleted) {
                completedTasksList.push(t);
            } else if (t.assignedTo?.toLowerCase() === user?.username?.toLowerCase()) {
                myTasksList.push(t);
            } else {
                otherTasksList.push(t);
            }
        });
        return { myTasks: myTasksList, otherTasks: otherTasksList, completedTasks: completedTasksList };
    }, [tasks, user, hideCompleted, sortConfig]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        if (!year || !month || !day) return dateStr;
        const dateObj = new Date(year, parseInt(month) - 1, day);
        if (isNaN(dateObj)) return dateStr;
        const d = dateObj.getDate().toString().padStart(2, '0');
        const m = dateObj.toLocaleString('default', { month: 'short' });
        return `${d}-${m}`;
    };

    const getDueDateClass = (task) => {
        const isDone = task.status === 'completed' || task.status === 'done';
        if (!task.dueDate) return 'text-slate-400 italic';
        if (isDone) return 'text-slate-700 dark:text-slate-300 font-medium';
        const todayStr = getTodayStr();
        if (task.dueDate < todayStr) return 'text-red-600 dark:text-red-400 font-bold';
        if (task.dueDate === todayStr) return 'text-amber-600 dark:text-amber-500 font-bold';
        return 'text-slate-700 dark:text-slate-300 font-medium';
    };

    // ── DESKTOP: inline editable row ──────────────────────────────────────────
    const renderEditableRow = (keyPrefix = 'new') => {
        return (
            <tr key={`editable-${keyPrefix}`} className="bg-teal-50/50 dark:bg-teal-900/20 border-y-2 border-teal-500/30">
                <td className="px-1.5 py-1 text-center w-8 align-top">
                    {editingTask?.id !== 'new' && (
                        <button
                            onClick={(e) => toggleTaskStatus(editingTask, e)}
                            className="text-slate-400 hover:text-teal-500 transition-colors mt-1"
                        >
                            {status === 'completed' || status === 'done' ? <CheckCircle2 size={13} className="text-teal-500" /> : <Circle size={13} />}
                        </button>
                    )}
                </td>
                <td className="px-1.5 py-1 w-16 align-top">
                    <select
                        value={project}
                        onChange={(e) => handleProjectChange(e.target.value)}
                        className="w-full min-w-[50px] bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded px-1 py-1 text-xs uppercase focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white"
                    >
                        <option value="">-</option>
                        {projectsList.length > 0 && (
                            <optgroup label="── Projects ──">
                                {projectsList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </optgroup>
                        )}
                        {clientsList.length > 0 && (
                            <optgroup label="── Clients ──">
                                {clientsList.map(c => <option key={c.id} value={c.companyName}>{c.companyName}</option>)}
                            </optgroup>
                        )}
                    </select>
                </td>
                <td className="px-1.5 py-1 w-1/3 min-w-[120px] align-top">
                    <textarea
                        value={title}
                        rows={1}
                        onChange={(e) => setTitle(e.target.value)}
                        onInput={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                            }
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded px-1.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white resize-none overflow-hidden"
                        placeholder="Task name"
                        autoFocus
                    />
                </td>
                <td className="px-1.5 py-1 w-2/3 min-w-[180px] hidden xl:table-cell align-top">
                    <textarea
                        value={description}
                        rows={1}
                        onChange={(e) => setDescription(e.target.value)}
                        onInput={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                            }
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white resize-none overflow-hidden"
                        placeholder="Description"
                    />
                </td>
                <td className="px-1.5 py-1 w-20 align-top">
                    <select
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white"
                    >
                        <option value="">User</option>
                        {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                    </select>
                </td>
                <td className="px-1.5 py-1 w-16 align-top">
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white"
                    >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                    </select>
                </td>
                <td className="px-1.5 py-1 text-left w-14 align-top break-words">
                    <span className="text-xs text-slate-500/80 dark:text-slate-400/80 block break-words capitalize mt-[5px] cursor-not-allowed select-none" title={assignedBy}>
                        {assignedBy || '-'}
                    </span>
                </td>
                <td className="px-1.5 py-1 w-14 align-top">
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded px-1 text-center py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white"
                    />
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap text-left w-14 align-top">
                    <span className="text-xs text-slate-500/80 dark:text-slate-400/80 block tabular-nums mt-[5px] cursor-not-allowed select-none">
                        {formatDate(assignedOn)}
                    </span>
                </td>
                <td className="px-1.5 py-1 w-12 text-right align-top">
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                        <button
                            onClick={handleSaveTask}
                            disabled={!title.trim()}
                            className="w-5 h-5 rounded flex items-center justify-center text-white bg-teal-500 hover:bg-teal-600 disabled:bg-slate-300 transition-colors"
                        >
                            <Save size={11} />
                        </button>
                        <button
                            onClick={cancelEdit}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-500 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
                        >
                            <X size={11} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    // ── DESKTOP: read-only table row ──────────────────────────────────────────
    const renderTableRow = (task, rowIdx) => {
        if (editingTask?.id === task.id) {
            return renderEditableRow(task.id);
        }
        const isDone = task.status === 'completed' || task.status === 'done';
        const dueDateClass = getDueDateClass(task);

        return (
            <tr
                key={task.id}
                className={`group transition-colors duration-100 cursor-pointer ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50'} hover:bg-blue-50/50 dark:hover:bg-slate-700/60`}
                onClick={() => startEdit(task)}
            >
                <td className="px-1.5 py-1 text-center w-8 align-top">
                    <button
                        onClick={(e) => toggleTaskStatus(task, e)}
                        className="text-slate-400 hover:text-teal-500 transition-colors focus:outline-none mt-[3px]"
                    >
                        {isDone ? (
                            <CheckCircle2 size={13} className="text-teal-500" />
                        ) : (
                            <Circle size={13} />
                        )}
                    </button>
                </td>
                <td className="px-1.5 py-1 text-left w-16 align-top break-words">
                    {task.project ? (
                        <span className="inline-block mt-[2px] px-1 py-px rounded text-[8px] font-bold uppercase tracking-wide bg-purple-50 text-purple-600 ring-1 ring-purple-200/60 dark:bg-purple-900/30 dark:text-purple-400 dark:ring-purple-700/50 break-words">
                            {task.project}
                        </span>
                    ) : (
                        <span className="text-xs text-slate-400 block">-</span>
                    )}
                </td>
                <td className="px-1.5 py-1 w-1/3 min-w-[120px] align-top">
                    <span className={`text-xs font-semibold break-words block ${isDone ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-white'}`} title={task.title}>
                        {task.title}
                    </span>
                </td>
                <td className="px-1.5 py-1 w-2/3 min-w-[180px] hidden xl:table-cell align-top">
                    <span className="text-xs text-slate-500 dark:text-slate-400 break-words block whitespace-pre-wrap" title={task.description}>
                        {task.description || '-'}
                    </span>
                </td>
                <td className="px-1.5 py-1 text-left w-20 align-top break-words">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block capitalize" title={task.assignedTo}>
                        {task.assignedTo || 'Unassigned'}
                    </span>
                </td>
                <td className="px-1.5 py-1 text-left w-16 align-top">
                    {task.priority === 'high' && (
                        <span className="inline-block mt-[2px] px-1 py-px rounded text-[8px] font-bold uppercase tracking-wide bg-red-50 text-red-600 ring-1 ring-red-200/60 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/50">
                            High
                        </span>
                    )}
                </td>
                <td className="px-1.5 py-1 text-left w-14 align-top break-words">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block break-words capitalize" title={task.assignedBy}>
                        {task.assignedBy || '-'}
                    </span>
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap text-left w-14 align-top">
                    <span className={`text-xs block tabular-nums ${dueDateClass}`}>
                        {formatDate(task.dueDate)}
                    </span>
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap text-left w-14 align-top">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block tabular-nums">
                        {formatDate(task.assignedOn)}
                    </span>
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap w-12 text-right align-top">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    // ── MOBILE: task edit modal ───────────────────────────────────────────────
    const renderMobileEditModal = () => {
        if (!editingTask) return null;
        return (
            <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
                {/* Modal header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                        {editingTask.id === 'new' ? 'New Task' : 'Edit Task'}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSaveTask}
                            disabled={!title.trim()}
                            className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
                        >
                            <Save size={12} /> Save
                        </button>
                        <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Scrollable form */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Task title */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Task Name *</label>
                        <textarea
                            value={title}
                            rows={2}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white resize-none"
                            placeholder="Task name"
                            autoFocus
                        />
                    </div>

                    {/* Project + Priority row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Project / Client</label>
                            <select
                                value={project}
                                onChange={(e) => handleProjectChange(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                            >
                                <option value="">None</option>
                                {projectsList.length > 0 && (
                                    <optgroup label="── Projects ──">
                                        {projectsList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </optgroup>
                                )}
                                {clientsList.length > 0 && (
                                    <optgroup label="── Clients ──">
                                        {clientsList.map(c => <option key={c.id} value={c.companyName}>{c.companyName}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Priority</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                            >
                                <option value="normal">Normal</option>
                                <option value="high">⚑ High</option>
                            </select>
                        </div>
                    </div>

                    {/* Assigned To */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assigned To</label>
                        <select
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                        >
                            <option value="">Unassigned</option>
                            {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                        </select>
                    </div>

                    {/* Due date + Status row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Due Date</label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                            />
                        </div>
                        {editingTask.id !== 'new' && (
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                                >
                                    <option value="open">Open</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                        <textarea
                            value={description}
                            rows={3}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white resize-none"
                            placeholder="Optional description"
                        />
                    </div>

                    {/* Delete button (edit only) */}
                    {editingTask.id !== 'new' && (
                        <button
                            onClick={() => { handleDeleteTask(editingTask.id); cancelEdit(); }}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-red-600 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
                        >
                            <Trash2 size={14} /> Delete Task
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // ── MOBILE: task card ─────────────────────────────────────────────────────
    const renderMobileCard = (task, rowIdx) => {
        const isDone = task.status === 'completed' || task.status === 'done';
        const dueDateClass = getDueDateClass(task);
        const todayStr = getTodayStr();
        const isOverdue = !isDone && task.dueDate && task.dueDate < todayStr;
        const isDueToday = !isDone && task.dueDate && task.dueDate === todayStr;

        return (
            <div
                key={task.id}
                className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                    rowIdx % 2 === 0
                        ? 'bg-white dark:bg-slate-800'
                        : 'bg-slate-50/70 dark:bg-slate-800/50'
                } ${isDone ? 'opacity-60' : ''} active:bg-blue-50/60 dark:active:bg-slate-700`}
                onClick={() => startEdit(task)}
            >
                {/* Checkbox */}
                <button
                    onClick={(e) => toggleTaskStatus(task, e)}
                    className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-teal-500 transition-colors"
                >
                    {isDone
                        ? <CheckCircle2 size={16} className="text-teal-500" />
                        : <Circle size={16} />
                    }
                </button>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                    {/* Row 1: title + priority badge */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <span className={`text-xs font-semibold leading-snug flex-1 ${isDone ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-white'}`}>
                            {task.title}
                        </span>
                        {task.priority === 'high' && (
                            <span className="flex-shrink-0 px-1 py-px rounded text-[8px] font-bold uppercase tracking-wide bg-red-50 text-red-600 ring-1 ring-red-200/60 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/50 mt-0.5">
                                High
                            </span>
                        )}
                    </div>

                    {/* Row 2: project + assigned-to + due date */}
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                        {task.project && (
                            <span className="px-1 py-px rounded text-[8px] font-bold uppercase tracking-wide bg-purple-50 text-purple-600 ring-1 ring-purple-200/60 dark:bg-purple-900/30 dark:text-purple-400 dark:ring-purple-700/50">
                                {task.project}
                            </span>
                        )}
                        {task.assignedTo && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                                → {task.assignedTo}
                            </span>
                        )}
                        {task.dueDate && (
                            <span className={`text-[10px] tabular-nums ${isOverdue ? 'text-red-500 font-bold' : isDueToday ? 'text-amber-500 font-bold' : 'text-slate-400'}`}>
                                {isOverdue ? '⚠ ' : isDueToday ? '● ' : ''}Due {formatDate(task.dueDate)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ── MOBILE: group header ──────────────────────────────────────────────────
    const renderMobileGroupHeader = (label, count, groupKey, colorClass = 'text-slate-500') => (
        <div
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-700/50 cursor-pointer select-none"
            onClick={() => toggleGroup(groupKey)}
        >
            {expandedGroups[groupKey] ? <ChevronUp size={13} className={colorClass} /> : <ChevronDown size={13} className={colorClass} />}
            <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${colorClass}`}>
                {label} ({count})
            </span>
        </div>
    );

    return (
        <div className="animate-in fade-in duration-300 pb-10">
            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Task List</h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Manage your project tasks and workflow</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <button
                        onClick={() => setHideCompleted(!hideCompleted)}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-sm border ${hideCompleted
                            ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
                            }`}
                        title={hideCompleted ? "Click to show completed tasks" : "Click to hide completed tasks"}
                    >
                        <Filter size={13} />
                        <span className="hidden sm:inline">{hideCompleted ? 'Show All' : 'Hide Completed'}</span>
                        <span className="sm:hidden">{hideCompleted ? 'All' : 'Hide ✓'}</span>
                    </button>
                    <button
                        onClick={() => startEdit()}
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-sm"
                    >
                        <Plus size={13} />
                        <span className="hidden sm:inline">New Task</span>
                        <span className="sm:hidden">New</span>
                    </button>
                </div>
            </div>

            {/* ── MOBILE CARD VIEW (< md) ── */}
            <div className="md:hidden rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden bg-white dark:bg-slate-800">
                {/* Mobile edit modal */}
                {editingTask && renderMobileEditModal()}

                {/* My Tasks */}
                {myTasks.length > 0 && renderMobileGroupHeader('Assigned to Me', myTasks.length, 'myTasks', 'text-teal-600 dark:text-teal-400')}
                {expandedGroups.myTasks && myTasks.map((task, idx) => renderMobileCard(task, idx))}

                {/* Other Tasks */}
                {otherTasks.length > 0 && renderMobileGroupHeader(
                    myTasks.length > 0 ? 'Other Tasks' : 'All Tasks',
                    otherTasks.length,
                    'otherTasks',
                    'text-slate-500 dark:text-slate-400'
                )}
                {expandedGroups.otherTasks && otherTasks.map((task, idx) => renderMobileCard(task, idx))}

                {/* Completed Tasks */}
                {completedTasks.length > 0 && renderMobileGroupHeader('Completed', completedTasks.length, 'completedTasks', 'text-slate-400 dark:text-slate-500')}
                {expandedGroups.completedTasks && completedTasks.map((task, idx) => renderMobileCard(task, idx))}

                {/* Empty state */}
                {tasks.length === 0 && (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
                        No tasks yet. Tap <span className="font-semibold text-teal-600">New</span> to create one.
                    </div>
                )}
            </div>

            {/* ── DESKTOP TABLE VIEW (≥ md) ── */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white dark:bg-slate-800">
                <table className="min-w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700">
                            <th scope="col" className="px-1.5 py-1.5 w-8 text-center text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">State</th>
                            <SortableHeader label="Project" columnKey="project" sortConfig={sortConfig} onSort={handleSort} className="w-16" />
                            <SortableHeader label="Task" columnKey="title" sortConfig={sortConfig} onSort={handleSort} className="w-1/3 min-w-[120px]" />
                            <SortableHeader label="Description" columnKey="description" sortConfig={sortConfig} onSort={handleSort} className="hidden xl:table-cell w-2/3 min-w-[180px]" />
                            <SortableHeader label="Assigned To" columnKey="assignedTo" sortConfig={sortConfig} onSort={handleSort} className="w-20" />
                            <SortableHeader label="Priority" columnKey="priority" sortConfig={sortConfig} onSort={handleSort} className="w-16" />
                            <SortableHeader label="By" columnKey="assignedBy" sortConfig={sortConfig} onSort={handleSort} className="w-14" />
                            <SortableHeader label="Due" columnKey="dueDate" sortConfig={sortConfig} onSort={handleSort} className="w-14" />
                            <SortableHeader label="Created" columnKey="assignedOn" sortConfig={sortConfig} onSort={handleSort} className="w-14" />
                            <th scope="col" className="px-1.5 py-1.5 w-12 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {/* NEW TASK INPUT ROW */}
                        {editingTask?.id === 'new' && renderEditableRow('new')}

                        {/* MY TASKS GROUP */}
                        {myTasks.length > 0 && (
                            <tr
                                className="bg-slate-50/80 dark:bg-slate-800/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                onClick={() => toggleGroup('myTasks')}
                            >
                                <td colSpan="10" className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-[0.1em] select-none">
                                        {expandedGroups.myTasks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        Assigned to Me ({myTasks.length})
                                    </div>
                                </td>
                            </tr>
                        )}
                        {expandedGroups.myTasks && myTasks.map((task, rowIdx) => renderTableRow(task, rowIdx))}

                        {/* OTHER TASKS GROUP */}
                        {otherTasks.length > 0 && (
                            <tr
                                className={`bg-slate-50/80 dark:bg-slate-800/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${myTasks.length > 0 ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}
                                onClick={() => toggleGroup('otherTasks')}
                            >
                                <td colSpan="10" className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.1em] select-none">
                                        {expandedGroups.otherTasks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {myTasks.length > 0 ? "Other Tasks" : "All Tasks"} ({otherTasks.length})
                                    </div>
                                </td>
                            </tr>
                        )}
                        {expandedGroups.otherTasks && otherTasks.map((task, rowIdx) => renderTableRow(task, rowIdx))}

                        {/* COMPLETED TASKS GROUP */}
                        {completedTasks.length > 0 && (
                            <tr
                                className={`bg-slate-50/80 dark:bg-slate-800/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${(myTasks.length > 0 || otherTasks.length > 0) ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}
                                onClick={() => toggleGroup('completedTasks')}
                            >
                                <td colSpan="10" className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] select-none">
                                        {expandedGroups.completedTasks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        Completed Tasks ({completedTasks.length})
                                    </div>
                                </td>
                            </tr>
                        )}
                        {expandedGroups.completedTasks && completedTasks.map((task, rowIdx) => renderTableRow(task, rowIdx))}

                        {tasks.length === 0 && editingTask?.id !== 'new' && (
                            <tr>
                                <td colSpan="10" className="p-12 text-center text-slate-500 dark:text-slate-400">
                                    No tasks created yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    );
};

export default TaskManager;
