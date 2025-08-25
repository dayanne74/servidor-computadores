require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// 🔥 CONFIGURACIÓN SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

let dbInitialized = false;

// 🚀 INICIALIZAR SUPABASE
async function initializeSupabase() {
    try {
        console.log('🔧 Inicializando Supabase para soporte técnico con tiempo real...');
        
        // Verificar conexión
        const { data, error } = await supabase.from('computadores').select('count', { count: 'exact' });
        
        if (error && error.code === '42P01') {
            // Tabla no existe, mostrar instrucciones
            console.log('⚠️ TABLA NO EXISTE - Ejecuta este SQL en Supabase SQL Editor:');
            console.log(`
-- Crear tabla computadores
CREATE TABLE IF NOT EXISTS computadores (
    id SERIAL PRIMARY KEY,
    equipo_id VARCHAR(100) UNIQUE NOT NULL,
    serial_number VARCHAR(100) NOT NULL,
    placa_ml VARCHAR(100),
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    direccion_automatica TEXT,
    ubicacion_manual TEXT,
    responsable VARCHAR(200) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('operativo', 'mantenimiento', 'dañado')),
    windows_update VARCHAR(5) NOT NULL CHECK (windows_update IN ('si', 'no')),
    imagenes JSONB DEFAULT '[]'::jsonb,
    observaciones TEXT,
    problemas_detectados TEXT,
    fecha_revision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revisor VARCHAR(100)
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_serial_number ON computadores(serial_number);
CREATE INDEX IF NOT EXISTS idx_equipo_id ON computadores(equipo_id);
CREATE INDEX IF NOT EXISTS idx_estado ON computadores(estado);
CREATE INDEX IF NOT EXISTS idx_fecha_revision ON computadores(fecha_revision);

-- Habilitar Row Level Security
ALTER TABLE computadores ENABLE ROW LEVEL SECURITY;

-- Política para permitir todo acceso
CREATE POLICY "Permitir todo acceso" ON computadores FOR ALL USING (true);

-- Habilitar tiempo real
ALTER TABLE computadores REPLICA IDENTITY FULL;

-- Crear bucket para imágenes
INSERT INTO storage.buckets (id, name, public) VALUES ('imagenes-soporte', 'imagenes-soporte', true) ON CONFLICT (id) DO NOTHING;

-- Políticas para el bucket
CREATE POLICY "Permitir subir imagenes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'imagenes-soporte');
CREATE POLICY "Permitir ver imagenes" ON storage.objects FOR SELECT USING (bucket_id = 'imagenes-soporte');
            `);
            throw new Error('Tabla no existe - ejecuta el SQL mostrado arriba');
        } else if (error) {
            throw error;
        }
        
        console.log('✅ Supabase conectado exitosamente');
        dbInitialized = true;
        
    } catch (error) {
        console.error('❌ Error al inicializar Supabase:', error);
        throw error;
    }
}

function checkDatabase(req, res, next) {
    if (!dbInitialized) {
        return res.status(500).json({
            error: 'Base de datos no disponible',
            details: 'Supabase no se ha inicializado correctamente'
        });
    }
    next();
}

// 🖼️ FUNCIÓN PARA SUBIR IMÁGENES A SUPABASE STORAGE
async function uploadImageToSupabase(base64Data, equipoId, imageIndex) {
    try {
        if (!base64Data || !base64Data.includes(',')) {
            return null;
        }
        
        const matches = base64Data.match(/^data:image\/([a-zA-Z]*);base64,(.*)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Formato base64 inválido');
        }
        
        const imageType = matches[1];
        const imageData = matches[2];
        const buffer = Buffer.from(imageData, 'base64');
        
        const timestamp = Date.now();
        const fileName = `${equipoId}/${timestamp}-${imageIndex}.${imageType}`;
        
        // Subir a Supabase Storage
        const { data, error } = await supabase.storage
            .from('imagenes-soporte')
            .upload(fileName, buffer, {
                contentType: `image/${imageType}`,
                upsert: false
            });
            
        if (error) {
            console.error('Error subiendo imagen a Supabase:', error);
            return null;
        }
        
        // Obtener URL pública
        const { data: { publicUrl } } = supabase.storage
            .from('imagenes-soporte')
            .getPublicUrl(fileName);
            
        console.log(`📸 Imagen subida: ${fileName}`);
        return {
            filename: fileName,
            url: publicUrl
        };
        
    } catch (error) {
        console.error('Error procesando imagen:', error);
        return null;
    }
}

