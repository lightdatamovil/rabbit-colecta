import { executeQuery } from "../../../db.js";

export async function insertoDataQR(dbConnection, shipmentId, dataQr) {
    const queryUpdateEnvios = `
        UPDATE envios 
        SET ml_qr_seguridad = ?
        WHERE superado = 0 AND elim = 0 AND did = ?
        LIMIT 1
    `;

    try {
        const result = await executeQuery(dbConnection, queryUpdateEnvios, [dataQr, shipmentId]);

        return result.affectedRows > 0;
    } catch (error) {
        console.error("Error en insertoDataQR:", error);
        throw error;
    }
}