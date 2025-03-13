import { executeQuery, getClientsByCompany, getDriversByCompany } from '../../../db.js'; // Asegúrate de importar correctamente executeQuery
import { logCyan, logRed, logYellow } from '../../../src/funciones/logsCustom.js';

export async function informe(dbConnection, companyId, clientId, userId, shipmentId) {
    try {
        let hoy = new Date().toISOString().split('T')[0];
        let ayer = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Ingresados hoy
        const sql1 = `SELECT COUNT(id) as total FROM envios 
               WHERE superado=0 AND elim=0 
               AND autofecha BETWEEN ? AND ? 
               AND didCliente = ?`;
        const resultsql1 = await executeQuery(dbConnection, sql1, [`${hoy} 00:00:00`, `${hoy} 23:59:59`, clientId]);
        let retiradoshoy = resultsql1.length > 0 ? resultsql1[0].total : 0;

        // Total a colectar del cliente
        const sql2 = `SELECT COUNT(e.id) as total FROM envios e
               JOIN envios_historial eh ON eh.elim=0 AND eh.superado=0 AND eh.estado=7 AND eh.didEnvio = e.did 
               WHERE e.superado=0 AND e.elim=0 AND e.didCliente = ? AND eh.fecha > ?`;
        const resultsql2 = await executeQuery(dbConnection, sql2, [clientId, `${ayer} 00:00:00`]);
        let cliente_total = resultsql2.length > 0 ? resultsql2[0].total : 0;
        let aretirarHoy = cliente_total;

        let choferasignado = "";
        let zonaentrega = "";

        // Datos del paquete
        if (shipmentId > 0) {
            const sql3 = `SELECT ez.nombre AS zona, e.choferAsignado, sd.nombre AS sucursal
                FROM envios AS e 
                LEFT JOIN envios_zonas AS ez 
                    ON ez.elim=0 AND ez.superado=0 AND ez.did = e.didEnvioZona
                LEFT JOIN sucursales_distribucion AS sd 
                    ON sd.elim=0 AND sd.superado=0 AND sd.did = e.didSucursalDistribucion
                WHERE e.superado=0 AND e.elim=0 AND e.did = ?`;

            const resultsql3 = await executeQuery(dbConnection, sql3, [shipmentId]);
            if (resultsql3.length > 0) {
                choferasignado = resultsql3[0].choferAsignado || "Sin asignar";
                zonaentrega = resultsql3[0].zona || "";
            }
        }

        // Retirados hoy por mí
        const sql4 = `SELECT COUNT(id) as total FROM envios_historial 
               WHERE superado=0 AND elim=0 AND quien IN (?) 
               AND autofecha BETWEEN ? AND ? AND estado=0`;
        const resultsql4 = await executeQuery(dbConnection, sql4, [userId, `${hoy} 00:00:00`, `${hoy} 23:59:59`]);
        let retiradoshoymi = resultsql4.length > 0 ? resultsql4[0].total : 0;

        const companyClients = await getClientsByCompany(dbConnection, companyId);

        const companyDrivers = await getDriversByCompany(dbConnection, companyId);

        if (companyClients[clientId] === undefined) {
            throw new Error("Cliente no encontrado");
        }
        logCyan("El cliente fue encontrado");

        let chofer;

        if (companyDrivers[choferasignado] === undefined) {
            chofer = "Sin informacion";
            logCyan("El chofer no fue encontrado");
        } else {
            chofer = companyDrivers[choferasignado].nombre;
            logCyan("El chofer fue encontrado");
        }

        logCyan("Se generó el informe");
        return {
            cliente: companyClients[clientId].nombre || 'Sin informacion',
            cliente_total,
            aretirarHoy,
            retiradoshoy,
            retiradoshoymi,
            // Esto no se usa en el front
            choferasignado: chofer,
            zonaentrega,
            ingresados: 0,
        };
    } catch (error) {
        logRed(`Error en informe: ${error.message}`);
        throw error;
    }
}