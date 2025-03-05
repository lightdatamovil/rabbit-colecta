import { executeQuery } from "../../../db.js";

export async function insertEnviosExteriores(dbConnection, localShipmentId, externalShipmentId, flex, externalName, externalCompanyId) {
    const queryInsertEnviosExteriores = `
        INSERT INTO envios_exteriores (didLocal, didExterno, flex, cliente, didEmpresa)
        VALUES (?, ?, ?, ?, ?)
    `;

    try {
        const result = await executeQuery(
            dbConnection,
            queryInsertEnviosExteriores,
            [localShipmentId, externalShipmentId, flex, externalName, externalCompanyId],
        );

        return result.insertId;
    } catch (error) {
        console.error("Error en insertEnviosExteriores:", error);
        throw error;
    }
}