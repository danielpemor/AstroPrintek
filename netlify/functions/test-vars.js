exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID || 'MISSING',
      template_id: process.env.EMAILJS_TEMPLATE_ID || 'MISSING',
      public_key: process.env.EMAILJS_PUBLIC_KEY || 'MISSING',
      all_vars: Object.keys(process.env).filter(key => key.includes('EMAIL'))
    })
  };
};