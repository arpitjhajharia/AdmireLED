import React from 'react';
import { Calculator, ListTodo, Users, BarChart, Shield } from 'lucide-react';

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
            active: false
        },
        {
            id: 'reports',
            name: 'Reporting Manager',
            description: 'Advanced analytics and reporting',
            icon: BarChart,
            color: 'text-orange-500',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
            borderColor: 'border-orange-200 dark:border-orange-800',
            active: false
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
        <div className="max-w-6xl mx-auto p-6 animate-in fade-in duration-500">
            <div className="mb-8 text-center md:text-left">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">Welcome to Admire's Dashboard</h1>
                <p className="text-slate-500 dark:text-slate-400 max-w-2xl">
                    Select a module to continue. More features and modules will be available soon.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {modules.map((mod) => (
                    <button
                        key={mod.id}
                        onClick={() => mod.active ? onSelectModule(mod.id) : null}
                        className={`flex flex-col items-start p-6 rounded-2xl border transition-all duration-300 ${mod.active
                            ? `hover:-translate-y-1 hover:shadow-xl cursor-pointer ${mod.borderColor} bg-white dark:bg-slate-800`
                            : 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                            }`}
                    >
                        <div className={`p-4 rounded-xl mb-4 ${mod.bgColor} ${mod.color}`}>
                            <mod.icon size={32} />
                        </div>

                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
                            {mod.name}
                        </h3>

                        <p className="text-sm text-slate-500 dark:text-slate-400 text-left mb-4">
                            {mod.description}
                        </p>

                        {!mod.active && (
                            <span className="mt-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                                Coming Soon
                            </span>
                        )}

                        {mod.active && (
                            <span className="mt-auto inline-flex items-center text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline">
                                Open Module →
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Home;
