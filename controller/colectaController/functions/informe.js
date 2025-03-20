import { executeQuery, getClientsByCompany } from '../../../db.js';
import { logCyan, logRed, logYellow } from '../../../src/funciones/logsCustom.js';

const cache = {}; // Caché en memoria

export async function informe(dbConnection, companyId, clientId, userId) {
    try {
        let hoy = new Date().toISOString().split('T')[0];
        let ayer = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let start, end;

        // Ingresados hoy
        start = Date.now();
        const sql1 = `SELECT COUNT(id) as total FROM envios 
                      WHERE superado=0 AND elim=0 
                      AND autofecha BETWEEN ? AND ? 
                      AND didCliente = ?`;
        const resultsql1 = await executeQuery(dbConnection, sql1, [`${hoy} 00:00:00`, `${hoy} 23:59:59`, clientId]);
        end = Date.now();
        logYellow(`Tiempo consulta sql1: ${end - start}ms`);
        let retiradoshoy = resultsql1.length > 0 ? resultsql1[0].total : 0;

        // Total a colectar del cliente
        start = Date.now();
        const sql2 = `
            SELECT count(e.id) as total
            FROM envios as e
            JOIN envios_historial as eh on ( eh.elim=0 and eh.superado=0
            AND eh.estado=7
            AND eh.didEnvio = e.did ) 
            WHERE e.superado=0
            AND e.elim=0
            AND e.didCliente = ?
            AND eh.fecha > ?
        `;
        const resultsql2 = await executeQuery(dbConnection, sql2, [clientId, `${ayer} 00:00:00`]);
        end = Date.now();
        logYellow(`Tiempo consulta sql2: ${end - start}ms`);
        let cliente_total = resultsql2.length > 0 ? resultsql2[0].total : 0;
        let aretirarHoy = cliente_total;

        // Clave en la caché
        const cacheKey = `${hoy}>${companyId}>${userId}`;
        
        if (!(cacheKey in cache)) {
            start = Date.now();
            const sql4 = `
                SELECT COUNT(id) as total
                FROM envios_historial 
                WHERE superado=0
                AND elim=0
                AND quien IN (?) 
                AND (autofecha > ? and autofecha < ?)
                AND estado=0
            `;
            const resultsql4 = await executeQuery(dbConnection, sql4, [userId, `${hoy} 00:00:00`, `${hoy} 23:59:59`]);
            end = Date.now();
            logYellow(`Tiempo consulta sql4: ${end - start}ms`);
            cache[cacheKey] = resultsql4.length > 0 && resultsql4[0].total > 0 ? resultsql4[0].total : 1;
        } else {
            cache[cacheKey] += 1;
        }
        
        let retiradoshoymi = cache[cacheKey];

        start = Date.now();
        const companyClients = await getClientsByCompany(dbConnection, companyId);
        end = Date.now();
        logYellow(`Tiempo consulta getClientsByCompany: ${end - start}ms`);

        if (companyClients[clientId] === undefined) {
            throw new Error("Cliente no encontrado");
        }
        logCyan("El cliente fue encontrado");

        logCyan("Se generó el informe");
        return {
            cliente: companyClients[clientId].nombre || 'Sin informacion',
            cliente_total,
            aretirarHoy,
            retiradoshoy,
            retiradoshoymi,
        };
    } catch (error) {
        logRed(`Error en informe: ${error.stack}`);
        throw error;
    }
}
