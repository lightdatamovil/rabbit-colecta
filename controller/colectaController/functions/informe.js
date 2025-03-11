import { executeQuery } from '../../../db.js'; // Asegúrate de importar correctamente executeQuery

export async function informe(dbConnection,clientId, userId, shipmentId) {
    try {
        let clientename = "";
        let hoy = new Date().toISOString().split('T')[0];
        let ayer = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Obtener nombre del cliente
        let sql = "SELECT nombre_fantasia FROM clientes WHERE superado=0 AND elim=0 AND did = ?";
        let result = await executeQuery(dbConnection, sql, [clientId]);
        if (result.length > 0) {
            clientename = result[0].nombre_fantasia;
        }
        
        // Ingresados hoy
        sql = `SELECT COUNT(id) as total FROM envios 
               WHERE superado=0 AND elim=0 
               AND autofecha BETWEEN ? AND ? 
               AND didCliente = ?`;
        result = await executeQuery(dbConnection, sql, [`${hoy} 00:00:00`, `${hoy} 23:59:59`, clientId]);
        let ingresadoshoy = result.length > 0 ? result[0].total : 0;
        
        // Total a colectar del cliente
        sql = `SELECT COUNT(e.id) as total FROM envios e
               JOIN envios_historial eh ON eh.elim=0 AND eh.superado=0 AND eh.estado=7 AND eh.didEnvio = e.did 
               WHERE e.superado=0 AND e.elim=0 AND e.didCliente = ? AND eh.fecha > ?`;
        result = await executeQuery(dbConnection, sql, [clientId, `${ayer} 00:00:00`]);
        let cliente_total = result.length > 0 ? result[0].total : 0;
        let aingresarhoy = cliente_total;
        
        let choferasignado = "";
        let zonaentrega = "";
        
        // Datos del paquete
        if (shipmentId > 0) {
            sql = `SELECT ez.nombre as zona, CONCAT(su.nombre, ' ', su.apellido) as chofer
                   FROM envios e
                   LEFT JOIN envios_zonas ez ON ez.elim=0 AND ez.superado=0 AND ez.did = e.didEnvioZona
                   LEFT JOIN envios_asignaciones ea ON ea.elim=0 AND ea.superado=0 AND ea.didEnvio = e.did
                   LEFT JOIN sistema_usuarios su ON su.superado=0 AND su.elim=0 AND su.did = ea.operador
                   WHERE e.superado=0 AND e.elim=0 AND e.did = ?`;
            result = await executeQuery(dbConnection, sql, [shipmentId]);
            if (result.length > 0) {
                choferasignado = result[0].chofer || "";
                zonaentrega = result[0].zona || "";
            }
        }
        
        // Retirados hoy por mí
        sql = `SELECT COUNT(id) as total FROM envios_historial 
               WHERE superado=0 AND elim=0 AND quien IN (?) 
               AND autofecha BETWEEN ? AND ? AND estado=0`;
        result = await executeQuery(dbConnection, sql, [userId, `${hoy} 00:00:00`, `${hoy} 23:59:59`]);
        let retiradoshoymi = result.length > 0 ? result[0].total : 0;

        return {
            cliente: clientename,
            ingresados: 0,
            cliente_total,
            retiradoshoymi,
            aingresarhoy,
            ingresadoshoy,
            ingresadosahora: 0,
            choferasignado,
            zonaentrega
        };
    } catch (error) {
        console.error("Error en obtenerTotales:", error);
        throw error;
    }
}