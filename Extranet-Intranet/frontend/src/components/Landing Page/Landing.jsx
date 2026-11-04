import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield,
  Lock,
  Layers,
  Network,
  Users,
  Briefcase,
  CircleDollarSign,
  FileText,
  Server,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Menu,
  X,
  Globe,
  Building2,
  Sparkles,
  Cpu,
  BadgePercent,
  ShoppingCart,
  Headphones,
  KeyRound,
  FileSpreadsheet,
  Workflow,
  Radio,
  ExternalLink,
} from 'lucide-react'

const Landing = () => {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Routing handlers
  const handleIntranetClick = () => {
    navigate('/intranet')
  }

  const handleExtranetClick = () => {
    navigate('/extranet')
  }

  const scrollToSection = (id) => {
    setMobileMenuOpen(false)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFDFE] text-slate-800 font-sans selection:bg-purple-100 selection:text-purple-900">
      
      {/* ========================================== */}
      {/* SECTION 1: NAVIGATION HEADER (Sticky)     */}
      {/* ========================================== */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Left Side: Brand & Identity */}
          <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-800 via-indigo-700 to-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-900/15 ring-1 ring-purple-500/20">
              <Layers className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  ZYLAX
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200/60 rounded">
                  ENTERPRISE
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 tracking-wide">
                Enterprise Digital Ecosystem
              </span>
            </div>
          </div>

          {/* Right Side: Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-sm font-semibold text-slate-600 hover:text-purple-700 transition-colors"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('portals')}
              className="text-sm font-semibold text-slate-600 hover:text-purple-700 transition-colors"
            >
              Portals
            </button>
            <button
              onClick={() => scrollToSection('why-zylax')}
              className="text-sm font-semibold text-slate-600 hover:text-purple-700 transition-colors"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection('platform')}
              className="text-sm font-semibold text-slate-600 hover:text-purple-700 transition-colors"
            >
              Our Platform
            </button>
            <button
              onClick={() => scrollToSection('security')}
              className="text-sm font-semibold text-slate-600 hover:text-purple-700 transition-colors"
            >
              Security
            </button>

            {/* Secure Access Indicator */}
            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Secure Access</span>
              </div>
            </div>
          </nav>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-6 py-5 shadow-xl animate-in slide-in-from-top-3 duration-200">
            <div className="flex flex-col gap-4">
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="text-left text-sm font-semibold text-slate-700 hover:text-purple-700 py-1"
              >
                Home
              </button>
              <button
                onClick={() => scrollToSection('portals')}
                className="text-left text-sm font-semibold text-slate-700 hover:text-purple-700 py-1"
              >
                Portals Selection
              </button>
              <button
                onClick={() => scrollToSection('why-zylax')}
                className="text-left text-sm font-semibold text-slate-700 hover:text-purple-700 py-1"
              >
                About Platform
              </button>
              <button
                onClick={() => scrollToSection('platform')}
                className="text-left text-sm font-semibold text-slate-700 hover:text-purple-700 py-1"
              >
                Ecosystem Capabilities
              </button>
              <button
                onClick={() => scrollToSection('security')}
                className="text-left text-sm font-semibold text-slate-700 hover:text-purple-700 py-1"
              >
                Security & Trust
              </button>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Gateway Status: Encrypted & Active</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ========================================== */}
      {/* SECTION 2: HERO SECTION                    */}
      {/* ========================================== */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        
        {/* Subtle Background Radial Highlights */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-purple-100/60 via-indigo-50/40 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Column: Typography & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-purple-200/80 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                  ENTERPRISE DIGITAL ECOSYSTEM
                </span>
              </div>

              {/* Main Heading */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.12]">
                One Connected Ecosystem.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800">
                  Infinite Possibilities.
                </span>
              </h1>

              {/* Supporting Text */}
              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Empowering organizations through intelligent collaboration, secure operations and seamless business connectivity across internal teams and international external partners.
              </p>

              {/* CTAs */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <button
                  onClick={() => scrollToSection('portals')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-sm shadow-lg shadow-purple-900/20 hover:shadow-purple-900/30 transition-all duration-200 active:scale-98 cursor-pointer"
                >
                  <span>Select Portal Below</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scrollToSection('platform')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-200 shadow-xs transition-all duration-200 cursor-pointer"
                >
                  <span>Platform Overview</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Key Trust Signals */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-slate-200/60 text-slate-600">
                <div className="text-center lg:text-left">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900">99.99%</div>
                  <div className="text-xs text-slate-500 font-medium">Uptime Reliability</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900">Tier-4</div>
                  <div className="text-xs text-slate-500 font-medium">Encrypted Vaults</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900">Bilateral</div>
                  <div className="text-xs text-slate-500 font-medium">Global Network</div>
                </div>
              </div>

            </div>

            {/* Right Column: Visual Architecture Illustration */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                
                {/* Decorative glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 rounded-3xl blur-xl opacity-70 pointer-events-none" />

                {/* Main Card Graphic */}
                <div className="relative bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xl space-y-6">
                  
                  {/* Visual Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      zylax.mesh.network::secure
                    </span>
                  </div>

                  {/* Central Hub Representation */}
                  <div className="flex items-center justify-center py-2">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-900 flex flex-col items-center justify-center text-white shadow-xl shadow-purple-950/20 ring-4 ring-purple-100">
                      <Layers className="w-8 h-8 stroke-[2.2]" />
                      <span className="text-[9px] font-bold tracking-widest mt-0.5">CORE</span>
                    </div>
                  </div>

                  {/* Interconnected Nodes */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    
                    <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-700 text-white flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-purple-950">Intranet</div>
                        <div className="text-[10px] text-purple-700 font-medium">Internal Corporate</div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-indigo-950">Extranet</div>
                        <div className="text-[10px] text-indigo-700 font-medium">Client & Partners</div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-150 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">DataPlus Vault</div>
                        <div className="text-[10px] text-slate-500 font-medium">Cloud Documents</div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-150 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">Zero-Trust IAM</div>
                        <div className="text-[10px] text-slate-500 font-medium">RBAC Security</div>
                      </div>
                    </div>

                  </div>

                  {/* Bottom status chip */}
                  <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Bilateral Mesh Active
                    </span>
                    <span className="font-mono text-slate-400">Madrid • Frankfurt • BLR</span>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================== */}
      {/* SECTION 3: PORTAL SELECTION (MOST IMPORTANT) */}
      {/* ========================================== */}
      <section id="portals" className="py-20 lg:py-28 bg-[#F6F7FB] relative border-y border-slate-200/80">
        
        {/* Section Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100/70 border border-purple-200 text-purple-800 text-xs font-bold uppercase tracking-wider mb-3">
            <Radio className="w-3.5 h-3.5 text-purple-700 animate-pulse" />
            <span>PORTAL GATEWAY SELECTOR</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Choose Your Destination Portal
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
            Select between the internal enterprise workspace or the external business connectivity environment.
          </p>
        </div>

        {/* The Two Main Portal Cards */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">

            {/* ------------------------------------------ */}
            {/* CARD 1: ZYLAX INTRANET                     */}
            {/* ------------------------------------------ */}
            <div className="group relative rounded-3xl bg-white border border-slate-200/90 shadow-xl hover:shadow-2xl hover:border-purple-300 transition-all duration-300 flex flex-col justify-between overflow-hidden">
              
              {/* Gradient Top Stripe */}
              <div className="h-2.5 w-full bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800" />

              <div className="p-8 sm:p-10 space-y-7">
                
                {/* Header & Subtitle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200/60">
                      <Building2 className="w-3.5 h-3.5 text-purple-600" />
                      INTERNAL CORPORATE WORKSPACE
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
                      Intranet Portal
                    </h3>
                  </div>

                  <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-200/60 flex items-center justify-center text-purple-700 group-hover:scale-105 group-hover:bg-purple-700 group-hover:text-white transition-all duration-300 shadow-sm shrink-0">
                    <Building2 className="w-7 h-7" />
                  </div>
                </div>

                {/* Description */}
                <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                  Your centralized workspace for employee management, internal collaboration, project operations and corporate resources.
                </p>

                {/* Feature Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <Users className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Employee & HR Management</span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <Briefcase className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Projects & Task Management</span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <CircleDollarSign className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Finance & Operations</span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Documents & Internal Comms</span>
                  </div>
                </div>

                {/* Micro Metric Preview */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-900 to-indigo-950 text-white text-xs flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-purple-300 uppercase tracking-wider font-semibold">Workspace Status</div>
                    <div className="font-bold text-sm text-white mt-0.5">1,480+ Staff Verified</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operations Online
                  </span>
                </div>

              </div>

              {/* Bottom Action Area */}
              <div className="p-8 sm:p-10 pt-0">
                <button
                  onClick={handleIntranetClick}
                  className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-base shadow-lg shadow-purple-900/20 group-hover:shadow-purple-900/30 transition-all duration-200 active:scale-98 cursor-pointer"
                >
                  <span>Explore Intranet</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

            </div>

            {/* ------------------------------------------ */}
            {/* CARD 2: ZYLAX EXTRANET                     */}
            {/* ------------------------------------------ */}
            <div className="group relative rounded-3xl bg-white border border-slate-200/90 shadow-xl hover:shadow-2xl hover:border-indigo-300 transition-all duration-300 flex flex-col justify-between overflow-hidden">
              
              {/* Gradient Top Stripe */}
              <div className="h-2.5 w-full bg-gradient-to-r from-indigo-700 via-purple-600 to-indigo-800" />

              <div className="p-8 sm:p-10 space-y-7">
                
                {/* Header & Subtitle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200/60">
                      <Globe className="w-3.5 h-3.5 text-indigo-600" />
                      EXTERNAL BUSINESS CONNECTIVITY
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
                      Extranet Portal
                    </h3>
                  </div>

                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700 group-hover:scale-105 group-hover:bg-indigo-700 group-hover:text-white transition-all duration-300 shadow-sm shrink-0">
                    <Globe className="w-7 h-7" />
                  </div>
                </div>

                {/* Description */}
                <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                  Connect with clients, vendors and partners through a unified platform for customer relationships, business operations and external collaboration.
                </p>

                {/* Feature Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <BadgePercent className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Customer Relationship (CRM)</span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <ShoppingCart className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Orders & Product Catalog</span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <Network className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Vendors & Distributors</span>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-700">
                    <Headphones className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Client Support & Partnerships</span>
                  </div>
                </div>

                {/* Micro Metric Preview */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white text-xs flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-indigo-300 uppercase tracking-wider font-semibold">Partner Ecosystem</div>
                    <div className="font-bold text-sm text-white mt-0.5">8,540+ Global Clients</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-indigo-300 text-[11px] font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    B2B Gateway Active
                  </span>
                </div>

              </div>

              {/* Bottom Action Area */}
              <div className="p-8 sm:p-10 pt-0">
                <button
                  onClick={handleExtranetClick}
                  className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-base shadow-lg shadow-indigo-900/20 group-hover:shadow-indigo-900/30 transition-all duration-200 active:scale-98 cursor-pointer"
                >
                  <span>Explore Extranet</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

            </div>

          </div>
        </div>

      </section>

      {/* ========================================== */}
      {/* SECTION 4: WHY ZYLAX                       */}
      {/* ========================================== */}
      <section id="why-zylax" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200/60">
              CORE CAPABILITIES
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Why Organizations Rely on ZYLAX
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Built from the ground up for high-performance international enterprises requiring dependable operational command.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            
            {/* Block 1 */}
            <div className="p-7 rounded-2xl bg-[#FAF9FF] border border-purple-100/80 hover:border-purple-300 hover:shadow-lg transition-all duration-200 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Unified Operations</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Manage business operations from one centralized ecosystem without siloed software disconnects.
              </p>
            </div>

            {/* Block 2 */}
            <div className="p-7 rounded-2xl bg-[#FAF9FF] border border-purple-100/80 hover:border-purple-300 hover:shadow-lg transition-all duration-200 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Secure Infrastructure</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Protect organizational information through controlled access, encrypted vaults, and security-focused architecture.
              </p>
            </div>

            {/* Block 3 */}
            <div className="p-7 rounded-2xl bg-[#FAF9FF] border border-purple-100/80 hover:border-purple-300 hover:shadow-lg transition-all duration-200 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Network className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Seamless Collaboration</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Connect employees, teams, clients, and partners across global locations in a single responsive interface.
              </p>
            </div>

            {/* Block 4 */}
            <div className="p-7 rounded-2xl bg-[#FAF9FF] border border-purple-100/80 hover:border-purple-300 hover:shadow-lg transition-all duration-200 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Scalable Architecture</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Support multiple departments, growing transaction volumes, and evolving business operations gracefully.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================== */}
      {/* SECTION 5: PLATFORM OVERVIEW               */}
      {/* ========================================== */}
      <section id="platform" className="py-20 lg:py-28 bg-[#F8F9FC] border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200/60">
              ECOSYSTEM MODULES
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Comprehensive Enterprise Capabilities
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              A breakdown of specialized modules engineered for internal efficiency and external partner engagement.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Category 1 */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all duration-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Human Capital Management</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Complete employee directories, organizational hierarchy trees, induction pipelines, attendance logs, and workplace safety compliance.
              </p>
              <div className="text-[11px] font-semibold text-purple-700 pt-1 flex items-center gap-1">
                <span>Integrated into Intranet</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            {/* Category 2 */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all duration-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <CircleDollarSign className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Finance & Procurement</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Corporate expense reconciliation, vendor SLA tracking, competitive e-procurement tenders, and multi-tier approval workflows.
              </p>
              <div className="text-[11px] font-semibold text-indigo-700 pt-1 flex items-center gap-1">
                <span>Integrated into Intranet</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            {/* Category 3 */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all duration-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Project & Task Management</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Portfolio project tracking, milestone timelines, interactive drag-and-drop Kanban boards, and cross-department assignments.
              </p>
              <div className="text-[11px] font-semibold text-purple-700 pt-1 flex items-center gap-1">
                <span>Integrated into Intranet</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            {/* Category 4 */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all duration-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <BadgePercent className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">CRM & Sales</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                B2B sales pipelines, customer account directories, official quotes, active purchase orders, and point-of-sale catalog ordering.
              </p>
              <div className="text-[11px] font-semibold text-indigo-700 pt-1 flex items-center gap-1">
                <span>Integrated into Extranet</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            {/* Category 5 */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all duration-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Document Management (DataPlus)</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Hierarchical cloud folders, encrypted MetaLinks sharing, external web upload inboxes, and automated AutoFlow routing rules.
              </p>
              <div className="text-[11px] font-semibold text-purple-700 pt-1 flex items-center gap-1">
                <span>Cross-Portal Infrastructure</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            {/* Category 6 */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all duration-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <Server className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">IT & Technical Operations</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cluster hardware assets, incident triage tracker, internal HelpDesk queues, multi-region synthetic uptime, and latency monitors.
              </p>
              <div className="text-[11px] font-semibold text-indigo-700 pt-1 flex items-center gap-1">
                <span>Integrated into Intranet</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================== */}
      {/* SECTION 6: SECURITY & TRUST               */}
      {/* ========================================== */}
      <section id="security" className="py-20 lg:py-28 bg-white border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mx-auto text-center mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200/60">
              TRUST & GOVERNANCE
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Enterprise-Grade Security Architecture
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Engineered with defense-in-depth principles to protect mission-critical business data across international operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/70 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 mx-auto flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Secure Access</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Authenticated gateway validation with multi-factor session tokens.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/70 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 mx-auto flex items-center justify-center">
                <KeyRound className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Role-Based Permissions</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Fine-grained RBAC separating administrator, staff, client, and vendor privileges.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/70 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Controlled Sharing</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Expiring MetaLinks with download quotas and password protections.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/70 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 mx-auto flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Data Protection</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Encrypted storage arrays with automated historical snapshot backups.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/70 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 mx-auto flex items-center justify-center">
                <Workflow className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Enterprise Operations</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Immutable audit trails logging activities across intranet and extranet nodes.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================== */}
      {/* SECTION 7: FOOTER                          */}
      {/* ========================================== */}
      <footer className="bg-[#0E0C1B] text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800/80">
            
            {/* Col 1: Brand Info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-black tracking-tight text-white uppercase">
                    ZYLAX
                  </span>
                  <span className="text-[10px] font-semibold text-purple-400 tracking-wider">
                    GRUPO GLOBAL ZETA AI LABS
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                A unified corporate Intranet and Extranet ecosystem designed for Grupo Global Plataforma Bilateral to centralize document management, internal collaboration, and international partner connectivity.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Multi-Regional Infrastructure Active</span>
              </div>
            </div>

            {/* Col 2: Quick Navigation */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Quick Navigation
              </h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-white transition-colors">
                    Home Gateway
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('portals')} className="hover:text-white transition-colors">
                    Portal Selector
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('why-zylax')} className="hover:text-white transition-colors">
                    About ZYLAX
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('platform')} className="hover:text-white transition-colors">
                    Ecosystem Modules
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Enterprise Portals */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Portals
              </h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={handleIntranetClick} className="hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors">
                    <span>Intranet Portal</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </li>
                <li>
                  <button onClick={handleExtranetClick} className="hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors">
                    <span>Extranet Portal</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('security')} className="hover:text-white transition-colors">
                    Security Architecture
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('platform')} className="hover:text-white transition-colors">
                    DataPlus Storage Vault
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 4: Corporate & Legal */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Governance & Terms
              </h4>
              <ul className="space-y-2 text-xs">
                <li className="hover:text-white cursor-pointer transition-colors">
                  Privacy Policy & Data Sovereignty
                </li>
                <li className="hover:text-white cursor-pointer transition-colors">
                  Acceptable Use Policy
                </li>
                <li className="hover:text-white cursor-pointer transition-colors">
                  Bilateral Enterprise Terms
                </li>
                <li className="hover:text-white cursor-pointer transition-colors">
                  Contact System Administration
                </li>
              </ul>
            </div>

          </div>

          {/* Bottom Copyright Strip */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>
              © {new Date().getFullYear()} ZYLAX. All rights reserved. Grupo Global Zeta AI Labs.
            </p>
            <div className="flex items-center gap-4 text-[11px]">
              <span>Madrid</span>
              <span>•</span>
              <span>Frankfurt</span>
              <span>•</span>
              <span>London</span>
              <span>•</span>
              <span>Bangalore</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  )
}

export default Landing