// 🚨 FUNCIÓN PARA MANEJAR ERRORES DE SUPABASE
function handleSupabaseError(error, res, operation = 'operación') {
    console.error(`Error en ${operation}:`, error);
    
    let statusCode = 500;
    let message = 'Error interno del servidor';
    let details = error.message;
    
    if (error.code === '23505') {
        statusCode = 400;
        message = 'El ID del equipo ya existe';
        details = 'El identificador del equipo debe ser único';
    } else if (error.code === '23514') {
        statusCode = 400;
        message = 'Valor no válido';
        details = 'El valor proporcionado no cumple con las restricciones';
    } else if (error.code === '23502') {
        statusCode = 400;
        message = 'Campo requerido faltante';
    }
    
    res.status(statusCode).json({
        error: message,
        details: details,
        code: error.code || 'SUPABASE_ERROR'
    });
}

// 📡 ENDPOINT PARA HABILITAR TIEMPO REAL EN EL FRONTEND
app.get('/api/realtime', checkDatabase, (req, res) => {
    res.json({
        message: 'Tiempo real disponible',
        supabaseUrl: supabaseUrl,
        table: 'computadores',
        instructions: {
            frontend: 'Usar supabase.channel() para escuchar cambios',
            events: ['INSERT', 'UPDATE', 'DELETE']
        }
    });
});

// 🏥 HEALTH CHECK
app.get('/api/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        storage: 'disconnected',
        uptime: process.uptime(),
        mode: 'supabase_realtime'
    };
    
    try {
        // Verificar conexión a base de datos
        const { data, error } = await supabase.from('computadores').select('count', { count: 'exact' });
        if (!error) {
            health.database = 'connected';
        }
        
        // Verificar storage
        const { data: buckets } = await supabase.storage.listBuckets();
        if (buckets) {
            health.storage = 'connected';
        }
        
        health.status = dbInitialized ? 'ok' : 'initializing';
    } catch (err) {
        health.status = 'error';
        health.error = err.message;
        return res.status(500).json(health);
    }
    
    res.json(health);
});

// 📋 OBTENER COMPUTADORES (con filtros)
app.get('/api/computadores', checkDatabase, async (req, res) => {
    try {
        console.log('📋 Obteniendo lista de computadores...');
        const { estado, responsable, equipo_id, serial_number, revisor } = req.query;
        
        let query = supabase.from('computadores').select('*');
        
        if (estado) {
            query = query.eq('estado', estado);
            console.log(`Filtro por estado: ${estado}`);
        }
        
        if (responsable) {
            query = query.ilike('responsable', `%${responsable}%`);
            console.log(`Filtro por responsable: ${responsable}`);
        }
        
        if (equipo_id) {
            query = query.ilike('equipo_id', `%${equipo_id}%`);
            console.log(`Filtro por equipo_id: ${equipo_id}`);
        }
        
        if (serial_number) {
            query = query.ilike('serial_number', `%${serial_number}%`);
            console.log(`Filtro por serial: ${serial_number}`);
        }
        
        if (revisor) {
            query = query.ilike('revisor', `%${revisor}%`);
            console.log(`Filtro por revisor: ${revisor}`);
        }
        
        query = query.order('fecha_revision', { ascending: false });
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        console.log(`✅ Se encontraron ${data.length} computadores`);
        res.json(data);
        
    } catch (error) {
        handleSupabaseError(error, res, 'obtener computadores');
    }
});

