// Función global para detectar idioma con prioridades correctas
export function detectLanguage() {
  // PRIORIDAD 1: Preferencia manual guardada
  if (typeof window !== 'undefined') {
    const manualPref = localStorage.getItem('user_preferred_lang');
    if (manualPref) {
      return manualPref;
    }
  }
  
  // PRIORIDAD 2: URL - Si tiene /en/ es inglés
  if (typeof window !== 'undefined') {
    const urlPath = window.location.pathname;
    if (urlPath.startsWith('/en/') || urlPath === '/en') {
      return 'en';
    }
  }
  
  // PRIORIDAD 3: Navegador (solo primera visita)
  if (typeof window !== 'undefined') {
    const browserLang = navigator.language || navigator.languages[0];
    const langCode = browserLang.split('-')[0].toLowerCase();
    return langCode === 'en' ? 'en' : 'es';
  }
  
  return 'es'; // Fallback
}

// Función para guardar preferencia manual
export function setManualLanguagePreference(lang) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_preferred_lang', lang);
  }
}