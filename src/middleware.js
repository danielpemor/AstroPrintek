export function onRequest(context, next) {
  const { request, url } = context;
  
  // Solo aplicar en la página raíz
  if (url.pathname === '/') {
    const acceptLanguage = request.headers.get('accept-language') || '';
    const isEnglish = acceptLanguage.toLowerCase().includes('en') && !acceptLanguage.toLowerCase().includes('es');
    
    if (isEnglish) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/en/' }
      });
    }
  }
  
  return next();
}