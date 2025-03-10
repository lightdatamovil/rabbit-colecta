import { executeQuery } from "../../../db.js";

export async function updateLastShipmentState(dbConnection, did) {
    try {
        const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const estado = 0;
        const quien = 0;

        const sqlEstado = `
            SELECT estado 
            FROM envios_historial 
            WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;

        const results = await executeQuery(dbConnection, sqlEstado, [did]);

        const estadoActual = results.length > 0 ? results[0].estado : -1;

        if (estadoActual === 5 || estadoActual === 9 || estadoActual === estado) {
            return { estadoRespuesta: false, mensaje: "No se pudo actualizar el estado." };
        }

        const sqlSuperado = `
            UPDATE envios_historial 
            SET superado = 1 
            WHERE superado = 0 AND didEnvio = ?
        `;

        await executeQuery(dbConnection, sqlSuperado, [did]);

        const sqlActualizarEnvios = `
            UPDATE envios 
            SET estado_envio = ? 
            WHERE superado = 0 AND did = ?
        `;

        await executeQuery(dbConnection, sqlActualizarEnvios, [estado, did]);

        const sqlDidCadete = `
            SELECT operador 
            FROM envios_asignaciones 
            WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;

        const cadeteResults = await executeQuery(dbConnection, sqlDidCadete, [did]);

        const didCadete = cadeteResults.length > 0 ? cadeteResults[0].operador : 0;

        const fechaT = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');

        const sqlInsertHistorial = `
            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete) 
            VALUES (?, ?, ?, ?, ?)
        `;

        await executeQuery(dbConnection, sqlInsertHistorial, [did, estado, quien, fechaT, didCadete]);

        return { estadoRespuesta: true, mensaje: "Se guardó correctamente" };
    } catch (error) {
        console.error("Error en updateLastShipmentState:", error);
        throw error;
    }
}