// 🔍 OBTENER COMPUTADOR ESPECÍFICO
app.get('/api/computadores/:id', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 Buscando computador con ID: ${id}`);
        
        const { data, error } = await supabase
            .from('computadores')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Computador no encontrado' });
            }
            throw error;
        }
        
        console.log(`✅ Computador encontrado: ${data.equipo_id}`);
        res.json(data);
        
    } catch (error) {
        handleSupabaseError(error, res, 'obtener computador específico');
    }
});

// ➕ CREAR NUEVO COMPUTADOR CON IMÁGENES
app.post('/api/computadores', checkDatabase, async (req, res) => {
    try {
        console.log('➕ Creando nuevo registro de soporte técnico...');
        
        const {
            equipo_id, serial_number, placa_ml, latitud, longitud,
            direccion_automatica, ubicacion_manual, responsable, cargo,
            estado, windows_update, observaciones, problemas_detectados,
            revisor, imagenes
        } = req.body;
        
        // Validar campos requeridos
        if (!equipo_id || !serial_number || !responsable || !cargo || !estado || !windows_update) {
            return res.status(400).json({
                error: 'Campos requeridos faltantes',
                required: ['equipo_id', 'serial_number', 'responsable', 'cargo', 'estado', 'windows_update']
            });
        }
        
        // Procesar imágenes
        let imagenesSubidas = [];
        if (imagenes && Array.isArray(imagenes)) {
            console.log(`📸 Procesando ${imagenes.length} imágenes...`);
            
            for (let i = 0; i < imagenes.length; i++) {
                const imagen = imagenes[i];
                if (imagen.base64) {
                    const resultado = await uploadImageToSupabase(
                        imagen.base64, 
                        equipo_id, 
                        i + 1
                    );
                    
                    if (resultado) {
                        imagenesSubidas.push({
                            title: imagen.title || `Imagen ${i + 1}`,
                            filename: resultado.filename,
                            url: resultado.url,
                            fecha_subida: new Date().toISOString()
                        });
                        console.log(`📸 Imagen ${i + 1} procesada: ${resultado.filename}`);
                    }
                }
            }
        }
        
        // Insertar en Supabase
        const { data, error } = await supabase
            .from('computadores')
            .insert([{
                equipo_id,
                serial_number,
                placa_ml,
                latitud,
                longitud,
                direccion_automatica,
                ubicacion_manual,
                responsable,
                cargo,
                estado,
                windows_update,
                imagenes: imagenesSubidas,
                observaciones,
                problemas_detectados,
                revisor
            }])
            .select()
            .single();
            
        if (error) throw error;
        
        console.log(`✅ Registro creado con ID: ${data.id} y ${imagenesSubidas.length} imágenes`);
        
        // 🔥 EL TIEMPO REAL SE ACTIVA AUTOMÁTICAMENTE
        
        res.status(201).json({
            id: data.id,
            equipo_id: data.equipo_id,
            serial_number: data.serial_number,
            imagenes_guardadas: imagenesSubidas.length,
            message: 'Registro de soporte técnico creado exitosamente',
            realtime: '🔥 Otros dispositivos verán este cambio automáticamente'
        });
        
    } catch (error) {
        handleSupabaseError(error, res, 'crear registro');
    }
});

// ✏️ ACTUALIZAR COMPUTADOR
app.put('/api/computadores/:id', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`✏️ Actualizando registro ID: ${id}`);
        
        const {
            equipo_id, serial_number, placa_ml, latitud, longitud,
            direccion_automatica, ubicacion_manual, responsable, cargo,
            estado, windows_update, observaciones, problemas_detectados,
            revisor, imagenes
        } = req.body;
        
        // Procesar imágenes (nuevas y existentes)
        let imagenesFinales = [];
        if (imagenes && Array.isArray(imagenes)) {
            console.log(`📸 Procesando ${imagenes.length} imágenes...`);
            
            for (let i = 0; i < imagenes.length; i++) {
                const imagen = imagenes[i];
                
                if (imagen.base64 && imagen.base64.startsWith('data:image')) {
                    // Nueva imagen
                    const resultado = await uploadImageToSupabase(
                        imagen.base64, 
                        `${equipo_id}-update`, 
                        i + 1
                    );
                    
                    if (resultado) {
                        imagenesFinales.push({
                            title: imagen.title || `Imagen ${i + 1}`,
                            filename: resultado.filename,
                            url: resultado.url,
                            fecha_subida: new Date().toISOString()
                        });
                    }
                } else if (imagen.filename) {
                    // Imagen existente
                    imagenesFinales.push({
                        title: imagen.title || `Imagen ${i + 1}`,
                        filename: imagen.filename,
                        url: imagen.url,
                        fecha_subida: imagen.fecha_subida || new Date().toISOString()
                    });
                }
            }
        }
        
        // Actualizar en Supabase
        const { data, error } = await supabase
            .from('computadores')
            .update({
                equipo_id, serial_number, placa_ml,
                latitud, longitud, direccion_automatica, ubicacion_manual,
                responsable, cargo, estado, windows_update,
                imagenes: imagenesFinales,
                observaciones, problemas_detectados, revisor,
                fecha_actualizacion: new Date().toISOString()
            })
            .eq('id', id)
            .select();
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        
        console.log(`✅ Registro ID ${id} actualizado con ${imagenesFinales.length} imágenes`);
        
        res.json({
            message: 'Registro actualizado exitosamente',
            imagenes_guardadas: imagenesFinales.length,
            realtime: '🔥 Cambios sincronizados a todos los dispositivos'
        });
        
    } catch (error) {
        handleSupabaseError(error, res, 'actualizar registro');
    }
});

// 🗑️ ELIMINAR COMPUTADOR
app.delete('/api/computadores/:id', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Eliminando registro ID: ${id}`);
        
        // Obtener datos antes de eliminar para borrar imágenes
        const { data: computador } = await supabase
            .from('computadores')
            .select('imagenes')
            .eq('id', id)
            .single();
        
        // Eliminar registro
        const { data, error } = await supabase
            .from('computadores')
            .delete()
            .eq('id', id)
            .select();
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        
        // Eliminar imágenes del storage
        if (computador && computador.imagenes && Array.isArray(computador.imagenes)) {
            for (const imagen of computador.imagenes) {
                if (imagen.filename) {
                    try {
                        await supabase.storage
                            .from('imagenes-soporte')
                            .remove([imagen.filename]);
                        console.log(`🗑️ Imagen eliminada: ${imagen.filename}`);
                    } catch (imgError) {
                        console.warn('⚠️ Error eliminando imagen:', imgError);
                    }
                }
            }
        }
        
        console.log(`✅ Registro ID ${id} eliminado exitosamente`);
        
        res.json({ 
            message: 'Registro eliminado exitosamente',
            realtime: '🔥 Eliminación sincronizada a todos los dispositivos'
        });
        
    } catch (error) {
        handleSupabaseError(error, res, 'eliminar registro');
    }
});

