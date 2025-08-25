const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

console.log('🔍 DIAGNÓSTICO USANDO LAS MISMAS VARIABLES DE TU SERVIDOR')
console.log('═'.repeat(60))

// Usar exactamente los mismos nombres que tu servidor
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('1️⃣ VARIABLES DE ENTORNO:')
console.log('SUPABASE_URL:', supabaseUrl ? '✅ Configurada' : '❌ No configurada')
console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Configurada' : '❌ No configurada')  
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Configurada' : '❌ No configurada')

if (!supabaseUrl) {
    console.log('\n❌ ERROR: No se encontró SUPABASE_URL')
    console.log('Verifica que tu .env tenga:')
    console.log('SUPABASE_URL=https://fhztmjplhlrbqpfrhtys.supabase.co')
    process.exit(1)
}

if (!supabaseServiceKey) {
    console.log('\n❌ ERROR: No se encontró SUPABASE_SERVICE_ROLE_KEY')
    console.log('Agrega esta línea a tu .env:')
    console.log('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
    process.exit(1)
}

// Crear cliente con SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function diagnosticoCompleto() {
    console.log('\n2️⃣ CONEXIÓN CON SERVICE_ROLE_KEY:')
    
    try {
        // Test 1: Listar buckets
        console.log('   🔍 Listando buckets...')
        const { data: bucketsData, error: bucketsError } = await supabase.storage.listBuckets()
        
        if (bucketsError) {
            console.log('   ❌ Error listando buckets:', bucketsError.message)
            console.log('   📝 Código de error:', bucketsError.status || bucketsError.statusCode)
        } else {
            console.log('   ✅ Buckets obtenidos exitosamente')
            console.log('   📊 Total buckets:', bucketsData?.length || 0)
            
            if (bucketsData && bucketsData.length > 0) {
                console.log('\n   📁 BUCKETS ENCONTRADOS:')
                bucketsData.forEach((bucket, i) => {
                    console.log(`      ${i+1}. ${bucket.name} (${bucket.public ? 'Público' : 'Privado'})`)
                })
                
                // Buscar específicamente el bucket de imágenes
                const imagenesBucket = bucketsData.find(b => b.name === 'imagenes-soporte')
                if (imagenesBucket) {
                    console.log('\n   ✅ Bucket "imagenes-soporte" ENCONTRADO')
                    console.log('      - Público:', imagenesBucket.public ? 'SÍ ✅' : 'NO ❌')
                    console.log('      - ID:', imagenesBucket.id)
                } else {
                    console.log('\n   ⚠️ Bucket "imagenes-soporte" NO encontrado')
                }
            } else {
                console.log('\n   ⚠️ No hay buckets creados')
            }
        }
        
        // Test 2: Verificar tabla computadores
        console.log('\n3️⃣ VERIFICACIÓN DE TABLA:')
        console.log('   🔍 Verificando tabla "computadores"...')
        
        const { data: tableData, error: tableError } = await supabase
            .from('computadores')
            .select('count', { count: 'exact' })
            
        if (tableError) {
            if (tableError.code === '42P01') {
                console.log('   ❌ Tabla "computadores" NO existe')
                console.log('\n   🔧 ACCIÓN REQUERIDA: Crear tabla en Supabase SQL Editor')
                console.log('   Ve a: https://supabase.com/dashboard → SQL Editor → New Query')
                console.log('   Ejecuta el SQL que te mostró tu servidor al iniciarlo')
            } else {
                console.log('   ❌ Error accediendo a tabla:', tableError.message)
            }
        } else {
            console.log('   ✅ Tabla "computadores" existe y es accesible')
            console.log('   📊 Total registros:', tableData.count || 0)
        }
        
        // Test 3: Crear bucket si no existe
        if (bucketsData && !bucketsData.find(b => b.name === 'imagenes-soporte')) {
            console.log('\n4️⃣ CREANDO BUCKET FALTANTE:')
            console.log('   🔨 Intentando crear bucket "imagenes-soporte"...')
            
            const { data: createData, error: createError } = await supabase.storage
                .createBucket('imagenes-soporte', {
                    public: true,
                    fileSizeLimit: 52428800 // 50MB
                })
                
            if (createError) {
                if (createError.message.includes('already exists')) {
                    console.log('   ✅ Bucket ya existe (problema de permisos para listarlo)')
                } else {
                    console.log('   ❌ Error creando bucket:', createError.message)
                }
            } else {
                console.log('   ✅ Bucket "imagenes-soporte" creado exitosamente')
            }
        }
        
        // Test 4: Verificación final
        console.log('\n5️⃣ VERIFICACIÓN FINAL:')
        const { data: finalBuckets } = await supabase.storage.listBuckets()
        const imagenesBucket = finalBuckets?.find(b => b.name === 'imagenes-soporte')
        
        if (imagenesBucket) {
            console.log('   ✅ Todo configurado correctamente')
            console.log('   📁 Bucket "imagenes-soporte" disponible')
            console.log('   🔓 Acceso público:', imagenesBucket.public ? 'Habilitado' : 'Deshabilitado')
        } else {
            console.log('   ❌ Aún hay problemas con la configuración')
        }
        
    } catch (error) {
        console.log('\n❌ ERROR CRÍTICO:', error.message)
        console.log('🔧 POSIBLES SOLUCIONES:')
        console.log('   1. Verifica que las URLs y keys sean correctas')
        console.log('   2. Asegúrate de tener permisos en Supabase')  
        console.log('   3. Verifica la conexión a internet')
    }
    
    console.log('\n' + '═'.repeat(60))
    console.log('🚀 SIGUIENTE PASO: Si todo está OK, inicia tu servidor:')
    console.log('   npm run dev')
    console.log('   ó')
    console.log('   node app.js')
    console.log('═'.repeat(60))
}

diagnosticoCompleto().catch(console.error)