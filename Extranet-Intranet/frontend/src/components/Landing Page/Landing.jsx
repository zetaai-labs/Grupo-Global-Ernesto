import React from 'react'
import { useNavigate } from 'react-router-dom'

const Landing = () => {
  const navigate = useNavigate()

  // Routing handlers
  const handleIntranetClick = () => {
    navigate('/intranet') // Replace with your actual Intranet route path
  }

  const handleExtranetClick = () => {
    navigate('/extranet') // Replace with your actual Extranet route path
  }

  return (
    <div className="bg-[#F3F4FA] min-h-screen flex items-center justify-center p-4">
      <div className="bg-[#6652CE] w-full max-w-4xl md:w-[70%] h-auto md:h-[60vh] rounded-xl shadow-xl p-6 md:p-10 text-white flex flex-col justify-between">
        
        {/* Top Header / Title */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Landing Page</h1>
          <p className="text-purple-200 text-sm md:text-base">Welcome to your portal dashboard.</p>
        </div>

        {/* Content Area: Left side buttons in column, responsive everywhere */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6 items-center">
          
          {/* Left Side: Buttons stacked vertically in a column */}
          <div className="flex flex-col gap-3 md:col-span-1">
            <button 
              onClick={handleIntranetClick}
              className="bg-white text-[#6652CE] font-semibold py-3 px-4 rounded-lg shadow hover:bg-purple-50 transition-all duration-200 active:scale-95 text-center cursor-pointer"
            >
              Intranet
            </button>
            <button 
              onClick={handleExtranetClick}
              className="bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg shadow hover:bg-purple-800 transition-all duration-200 active:scale-95 border border-purple-500 text-center cursor-pointer"
            >
              Extranet
            </button>
          </div>

          {/* Right Side: Responsive content area */}
          <div className="md:col-span-2 bg-purple-900/40 rounded-lg p-6 border border-purple-400/30 flex items-center justify-center min-h-[140px]">
            <span className="text-purple-200 text-sm md:text-base text-center">
              Select a portal to route to your destination.
            </span>
          </div>

        </div>

        {/* Footer info */}
        <div className="text-xs text-purple-300 text-right">
          Portal Gateway v1.0
        </div>

      </div>
    </div>
  )
}

export default Landing