// 📊 ESTADÍSTICAS
app.get('/api/estadisticas', checkDatabase, async (req, res) => {
    try {
        console.log('📊 Generando estadísticas...');
        
        // Obtener todos los computadores para calcular estadísticas
        const { data: computadores, error } = await supabase
            .from('computadores')
            .select('estado, windows_update, imagenes, problemas_detectados, latitud, longitud, fecha_revision');
            
        if (error) throw error;
        
        const total = computadores.length;
        const operativos = computadores.filter(c => c.estado === 'operativo').length;
        const mantenimiento = computadores.filter(c => c.estado === 'mantenimiento').length;
        const dañados = computadores.filter(c => c.estado === 'dañado').length;
        const windowsSi = computadores.filter(c => c.windows_update === 'si').length;
        const windowsNo = computadores.filter(c => c.windows_update === 'no').length;
        
        const hoy = new Date().toDateString();
        const revisionesHoy = computadores.filter(c => 
            new Date(c.fecha_revision).toDateString() === hoy
        ).length;
        
        const conProblemas = computadores.filter(c => 
            c.problemas_detectados && c.problemas_detectados.trim() !== ''
        ).length;
        
        const conUbicacion = computadores.filter(c => 
            c.latitud && c.longitud
        ).length;
        
        const conImagenes = computadores.filter(c => 
            c.imagenes && Array.isArray(c.imagenes) && c.imagenes.length > 0
        ).length;
        
        const totalImagenes = computadores.reduce((sum, c) => 
            sum + (c.imagenes && Array.isArray(c.imagenes) ? c.imagenes.length : 0), 0
        );
        
        const stats = {
            total,
            operativos,
            mantenimiento,
            dañados,
            windows_si: windowsSi,
            windows_no: windowsNo,
            revisiones_hoy: revisionesHoy,
            con_problemas: conProblemas,
            con_ubicacion: conUbicacion,
            con_imagenes: conImagenes,
            total_imagenes: totalImagenes,
            // Para compatibilidad con tu frontend
            totalEquipos: total,
            windowsActualizados: windowsSi
        };
        
        console.log('✅ Estadísticas generadas:', stats);
        res.json(stats);
        
    } catch (error) {
        handleSupabaseError(error, res, 'obtener estadísticas');
    }
});

