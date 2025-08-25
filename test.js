// test.js
const clave = "PEGAR_TU_CLAVE_COMPLETA_AQUI";

console.log('Longitud de la clave:', clave.length);
console.log('Empieza con eyJ:', clave.startsWith('eyJ'));
console.log('Tiene 3 partes (separadas por .):', clave.split('.').length === 3);

// Una clave JWT válida debe:
// - Tener 300+ caracteres
// - Empezar con 'eyJ'  
// - Tener exactamente 3 partes separadas por '.'