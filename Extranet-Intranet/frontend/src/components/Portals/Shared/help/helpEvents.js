/** Opens the Help & support dialog from anywhere (profile menu, bottom toolbar, error messages). */
export const openHelp = () => window.dispatchEvent(new CustomEvent('gg:help'))