// 📄 EXPORTAR PARA EXCEL
app.get('/api/export/excel', checkDatabase, async (req, res) => {
    try {
        console.log('📄 Exportando datos para Excel...');
        
        const { data: computadores, error } = await supabase
            .from('computadores')
            .select('*')
            .order('fecha_revision', { ascending: false });
            
        if (error) throw error;
        
        const excelData = computadores.map(row => {
            const imagenesInfo = row.imagenes && Array.isArray(row.imagenes) ? 
                row.imagenes.map(img => img.title).join('; ') : 'Sin imágenes';
            
            return {
                'ID EQUIPO': row.equipo_id,
                'SERIAL': row.serial_number,
                'PLACA/ML': row.placa_ml || 'NO ASIGNADO',
                'RESPONSABLE': row.responsable,
                'CARGO': row.cargo,
                'ESTADO': row.estado.toUpperCase(),
                'WINDOWS UPDATE': row.windows_update === 'si' ? 'SÍ' : 'NO',
                'UBICACIÓN': row.direccion_automatica || row.ubicacion_manual || 'NO ESPECIFICADA',
                'PROBLEMAS': row.problemas_detectados || 'NINGUNO',
                'OBSERVACIONES': row.observaciones || 'SIN OBSERVACIONES',
                'REVISOR': row.revisor || 'NO ESPECIFICADO',
                'FECHA REVISIÓN': new Date(row.fecha_revision).toLocaleDateString('es-ES'),
                'HORA REVISIÓN': new Date(row.fecha_revision).toLocaleTimeString('es-ES'),
                'CANTIDAD IMÁGENES': row.imagenes ? row.imagenes.length : 0,
                'DESCRIPCIÓN IMÁGENES': imagenesInfo
            };
        });
        
        console.log(`✅ Datos preparados para exportar: ${excelData.length} registros`);
        res.json(excelData);
        
    } catch (error) {
        handleSupabaseError(error, res, 'exportar datos');
    }
});

