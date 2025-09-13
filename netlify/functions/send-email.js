// netlify/functions/send-email.js - Versión Ultra Simplificada
const { Resend } = require('resend');

exports.handler = async (event, context) => {
  // Headers CORS para todas las respuestas
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  console.log('=== FUNCTION START ===');
  console.log('Method:', event.httpMethod);
  console.log('Headers:', JSON.stringify(event.headers, null, 2));

  // Manejar preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'CORS OK' })
    };
  }

  // Solo permitir POST
  if (event.httpMethod !== 'POST') {
    console.log('Method not allowed:', event.httpMethod);
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Method not allowed',
        method: event.httpMethod 
      })
    };
  }

  try {
    console.log('Processing POST request...');
    console.log('Body received:', event.body);

    // Verificar que tenemos el API key
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY missing');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Server configuration error',
          details: 'RESEND_API_KEY not configured'
        })
      };
    }

    console.log('✅ RESEND_API_KEY found');

    // Parse del body
    let requestData;
    try {
      requestData = JSON.parse(event.body || '{}');
      console.log('✅ JSON parsed successfully');
      console.log('Request data keys:', Object.keys(requestData));
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError.message);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Invalid JSON format',
          details: parseError.message,
          received: event.body?.substring(0, 100) + '...'
        })
      };
    }

    // Verificar que tenemos templateParams
    if (!requestData.templateParams) {
      console.error('❌ Missing templateParams');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing templateParams in request',
          received: Object.keys(requestData)
        })
      };
    }

    const params = requestData.templateParams;
    console.log('✅ Template params found:', Object.keys(params));

    // Validaciones básicas
    const requiredFields = ['nombre', 'email', 'empresa', 'mensaje'];
    const missing = requiredFields.filter(field => !params[field] || params[field].trim() === '');
    
    if (missing.length > 0) {
      console.error('❌ Missing required fields:', missing);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields',
          missing: missing
        })
      };
    }

    console.log('✅ All required fields present');

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(params.email)) {
      console.error('❌ Invalid email:', params.email);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Invalid email format',
          email: params.email
        })
      };
    }

    console.log('✅ Email format valid');

    // Inicializar Resend
    console.log('Initializing Resend...');
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Preparar contenido del email
    const clientIp = event.headers['x-forwarded-for'] || 'unknown';
    const timestamp = new Date().toLocaleString('es-ES', { 
      timeZone: 'America/Mexico_City' 
    });

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Nuevo Contacto - Printek</h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 5px;">
          <p><strong>Nombre:</strong> ${params.nombre}</p>
          <p><strong>Email:</strong> ${params.email}</p>
          <p><strong>Empresa:</strong> ${params.empresa}</p>
          <p><strong>Teléfono:</strong> ${params.telefono || 'No proporcionado'}</p>
          <p><strong>Ubicación:</strong> ${params.ubicacion || 'No proporcionado'}</p>
          <p><strong>Servicio:</strong> ${params.servicio || 'No especificado'}</p>
        </div>
        
        <h3>Mensaje:</h3>
        <div style="background: #fff; padding: 15px; border-left: 4px solid #007bff;">
          <p>${params.mensaje.replace(/\n/g, '<br>')}</p>
        </div>
        
        <hr>
        <small style="color: #666;">
          Enviado: ${timestamp}<br>
          IP: ${clientIp}
        </small>
      </div>
    `;

    console.log('Sending email...');

    // Enviar email
    const result = await resend.emails.send({
      from: 'Printek Contacto <contact@printeksupplies.com>',
      to: ['sales@printeksupplies.com'],
      subject: `Contacto: ${params.nombre} - ${params.empresa}`,
      html: emailContent,
      replyTo: params.email
    });

    console.log('✅ Resend result:', result);

    if (result.id) {
      console.log('🎉 EMAIL SENT SUCCESSFULLY');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Email enviado correctamente',
          emailId: result.id,
          timestamp: timestamp
        })
      };
    } else {
      console.error('❌ No email ID returned');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Email sending failed - no ID returned',
          result: result
        })
      };
    }

  } catch (error) {
    console.error('💥 GENERAL ERROR:', error);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        type: error.name
      })
    };
  }
};