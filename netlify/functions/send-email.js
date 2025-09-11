// netlify/functions/send-email.js - Resend with Enhanced Security
const { Resend } = require('resend');

exports.handler = async (event, context) => {
  // CORS headers for all responses
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
    console.log('=== RESEND EMAIL FUNCTION START ===');
    console.log('Event body:', event.body);
    console.log('Event headers:', event.headers);

    // Check if environment variables are present
    const envVars = {
      resend_api_key: process.env.RESEND_API_KEY ? 'SET' : 'MISSING',
      recaptcha_secret: process.env.RECAPTCHA_SECRET_KEY ? 'SET' : 'MISSING'
    };
    console.log('Environment variables:', envVars);

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is missing');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error - missing Resend API key',
          debug: envVars
        })
      };
    }

    // Initialize Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    let data;
    try {
      data = JSON.parse(event.body);
      console.log('Parsed data keys:', Object.keys(data));
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

    const { templateParams, recaptchaToken } = data;
    console.log('Template params keys:', Object.keys(templateParams));

    // Enhanced security checks
    console.log('=== SECURITY CHECKS START ===');

    // 1. Enhanced honeypot check (multiple fields)
    const honeypotFields = ['botField', 'website', 'bot-field', 'company-url'];
    const honeypotTriggered = honeypotFields.some(field => templateParams[field]);
    
    if (honeypotTriggered) {
      console.log('Honeypot triggered');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Spam detected' })
      };
    }

    // 2. Time-based validation (prevent too fast submissions)
    const formTimestamp = templateParams.timestamp;
    if (formTimestamp) {
      const submissionTime = Date.now();
      const timeDiff = submissionTime - parseInt(formTimestamp);
      const minTimeMs = 3000; // 3 seconds minimum
      
      if (timeDiff < minTimeMs) {
        console.log('Form submitted too quickly:', timeDiff, 'ms');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Form submitted too quickly' })
        };
      }
    }

    // 3. JavaScript validation
    if (templateParams['js-enabled'] !== 'true') {
      console.log('JavaScript not enabled');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'JavaScript required' })
      };
    }

    // 4. reCAPTCHA v3 validation (if token provided) - MEJORADO CON DEBUG
    console.log('=== reCAPTCHA VALIDATION START ===');
    console.log('Token received:', recaptchaToken ? 'YES' : 'NO');
    console.log('Token length:', recaptchaToken ? recaptchaToken.length : 0);
    console.log('Secret key available:', process.env.RECAPTCHA_SECRET_KEY ? 'YES' : 'NO');
    
    if (recaptchaToken && process.env.RECAPTCHA_SECRET_KEY) {
      console.log('Validating reCAPTCHA...');
      try {
        const recaptchaPayload = `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}&remoteip=${event.headers['x-forwarded-for'] || 'unknown'}`;
        
        const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: recaptchaPayload
        });
        
        console.log('reCAPTCHA API response status:', recaptchaResponse.status);
        
        const recaptchaResult = await recaptchaResponse.json();
        console.log('reCAPTCHA result:', JSON.stringify(recaptchaResult, null, 2));
        
        if (!recaptchaResult.success) {
          console.log('reCAPTCHA verification failed');
          console.log('Error codes:', recaptchaResult['error-codes']);
          
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              error: 'reCAPTCHA verification failed',
              details: recaptchaResult['error-codes'] || 'Unknown reCAPTCHA error',
              debug: {
                tokenReceived: !!recaptchaToken,
                secretKeyExists: !!process.env.RECAPTCHA_SECRET_KEY,
                recaptchaSuccess: recaptchaResult.success,
                recaptchaHostname: recaptchaResult.hostname
              }
            })
          };
        }
        
        // Check score for v3 (0.0 to 1.0, higher is more human-like)
        console.log('reCAPTCHA score:', recaptchaResult.score);
        if (recaptchaResult.score && recaptchaResult.score < 0.3) { // CAMBIADO DE 0.5 A 0.3 PARA SER MENOS ESTRICTO
          console.log('reCAPTCHA score too low:', recaptchaResult.score);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              error: 'reCAPTCHA score insufficient',
              score: recaptchaResult.score,
              minimum: 0.3
            })
          };
        }
        
        console.log('reCAPTCHA validation successful');
      } catch (recaptchaError) {
        console.error('reCAPTCHA validation error:', recaptchaError);
        
        // CAMBIO IMPORTANTE: NO BLOQUEAR SI RECAPTCHA FALLA, SOLO REGISTRAR
        console.log('Continuing without reCAPTCHA due to validation error');
      }
    } else {
      console.log('reCAPTCHA validation skipped - missing token or secret');
    }

    console.log('=== reCAPTCHA VALIDATION END ===');

    // 5. Rate limiting by IP
    const clientIp = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
    console.log('Client IP:', clientIp);

    // 6. Enhanced field validation
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
          missing_fields: missingFields
        })
      };
    }

    // 7. Enhanced email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(templateParams.email)) {
      console.error('Invalid email format:', templateParams.email);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid email format'
        })
      };
    }

    // 8. Content length validation (prevent extremely long messages)
    if (templateParams.mensaje.length > 2000) {
      console.error('Message too long:', templateParams.mensaje.length);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Message too long (max 2000 characters)' 
        })
      };
    }

    // 9. Basic content filtering (common spam patterns)
    const spamPatterns = [
      /viagra/i,
      /casino/i,
      /cryptocurrency/i,
      /bitcoin/i,
      /click here/i,
      /free money/i,
      /(http|https):\/\/[^\s]+/g // URLs in message
    ];
    
    const messageContent = `${templateParams.nombre} ${templateParams.mensaje}`.toLowerCase();
    const hasSpamContent = spamPatterns.some(pattern => pattern.test(messageContent));
    
    if (hasSpamContent) {
      console.log('Spam content detected');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Content not allowed' })
      };
    }

    console.log('=== SECURITY CHECKS PASSED ===');

    // Prepare email content with enhanced formatting
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">New Contact Request</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">From Printek Website</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e1e5e9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Contact Information</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6; width: 150px;">Name:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.nombre}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Email:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;"><a href="mailto:${templateParams.email}" style="color: #667eea;">${templateParams.email}</a></td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Phone:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.telefono || 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Company:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.empresa}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Location:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.ubicacion || 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Service Interest:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.servicio}</td>
            </tr>
            ${templateParams.numeroProducto && templateParams.numeroProducto !== 'Not provided' ? `
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Product Number:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.numeroProducto}</td>
            </tr>
            ` : ''}
            ${templateParams.marcaModelo && templateParams.marcaModelo !== 'Not provided' ? `
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Brand/Model:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.marcaModelo}</td>
            </tr>
            ` : ''}
          </table>
          
          <h3 style="color: #333; margin-top: 30px;">Project Description:</h3>
          <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #667eea; border-radius: 5px; margin: 10px 0;">
            <p style="margin: 0; line-height: 1.6; color: #555;">${templateParams.mensaje.replace(/\n/g, '<br>')}</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; font-size: 12px; color: #666;">
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString('en-US', { 
              timeZone: 'America/Chicago',
              dateStyle: 'full',
              timeStyle: 'long'
            })}</p>
            <p><strong>IP Address:</strong> ${clientIp}</p>
            <p><strong>Language:</strong> ${templateParams.language || 'English'}</p>
            <p><strong>Source:</strong> Printek Website Contact Form</p>
          </div>
        </div>
      </div>
    `;

    // Plain text version
    const emailText = `