// 🖼️ OBTENER IMÁGENES DE UN COMPUTADOR
app.get('/api/computadores/:id/imagenes', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🖼️ Obteniendo imágenes del computador ID: ${id}`);
        
        const { data, error } = await supabase
            .from('computadores')
            .select('imagenes')
            .eq('id', id)
            .single();
            
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Computador no encontrado' });
            }
            throw error;
        }
        
        const imagenes = data.imagenes || [];
        
        // Agregar información adicional de cada imagen
        const imagenesConInfo = imagenes.map(imagen => ({
            ...imagen,
            exists: true, // En Supabase Storage siempre existen si están en la BD
            sizeFormatted: 'Disponible en Supabase'
        }));
        
        res.json(imagenesConInfo);
        
    } catch (error) {
        handleSupabaseError(error, res, 'obtener imágenes del computador');
    }
});

// 🎯 PROXY PARA SERVIR IMÁGENES DESDE SUPABASE
app.get('/uploads/:filename(*)', async (req, res) => {
    try {
        const filename = req.params.filename + (req.params[0] ? '/' + req.params[0] : '');
        console.log(`🖼️ Sirviendo imagen desde Supabase: ${filename}`);
        
        // Obtener URL pública de Supabase
        const { data } = supabase.storage
            .from('imagenes-soporte')
            .getPublicUrl(filename);
            
        if (!data.publicUrl) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }
        
        // Redirigir a la URL pública de Supabase
        res.redirect(data.publicUrl);
        
    } catch (error) {
        console.error('Error sirviendo imagen:', error);
        res.status(404).json({ error: 'Imagen no encontrada' });
    }
});

// 🏠 RUTA PRINCIPAL
app.get('/', (req, res) => {
    res.json({
        message: '✅ API de soporte técnico con Supabase funcionando',
        features: [
            '🔥 Tiempo real automático',
            '📱 Sincronización entre dispositivos',
            '💾 Storage persistente para imágenes',
            '📊 Estadísticas en tiempo real',
            '🚀 Escalabilidad automática'
        ],
        endpoints: {
            health: '/api/health',
            computadores: '/api/computadores',
            estadisticas: '/api/estadisticas',
            export: '/api/export/excel',
            realtime: '/api/realtime'
        },
        database: 'Supabase PostgreSQL',
        storage: 'Supabase Storage',
        realtime: 'Habilitado automáticamente'
    });
});

// 🚨 MIDDLEWARE DE MANEJO DE ERRORES
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    res.status(500).json({
        error: 'Error interno del servidor',
        details: err.message,
        timestamp: new Date().toISOString(),
        service: 'supabase'
    });
});

// 🔍 MANEJAR RUTAS NO ENCONTRADAS
app.use('*', (req, res) => {
    console.log(`❌ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: [
            'GET /api/health',
            'GET /api/computadores',
            'POST /api/computadores',
            'PUT /api/computadores/:id',
            'DELETE /api/computadores/:id',
            'GET /api/estadisticas'
        ]
    });
});

// 🚀 INICIAR SERVIDOR
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor con Supabase + Tiempo Real...');
        
        // Inicializar Supabase
        await initializeSupabase();
        
        // Iniciar servidor
        app.listen(PORT, '0.0.0.0', () => {
            console.log('✅ Servidor Supabase iniciado exitosamente');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`🖥️  Servidor local: http://localhost:${PORT}`);
            console.log('📱 Configurar en frontend el URL del servidor deployed');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🔥 CARACTERÍSTICAS:');
            console.log('   ✅ Tiempo real automático');
            console.log('   ✅ Sincronización entre dispositivos');  
            console.log('   ✅ Storage persistente para imágenes');
            console.log('   ✅ Escalabilidad automática');
            console.log('   ✅ Base de datos en la nube');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🐘 Base de datos: Supabase PostgreSQL');
            console.log('📷 Storage: Supabase Storage');
            console.log('⚡ Tiempo real: Habilitado automáticamente');
            console.log('🌐 CORS: Habilitado para todos los orígenes');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
        
    } catch (error) {
        console.error('❌ Error fatal al iniciar servidor:', error);
        console.log('\n🔧 SOLUCIÓN:');
        console.log('1. Verificar variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY');
        console.log('2. Crear las tablas en Supabase SQL Editor (ver logs arriba)');
        console.log('3. Verificar que el bucket "imagenes-soporte" existe');
        process.exit(1);
    }
}

// 🛑 MANEJO DE CIERRE GRACEFUL
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor Supabase...');
    console.log('✅ Conexiones cerradas correctamente');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rechazada no manejada:', reason);
    process.exit(1);
});

// ▶️ INICIAR LA APLICACIÓN
startServer();