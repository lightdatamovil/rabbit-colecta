import { executeQuery } from "../../../db.js";
import { logRed, logYellow } from "../../../src/funciones/logsCustom.js";
import { checkearEstadoEnvio } from "./checkarEstadoEnvio.js";

export async function updateLastShipmentState(dbConnection, shipmentId) {
    try {
        const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const estado = 0;

        const check = await checkearEstadoEnvio(dbConnection, shipmentId);
        if (check) return check;

        const sqlSuperado = `
            UPDATE envios_historial 
            SET superado = 1 
            WHERE superado = 0 AND didEnvio = ?
        `;
        await executeQuery(dbConnection, sqlSuperado, [shipmentId]);

        const sqlActualizarEnvios = `
            UPDATE envios 
            SET estado_envio = ? 
            WHERE superado = 0 AND did = ?
        `;
        await executeQuery(dbConnection, sqlActualizarEnvios, [estado, shipmentId]);

        const sqlDidCadete = `
            SELECT operador 
            FROM envios_asignaciones 
            WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;
        const cadeteResults = await executeQuery(dbConnection, sqlDidCadete, [shipmentId]);

        const didCadete = cadeteResults.length > 0 ? cadeteResults[0].operador : 0;

        const fechaT = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');

        const sqlInsertHistorial = `
            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete) 
            VALUES (?, ?, ?, ?, ?)
        `;
        await executeQuery(dbConnection, sqlInsertHistorial, [shipmentId, estado, didCadete, fechaT, didCadete]);
    } catch (error) {
        logRed(`Error en updateLastShipmentState: ${error.message}`);
        throw error;
    }
}