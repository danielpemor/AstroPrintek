exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    if (!data.templateParams) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing template parameters' })
      };
    }

    // Verificaciones anti-spam en el servidor
    const { templateParams } = data;
    
    // Verificar campos honeypot (si los envías desde el frontend)
    if (templateParams.botField || templateParams.website) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Spam detected' })
      };
    }

    // Verificar reCAPTCHA v3 en servidor (opcional)
    if (process.env.RECAPTCHA_SECRET_KEY && data.recaptchaToken) {
      const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${data.recaptchaToken}`
      });
      
      const recaptchaResult = await recaptchaResponse.json();
      
      if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'reCAPTCHA verification failed' })
        };
      }
    }

    // Enviar email usando EmailJS API
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        template_params: templateParams
      })
    });

    if (response.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Email sent successfully' })
      };
    } else {
      const errorData = await response.text();
      console.error('EmailJS error:', errorData);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Failed to send email' })
      };
    }

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};