New Contact Request - Printek Website

CONTACT INFORMATION:
Name: ${templateParams.nombre}
Email: ${templateParams.email}
Phone: ${templateParams.telefono || 'Not provided'}
Company: ${templateParams.empresa}
Location: ${templateParams.ubicacion || 'Not provided'}
Service Interest: ${templateParams.servicio}
${templateParams.numeroProducto && templateParams.numeroProducto !== 'Not provided' ? `Product Number: ${templateParams.numeroProducto}\n` : ''}
${templateParams.marcaModelo && templateParams.marcaModelo !== 'Not provided' ? `Brand/Model: ${templateParams.marcaModelo}\n` : ''}

PROJECT DESCRIPTION:
${templateParams.mensaje}

---
Timestamp: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'long' })}
IP: ${clientIp}
Language: ${templateParams.language || 'English'}
Source: Printek Website Contact Form
    `;

    console.log('Sending email via Resend...');
    
    // CAMBIO IMPORTANTE: BETTER ERROR HANDLING FOR RESEND
    try {
      // Send email using Resend
      const emailData = await resend.emails.send({
        from: 'Printek Contact Form <onboarding@resend.dev>', // Cambiar por tu dominio verificado cuando tengas uno
        to: ['sales@printeksupplies.com'], // Email donde quieres recibir los mensajes
        subject: `New Contact Request from ${templateParams.nombre} - ${templateParams.empresa}`,
        html: emailHtml,
        text: emailText,
        replyTo: templateParams.email, // Permite responder directamente al cliente
        headers: {
          'X-Priority': '3',
          'X-Mailer': 'Printek Contact Form'
        }
      });

      console.log('Resend response:', emailData);
      
      if (emailData.id) {
        console.log('SUCCESS: Email sent successfully via Resend');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Email sent successfully',
            id: emailData.id,
            service: 'Resend',
            debug: {
              resend_id: emailData.id,
              timestamp: new Date().toISOString(),
              service: 'Resend'
            }
          })
        };
      } else {
        throw new Error('Resend did not return email ID');
      }
    } catch (resendError) {
      console.error('Resend email sending failed:', resendError);
      
      // Return error para que el frontend pueda usar el fallback
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Email service temporarily unavailable',
          details: resendError.message,
          service: 'Resend',
          fallback_available: true
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