import { executeQuery } from "../../../db.js";

export async function insertEnviosExteriores(dbConnection, internoShipmentId, externalShipmentId, flex, externalName, externalCompanyId) {
    try {
        const queryInsertEnviosExteriores = `
            INSERT INTO envios_exteriores (didInterno, didExterno, flex, cliente, didEmpresa)
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
        console.error("Error en insertEnviosExteriores:", error);
        throw error;
    }
}