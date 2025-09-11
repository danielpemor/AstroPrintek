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
    console.log('=== DEBUG START ===');
    console.log('Event body:', event.body);
    console.log('Event headers:', event.headers);

    // Check if environment variables are present
    const envVars = {
      service_id: process.env.EMAILJS_SERVICE_ID ? 'SET' : 'MISSING',
      template_id: process.env.EMAILJS_TEMPLATE_ID ? 'SET' : 'MISSING',
      public_key: process.env.EMAILJS_PUBLIC_KEY ? 'SET' : 'MISSING'
    };
    console.log('Environment variables:', envVars);

    if (!process.env.EMAILJS_SERVICE_ID || !process.env.EMAILJS_TEMPLATE_ID || !process.env.EMAILJS_PUBLIC_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error - missing environment variables',
          debug: envVars
        })
      };
    }

    let data;
    try {
      data = JSON.parse(event.body);
      console.log('Parsed data:', data);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body',
          received: event.body?.substring(0, 200) + '...'
        })
      };
    }
    
    if (!data.templateParams) {
      console.error('Missing templateParams in data:', Object.keys(data));
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing template parameters',
          received_keys: Object.keys(data)
        })
      };
    }

    const { templateParams } = data;
    console.log('Template params keys:', Object.keys(templateParams));
    console.log('Template params values:', {
      nombre: templateParams.nombre ? 'SET' : 'MISSING',
      email: templateParams.email ? 'SET' : 'MISSING',
      empresa: templateParams.empresa ? 'SET' : 'MISSING',
      mensaje: templateParams.mensaje ? 'SET' : 'MISSING'
    });

    // Basic honeypot check
    if (templateParams.botField || templateParams.website || templateParams['bot-field']) {
      console.log('Honeypot triggered');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Spam detected' })
      };
    }

    // Validate required fields
    const requiredFields = ['nombre', 'email', 'empresa', 'mensaje'];
    const missingFields = requiredFields.filter(field => 
      !templateParams[field] || 
      typeof templateParams[field] !== 'string' || 
      templateParams[field].trim() === ''
    );
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing or empty required fields',
          missing_fields: missingFields,
          received_fields: Object.keys(templateParams)
        })
      };
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(templateParams.email)) {
      console.error('Invalid email format:', templateParams.email);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid email format',
          received_email: templateParams.email
        })
      };
    }

    // Prepare EmailJS payload
    const emailPayload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      template_params: {
        ...templateParams,
        server_timestamp: new Date().toISOString(),
        client_ip: event.headers['x-forwarded-for'] || 'Unknown'
      }
    };

    console.log('EmailJS payload structure:', {
      service_id: emailPayload.service_id?.substring(0, 8) + '...',
      template_id: emailPayload.template_id?.substring(0, 8) + '...',
      user_id: emailPayload.user_id?.substring(0, 8) + '...',
      template_params_keys: Object.keys(emailPayload.template_params)
    });

    // Send email using EmailJS API
    console.log('Sending request to EmailJS...');
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Printek-Contact-Form/1.0'
      },
      body: JSON.stringify(emailPayload)
    });

    const responseText = await response.text();
    console.log('EmailJS response status:', response.status);
    console.log('EmailJS response text:', responseText);
    
    if (response.ok) {
      console.log('SUCCESS: Email sent successfully');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Email sent successfully',
          debug: {
            emailjs_response: responseText,
            timestamp: new Date().toISOString()
          }
        })
      };
    } else {
      console.error('EmailJS API error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });
      
      let errorDetails = 'Unknown EmailJS error';
      try {
        const errorData = JSON.parse(responseText);
        errorDetails = errorData.message || errorData.error || responseText;
      } catch (e) {
        errorDetails = responseText || 'No error details available';
      }
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'EmailJS API error',
          details: errorDetails,
          status: response.status,
          debug: {
            emailjs_status: response.status,
            emailjs_response: responseText
          }
        })
      };
    }

  } catch (error) {
    console.error('=== FUNCTION ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        debug: {
          error_name: error.name,
          error_message: error.message,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
};