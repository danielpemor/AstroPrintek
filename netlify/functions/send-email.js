// netlify/functions/send-email.js - Versión Corregida para Resend
const { Resend } = require('resend');

exports.handler = async (event, context) => {
  // CORS headers consistentes para todas las respuestas
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
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

    // Verificar variables de entorno
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is missing');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error - missing Resend API key'
        })
      };
    }

    // Initialize Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Parse request body
    let data;
    try {
      data = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON format',
          details: parseError.message
        })
      };
    }
        
    // Verificar estructura de datos
    if (!data.templateParams) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing template parameters. Expected { templateParams: { nombre, email, ... } }' 
        })
      };
    }

    const { templateParams, recaptchaToken } = data;
    console.log('Template params received:', Object.keys(templateParams));

    // ========== VALIDACIONES DE SEGURIDAD ==========

    // 1. Honeypot check
    const honeypotFields = ['botField', 'website', 'bot-field', 'company-url'];
    const honeypotTriggered = honeypotFields.some(field => 
      templateParams[field] && templateParams[field].trim() !== ''
    );
    
    if (honeypotTriggered) {
      console.log('Honeypot triggered');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Spam detected' })
      };
    }

    // 2. Time-based validation
    if (templateParams.timestamp) {
      const submissionTime = Date.now();
      const timeDiff = submissionTime - parseInt(templateParams.timestamp);
      const minTimeMs = 2000; // 2 segundos mínimo
      
      if (timeDiff < minTimeMs) {
        console.log('Form submitted too quickly:', timeDiff, 'ms');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Form submitted too quickly' })
        };
      }
    }

    // 3. Verificar campos requeridos
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
          error: 'Missing required fields',
          missing_fields: missingFields
        })
      };
    }

    // 4. Validar formato de email
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

    // 5. Validar longitud del mensaje
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

    // 6. reCAPTCHA validation (si está disponible)
    if (recaptchaToken && process.env.RECAPTCHA_SECRET_KEY) {
      console.log('Validating reCAPTCHA...');
      try {
        const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
        });
        
        const recaptchaResult = await recaptchaResponse.json();
        console.log('reCAPTCHA result:', recaptchaResult);
        
        if (!recaptchaResult.success) {
          console.log('reCAPTCHA verification failed');
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              error: 'reCAPTCHA verification failed'
            })
          };
        }
        
        // Check score for v3
        if (recaptchaResult.score && recaptchaResult.score < 0.3) {
          console.log('reCAPTCHA score too low:', recaptchaResult.score);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              error: 'reCAPTCHA score insufficient'
            })
          };
        }
        
      } catch (recaptchaError) {
        console.error('reCAPTCHA validation error:', recaptchaError);
        // Continue without blocking if reCAPTCHA fails
      }
    }

    console.log('Security validations passed');

    // ========== PREPARAR EMAIL ==========

    const clientIp = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';

    // HTML version del email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Nuevo Contacto</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Desde el sitio web de Printek</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e1e5e9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Información de Contacto</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6; width: 150px;">Nombre:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.nombre}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Email:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;"><a href="mailto:${templateParams.email}" style="color: #667eea;">${templateParams.email}</a></td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Teléfono:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.telefono || 'No proporcionado'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Empresa:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.empresa}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Ubicación:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.ubicacion || 'No proporcionado'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; border: 1px solid #dee2e6;">Servicio de Interés:</td>
              <td style="padding: 12px; border: 1px solid #dee2e6;">${templateParams.servicio || 'No especificado'}</td>
            </tr>
          </table>
          
          <h3 style="color: #333; margin-top: 30px;">Mensaje:</h3>
          <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #667eea; border-radius: 5px; margin: 10px 0;">
            <p style="margin: 0; line-height: 1.6; color: #555;">${templateParams.mensaje.replace(/\n/g, '<br>')}</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; font-size: 12px; color: #666;">
            <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-ES', { 
              timeZone: 'America/Mexico_City',
              dateStyle: 'full',
              timeStyle: 'long'
            })}</p>
            <p><strong>IP:</strong> ${clientIp}</p>
            <p><strong>Fuente:</strong> Formulario de contacto del sitio web</p>
          </div>
        </div>
      </div>
    `;

    // Texto plano
    const emailText = `
Nuevo Contacto - Sitio Web Printek

INFORMACIÓN DE CONTACTO:
Nombre: ${templateParams.nombre}
Email: ${templateParams.email}
Teléfono: ${templateParams.telefono || 'No proporcionado'}
Empresa: ${templateParams.empresa}
Ubicación: ${templateParams.ubicacion || 'No proporcionado'}
Servicio: ${templateParams.servicio || 'No especificado'}

MENSAJE:
${templateParams.mensaje}

---
Fecha: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Mexico_City' })}
IP: ${clientIp}
Fuente: Formulario de contacto
    `;

    console.log('Sending email via Resend...');
    
    // ========== ENVIAR EMAIL CON RESEND ==========
    const emailData = await resend.emails.send({
      from: 'Contacto Printek <onboarding@resend.dev>', // Cambiar por tu dominio cuando tengas uno
      to: ['danielpemor123@gmail.com'], // Tu email
      subject: `Nuevo contacto: ${templateParams.nombre} - ${templateParams.empresa}`,
      html: emailHtml,
      text: emailText,
      replyTo: templateParams.email
    });

    console.log('Resend response:', emailData);
    
    if (emailData.id) {
      console.log('SUCCESS: Email sent via Resend');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Email enviado exitosamente',
          id: emailData.id,
          service: 'Resend'
        })
      };
    } else {
      throw new Error('Resend no devolvió un ID de email');
    }

  } catch (error) {
    console.error("Error general:", error);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ 
        error: "Error interno del servidor", 
        details: error.message 
      }) 
    };
  }
};