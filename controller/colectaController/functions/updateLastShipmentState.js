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
        console.log("1");
        console.log(did,"did");
        
        const results = await executeQuery(dbConnection, sqlEstado, [Number(did)]);
        console.log("2");
        const estadoActual = results.length > 0 ? results[0].estado : -1;

        if (estadoActual === 5 || estadoActual === 9 || estadoActual === estado) {
            return { estadoRespuesta: false, mensaje: "No se pudo actualizar el estado." };
        }
        console.log("3");
        const sqlSuperado = `
            UPDATE envios_historial 
            SET superado = 1 
            WHERE superado = 0 AND didEnvio = ?
        `;

        await executeQuery(dbConnection, sqlSuperado, [did]);
        console.log("4");
        const sqlActualizarEnvios = `
            UPDATE envios 
            SET estado_envio = ? 
            WHERE superado = 0 AND did = ?
        `;
console.log("5");

        await executeQuery(dbConnection, sqlActualizarEnvios, [estado, did]);

        const sqlDidCadete = `
            SELECT operador 
            FROM envios_asignaciones 
            WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;
        console.log("5.5");
        const cadeteResults = await executeQuery(dbConnection, sqlDidCadete, [did]);
        console.log("6");
        const didCadete = cadeteResults.length > 0 ? cadeteResults[0].operador : 0;

        const fechaT = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');

        const sqlInsertHistorial = `
            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete) 
            VALUES (?, ?, ?, ?, ?)
        `;
        console.log("7");
        await executeQuery(dbConnection, sqlInsertHistorial, [did, estado, quien, fechaT, didCadete]);
        console.log("8");
        return { estadoRespuesta: true, mensaje: "Se guardó correctamente" };
    } catch (error) {
        console.error("Error en updateLastShipmentState:", error);
        throw error;
    }
}