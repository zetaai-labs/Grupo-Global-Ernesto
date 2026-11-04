import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Globe,
  BadgePercent,
  ShoppingCart,
  Network,
  Headphones,
  FileText,
  Building,
  CheckCircle2,
  Lock,
  ChevronRight,
  Sparkles,
} from 'lucide-react'

export default function ExtranetPortal() {
  const navigate = useNavigate()

  const modules = [
    {
      title: 'Customer Relationship (CRM)',
      desc: 'Lead tracking, client accounts, verified contact directory, quotes generation, and active pipeline.',
      icon: BadgePercent,
      badge: 'B2B Hub',
    },
    {
      title: 'Orders & Fulfillment',
      desc: 'Purchase order processing, delivery statuses, digital POS interfaces, and customer billing.',
      icon: ShoppingCart,
      badge: 'Active Hub',
    },
    {
      title: 'Distribution & Franchises',
      desc: 'Franchise operations across Europe & Asia, distributor agreements, and product catalogs.',
      icon: Network,
      badge: 'Partner Hub',
    },
    {
      title: 'Client Support & Desk',
      desc: 'External client ticket triage, real-time SLA tracking, communications, and customer call logs.',
      icon: Headphones,
      badge: 'Active Hub',
    },
    {
      title: 'Web Document Drop & Inboxes',
      desc: 'Secure client document submission, virus scan verification, and bilateral MetaLink file sharing.',
      icon: FileText,
      badge: 'Encrypted',
    },
    {
      title: 'Enterprise Specialized Suite',
      desc: 'Specialized portals for corporate travel, legal case tracking, logistics fleet, and facilities.',
      icon: Building,
      badge: 'Enterprise',
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
              <div className="w-9 h-9 rounded-xl bg-indigo-700 text-white flex items-center justify-center shadow-sm">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-base">ZYLAX Extranet</span>
                <span className="text-[11px] text-slate-400 block font-medium">External Business Connectivity</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200/80 text-xs font-semibold text-indigo-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Partner Gateway Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        
        {/* Banner */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-3 max-w-2xl">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 backdrop-blur-md">
              PARTNER & CLIENT PORTAL
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              Welcome to ZYLAX Extranet
            </h1>
            <p className="text-sm sm:text-base text-indigo-200 leading-relaxed font-normal">
              Unified collaboration platform connecting Grupo Global with clients, franchise distributors, suppliers, and institutional partners.
            </p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Modules Grid */}
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Extranet Connectivity Hubs</h2>
            <p className="text-xs text-slate-500 mt-1">Select an external partner module to review engagements.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((m) => {
              const Icon = m.icon
              return (
                <div
                  key={m.title}
                  className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-lg transition-all duration-200 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                        {m.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{m.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{m.desc}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-700">
                    <span>Access Portal</span>
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

