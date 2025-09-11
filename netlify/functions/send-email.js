exports.handler = async (event, context) => {
  // Add CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Check if environment variables are present
    const requiredVars = ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing environment variables:', missingVars);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error',
          details: `Missing variables: ${missingVars.join(', ')}`
        })
      };
    }

    const data = JSON.parse(event.body);
    
    if (!data.templateParams) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing template parameters' })
      };
    }

    // Enhanced anti-spam checks
    const { templateParams } = data;
    
    // Check honeypot fields
    if (templateParams.botField || 
        templateParams.website || 
        templateParams['company-url'] ||
        templateParams['bot-field']) {
      console.log('Spam detected: honeypot field filled');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Spam detected' })
      };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /https?:\/\//i,  // URLs in message
      /\b(viagra|casino|loan|credit)\b/i,  // Common spam words
      /(click here|act now|limited time)/i  // Spam phrases
    ];

    const messageText = (templateParams.mensaje || '').toLowerCase();
    if (suspiciousPatterns.some(pattern => pattern.test(messageText))) {
      console.log('Spam detected: suspicious content');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Content not allowed' })
      };
    }

    // Validate required fields
    const requiredFields = ['nombre', 'email', 'empresa', 'ubicacion', 'servicio', 'mensaje'];
    const missingFields = requiredFields.filter(field => !templateParams[field] || templateParams[field].trim() === '');
    
    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields',
          fields: missingFields
        })
      };
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(templateParams.email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Check message length
    if (templateParams.mensaje.length < 10 || templateParams.mensaje.length > 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message length must be between 10 and 1000 characters' })
      };
    }

    // Optional: reCAPTCHA verification
    if (process.env.RECAPTCHA_SECRET_KEY && data.recaptchaToken) {
      try {
        const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${data.recaptchaToken}`
        });
        
        const recaptchaResult = await recaptchaResponse.json();
        
        if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
          console.log('reCAPTCHA failed:', recaptchaResult);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'reCAPTCHA verification failed' })
          };
        }
      } catch (recaptchaError) {
        console.error('reCAPTCHA error:', recaptchaError);
        // Continue without reCAPTCHA if there's an error
      }
    }

    // Prepare EmailJS payload
    const emailPayload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      template_params: {
        ...templateParams,
        // Add server-side timestamp
        server_timestamp: new Date().toLocaleString('en-US', { 
          timeZone: 'America/Chicago',
          dateStyle: 'full',
          timeStyle: 'long'
        }),
        // Add client IP (if available)
        client_ip: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'Unknown',
        user_agent: event.headers['user-agent'] || 'Unknown'
      }
    };

    console.log('Sending email with payload:', {
      service_id: emailPayload.service_id,
      template_id: emailPayload.template_id,
      user_id: emailPayload.user_id?.substring(0, 8) + '...',
      params_keys: Object.keys(emailPayload.template_params)
    });

    // Send email using EmailJS API
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Printek-Contact-Form/1.0'
      },
      body: JSON.stringify(emailPayload)
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('Email sent successfully:', responseText);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Email sent successfully',
          timestamp: new Date().toISOString()
        })
      };
    } else {
      console.error('EmailJS API error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });
      
      // Parse error response if possible
      let errorMessage = 'Failed to send email';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorMessage;
      } catch (parseError) {
        // Use default message if parsing fails
      }
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: errorMessage,
          details: response.status === 400 ? 'Invalid request parameters' : 'Service temporarily unavailable'
        })
      };
    }

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Please try again later or contact support'
      })
    };
  }
};