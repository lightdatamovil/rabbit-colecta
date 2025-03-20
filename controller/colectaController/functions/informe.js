import { executeQuery, getClientsByCompany, getDriversByCompany } from '../../../db.js'; 
import { logCyan, logRed, logYellow } from '../../../src/funciones/logsCustom.js';

// Contadores en memoria
const contadorIngresadosCliente = {}; // Clave: `${fecha}:${clienteId}`
const contadorRetiradosUsuario = {}; // Clave: `${fecha}:${userId}`
const contadorAretirarCliente = {}; // Clave: `${fecha}:${clienteId}`

// Función para incrementar "ingresados hoy" de un cliente
function incrementarIngresados(fecha, clienteId) {
    const clave = `${fecha}:${clienteId}`;
    if (!contadorIngresadosCliente[clave]) {
        contadorIngresadosCliente[clave] = 0;
    }
    contadorIngresadosCliente[clave]++;
}

// Función para obtener "ingresados hoy" de un cliente
function obtenerIngresados(fecha, clienteId) {
    return contadorIngresadosCliente[`${fecha}:${clienteId}`] || 0;
}

// Función para incrementar "retirados hoy" por un usuario
function incrementarRetirados(fecha, userId) {
    const clave = `${fecha}:${userId}`;
    if (!contadorRetiradosUsuario[clave]) {
        contadorRetiradosUsuario[clave] = 0;
    }
    contadorRetiradosUsuario[clave]++;
}

// Función para obtener "retirados hoy" por un usuario
function obtenerRetirados(fecha, userId) {
    return contadorRetiradosUsuario[`${fecha}:${userId}`] || 0;
}

// Función para incrementar "a retirar hoy" de un cliente
function incrementarAretirar(fecha, clienteId) {
    const clave = `${fecha}:${clienteId}`;
    if (!contadorAretirarCliente[clave]) {
        contadorAretirarCliente[clave] = 0;
    }
    contadorAretirarCliente[clave]++;
}

// Función para obtener "a retirar hoy" de un cliente
function obtenerAretirar(fecha, clienteId) {
    return contadorAretirarCliente[`${fecha}:${clienteId}`] || 0;
}

// Función para limpiar los contadores cada 14 días
function limpiarContadores() {
    console.log("🔄 Reiniciando contadores...");
    Object.keys(contadorIngresadosCliente).forEach(clave => delete contadorIngresadosCliente[clave]);
    Object.keys(contadorRetiradosUsuario).forEach(clave => delete contadorRetiradosUsuario[clave]);
    Object.keys(contadorAretirarCliente).forEach(clave => delete contadorAretirarCliente[clave]);
}

// Ejecutar limpieza cada 14 días
setInterval(limpiarContadores, 14 * 24 * 60 * 60 * 1000);

// 🚀 Función principal
export async function informe(dbConnection, companyId, clientId, userId, shipmentId) {
    try {
        let hoy = new Date().toISOString().split('T')[0];
        let ayer = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // 🚀 Obtener datos desde los contadores en memoria
        let retiradoshoy = obtenerIngresados(hoy, clientId);
        let aretirarHoy = obtenerAretirar(ayer, clientId);
        let retiradoshoymi = obtenerRetirados(hoy, userId);

        // Verificar cliente en la empresa
        const companyClients = await getClientsByCompany(dbConnection, companyId);
        if (companyClients[clientId] === undefined) {
            throw new Error("Cliente no encontrado");
        }
        logCyan("El cliente fue encontrado");

        logCyan("Se generó el informe");
        return {
            cliente: companyClients[clientId].nombre || 'Sin informacion',
            cliente_total: aretirarHoy,
            aretirarHoy,
            retiradoshoy,
            retiradoshoymi,
        };
    } catch (error) {
        logRed(`Error en informe: ${error.stack}`);
        throw error;
    }
}
