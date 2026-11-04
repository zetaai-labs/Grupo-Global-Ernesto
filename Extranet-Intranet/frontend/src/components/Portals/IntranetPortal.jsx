import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Users,
  Briefcase,
  CircleDollarSign,
  FileText,
  Server,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Layers,
  ChevronRight,
} from 'lucide-react'

export default function IntranetPortal() {
  const navigate = useNavigate()

  const modules = [
    {
      title: 'Talent & Human Capital',
      desc: 'Employee directory, organization hierarchy charts, onboarding workflows, and workplace safety.',
      icon: Users,
      badge: 'Active Hub',
    },
    {
      title: 'Finance & Procurement',
      desc: 'Expense management, vendor contracts, competitive e-procurement tenders, and approval queues.',
      icon: CircleDollarSign,
      badge: 'Active Hub',
    },
    {
      title: 'Projects & Tasks',
      desc: 'Enterprise engineering programs, sprint deliverables, and interactive Kanban task boards.',
      icon: Briefcase,
      badge: 'Active Hub',
    },
    {
      title: 'IT Infrastructure',
      desc: 'Cluster asset management, bug & incident tracking, HelpDesk, and synthetic site inspector.',
      icon: Server,
      badge: 'Active Hub',
    },
    {
      title: 'DataPlus Document Vault',
      desc: 'Centralized hierarchical cloud folders, recycle bin, automated historical backups, and MetaLinks.',
      icon: FileText,
      badge: 'Active Hub',
    },
    {
      title: 'Administration & Governance',
      desc: 'Role-based access matrix, multi-tenant permissions, system logs, and security controls.',
      icon: ShieldCheck,
      badge: 'Restricted',
    },
  ]

  return (
    <div className="min-h-screen bg-[#FDFDFE] text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Return to Main Landing Gateway"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-sm">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-base">ZYLAX Intranet</span>
                <span className="text-[11px] text-slate-400 block font-medium">Internal Corporate Workspace</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/80 text-xs font-semibold text-purple-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Internal Gateway Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        
        {/* Banner */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-3 max-w-2xl">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 backdrop-blur-md">
              CORPORATE ENVIRONMENT
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              Welcome to ZYLAX Intranet
            </h1>
            <p className="text-sm sm:text-base text-purple-200 leading-relaxed font-normal">
              Centralized platform for internal team coordination, operations management, document repository, and administrative workflows.
            </p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Modules Grid */}
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Intranet Workspace Modules</h2>
            <p className="text-xs text-slate-500 mt-1">Select an internal operational area to manage your daily tasks.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((m) => {
              const Icon = m.icon
              return (
                <div
                  key={m.title}
                  className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-300 hover:shadow-lg transition-all duration-200 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                        {m.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{m.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{m.desc}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-purple-700">
                    <span>Access Workspace</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Back Button */}
        <div className="pt-6 border-t border-slate-200 text-center">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Portal Gateway</span>
          </button>
        </div>

      </main>
    </div>
  )
}

