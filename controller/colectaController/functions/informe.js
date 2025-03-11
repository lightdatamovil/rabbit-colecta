import { executeQuery, getClientsByCompany } from "../../../db.js";

export async function informe(dbConnection, companyId, clientId, userId, shipmentId) {
    const hoy = new Date().toISOString().split('T')[0];
    let aIngresarHoy = 0;
    let ingresadosHoyAPlantaCliente = 0;
    let choferAsignado = "Sin asignar";
    let zonaEntrega = "";
    let sucursal = "";
    let chofer = 0;

    try {
        const sql1 = `
            SELECT eh.estado 
            FROM envios_historial AS eh
            JOIN envios AS e 
                ON e.elim=0 AND e.superado=0 AND e.didCliente = ? AND e.did = eh.didEnvio
            WHERE eh.elim=0 AND eh.superado=0 
            AND (eh.autofecha BETWEEN ? AND ?) 
            AND eh.estado IN (7, 0, 1);
        `;

        const rows1 = await executeQuery(dbConnection, sql1, [clientId, `${hoy} 00:00:00`, `${hoy} 23:59:59`]);

        rows1.forEach(row => {
            if (row.estado === 1) {
                ingresadosHoyAPlantaCliente++;
            } else {
                aIngresarHoy++;
            }
        });

        const sql2 = `
            SELECT COUNT(id) AS total 
            FROM envios_historial 
            WHERE elim=0 AND quien IN (${userId}) 
            AND (autofecha BETWEEN ? AND ?) 
            AND estado = 1;
        `;

        const rows2 = await executeQuery(dbConnection, sql2, [`${hoy} 00:00:00`, `${hoy} 23:59:59`]);
        chofer = rows2[0]?.total || 0;

        if (shipmentId > 0) {
            const sql3 = `
                SELECT ez.nombre AS zona, e.choferAsignado, sd.nombre AS sucursal
                FROM envios AS e 
                LEFT JOIN envios_zonas AS ez 
                    ON ez.elim=0 AND ez.superado=0 AND ez.did = e.didEnvioZona
                LEFT JOIN sucursales_distribucion AS sd 
                    ON sd.elim=0 AND sd.superado=0 AND sd.did = e.didSucursalDistribucion
                WHERE e.superado=0 AND e.elim=0 AND e.did = ?;
            `;

            const rows3 = await executeQuery(dbConnection, sql3, [shipmentId]);

            if (rows3.length > 0) {
                choferAsignado = rows3[0].choferAsignado || 'Sin asignar';
                zonaEntrega = rows3[0].zona || "";
                sucursal = rows3[0].sucursal || "";
            }
        }
        const companyClients = await getClientsByCompany(dbConnection, companyId);
        return {
            cliente: `Cliente ${companyClients[clientId].nombre}`,
            aIngresarHoy,
            ingresadosHoyAPlantaCliente,
            ingresadosHoyChofer: chofer,
            choferAsignado,
            sucursal,
            zonaEntrega
        };

    } catch (error) {
        console.error("Error en informe:", error);
        throw error;
    }
}
