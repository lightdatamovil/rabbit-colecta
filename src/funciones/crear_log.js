import { executeQuery } from '../../db.js';
export async function crearLog(idEmpresa, operador, shipmentId, endpoint, result, quien, conLocal, error, modelo, marca, versionAndroid, versionApp) {
    if (shipmentId == null || shipmentId == undefined) {
        shipmentId = 0
    }
    try {
        const fechaunix = Date.now();
        const sqlLog = `INSERT INTO logs (didempresa,didEnvio, quien, cadete, data, fechaunix,procesado,error) VALUES (?,?, ?, ?, ?, ?, ?,?)`;

        const values = [idEmpresa, shipmentId, quien, operador, JSON.stringify(result), fechaunix, endpoint, error];

        await executeQuery(conLocal, sqlLog, values);

    } catch (error) {
        console.error("Error al crear log:", error);
        throw error;
    }

}
