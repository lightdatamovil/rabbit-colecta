import { executeQuery } from "../../../db.js";
import { logRed } from "../../../src/funciones/logsCustom.js";

export async function insertEnviosExteriores(dbConnection, internoShipmentId, externalShipmentId, flex, externalName, externalCompanyId) {
    try {
        const queryInsertEnviosExteriores = `
            INSERT INTO envios_exteriores (didLocal, didExterno, flex, cliente, didEmpresa)
            VALUES (?, ?, ?, ?, ?)
        `;

        const result = await executeQuery(
            dbConnection,
            queryInsertEnviosExteriores,
            [
                internoShipmentId,
                externalShipmentId,
                flex,
                externalName,
                externalCompanyId,
            ],
        );

        return result.insertId;
    } catch (error) {
        logRed("Error en insertEnviosExteriores:", error);
        throw error;
    }
}