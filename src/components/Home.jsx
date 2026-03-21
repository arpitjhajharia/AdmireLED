import React from 'react';
import { Calculator, ListTodo, Users, BarChart, Shield, Archive, Scissors } from 'lucide-react';

const Home = ({ onSelectModule, darkMode, showAdmin }) => {
    const modules = [
        {
            id: 'led',
            name: 'LED Calculator',
            description: 'Calculate BOM and manage LED quotes',
            icon: Calculator,
            color: 'text-teal-500',
            bgColor: 'bg-teal-50 dark:bg-teal-900/20',
            borderColor: 'border-teal-200 dark:border-teal-800',
            active: true
        },
        {
            id: 'tasks',
            name: 'Task List',
            description: 'Manage and track project tasks',
            icon: ListTodo,
            color: 'text-blue-500',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
            borderColor: 'border-blue-200 dark:border-blue-800',
            active: true
        },
        {
            id: 'crm',
            name: 'CRM',
            description: 'Customer relationship management',
            icon: Users,
            color: 'text-purple-500',
            bgColor: 'bg-purple-50 dark:bg-purple-900/20',
            borderColor: 'border-purple-200 dark:border-purple-800',
            active: true
        },
        {
            id: 'reports',
            name: 'BOQ Tracker',
            description: 'Manage and track BOQ items and progress',
            icon: BarChart,
            color: 'text-orange-500',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
            borderColor: 'border-orange-200 dark:border-orange-800',
            active: true
        },
        {
            id: 'misc_stock',
            name: 'Misc Stock',
            description: 'Track miscellaneous inventory and FIFO ledger',
            icon: Archive,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
            borderColor: 'border-indigo-200 dark:border-indigo-800',
            active: true
        },
        {
            id: 'cut_list',
            name: 'Cut List',
            description: '1D/2D Optimiser for sheets and bars',
            icon: Scissors,
            color: 'text-amber-500',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
            borderColor: 'border-amber-200 dark:border-amber-800',
            active: true
        }
    ];

    if (showAdmin) {
        modules.push({
            id: 'admin',
            name: 'Admin Control',
            description: 'Manage users, roles and database backups',
            icon: Shield,
            color: 'text-rose-500',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
            borderColor: 'border-rose-200 dark:border-rose-800',
            active: true
        });
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-4 sm:p-6 animate-in fade-in duration-500">
            {/* Header — compact on mobile */}
            <div className="mb-4 sm:mb-8 text-center md:text-left">
                <h1 className="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-1 sm:mb-2">
                    Welcome to Admire's Dashboard
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                    Select a module to continue.
                </p>
            </div>

            {/* 2-col on mobile, 2-col on md, 4-col on lg */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                {modules.map((mod) => (
                    <button
                        key={mod.id}
                        onClick={() => mod.active ? onSelectModule(mod.id) : null}
                        className={`flex flex-col items-start p-3 sm:p-6 rounded-xl sm:rounded-2xl border transition-all duration-300 text-left ${mod.active
                            ? `hover:-translate-y-1 hover:shadow-xl cursor-pointer ${mod.borderColor} bg-white dark:bg-slate-800`
                            : 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                            }`}
                    >
                        {/* Icon — smaller on mobile */}
                        <div className={`p-2 sm:p-4 rounded-lg sm:rounded-xl mb-2 sm:mb-4 ${mod.bgColor} ${mod.color}`}>
                            <mod.icon size={20} className="sm:hidden" />
                            <mod.icon size={32} className="hidden sm:block" />
                        </div>

                        <h3 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-slate-100 mb-0.5 sm:mb-2 leading-tight">
                            {mod.name}
                        </h3>

                        <p className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400 mb-2 sm:mb-4 leading-snug line-clamp-2">
                            {mod.description}
                        </p>

                        {!mod.active && (
                            <span className="mt-auto inline-flex items-center px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                                Coming Soon
                            </span>
                        )}

                        {mod.active && (
                            <span className="mt-auto inline-flex items-center text-[10px] sm:text-sm font-semibold text-teal-600 dark:text-teal-400">
                                Open →
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Home;
