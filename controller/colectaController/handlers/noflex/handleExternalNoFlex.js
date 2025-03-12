import { getClientsByCompany, getCompanyById, getProdDbConfig } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import mysql from "mysql";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js";
import { logRed } from "../../../../src/funciones/logsCustom.js";

/// Esta funcion se conecta a la base de datos de la empresa externa
/// Checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer que se crea en la vinculacion de logisticas
/// Con ese chofer inserto en envios y envios exteriores de la empresa interna
/// Asigno a la empresa externa
/// Si es autoasignacion, asigno a la empresa interna
/// Actualizo el estado del envio a colectado y envio el estado del envio en los microservicios
export async function handleExternalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign) {
    try {
        const shipmentIdFromDataQr = dataQr.did;
        const clientIdFromDataQr = dataQr.cliente;

        /// Busco la empresa externa
        const externalCompany = await getCompanyById(dataQr.empresa);

        /// Conecto a la base de datos de la empresa externa
        const dbConfigExt = getProdDbConfig(externalCompany);
        const externalDbConnection = mysql.createConnection(dbConfigExt);
        externalDbConnection.connect();

        /// Chequeo si el envio ya fue colectado, entregado o cancelado
        const check = await checkearEstadoEnvio(externalDbConnection, shipmentIdFromDataQr);
        if (check) {
            externalDbConnection.end();

            return check;
        }

        const companyClientList = await getClientsByCompany(externalDbConnection, externalCompany.did);
        const client = companyClientList[clientIdFromDataQr];

        const internalCompany = await getCompanyById(companyId);

        /// Busco el chofer que se crea en la vinculacion de logisticas
        const driver = await checkIfExistLogisticAsDriverInExternalCompany(externalDbConnection, internalCompany.codigo);
        if (!driver) {
            externalDbConnection.end();

            return { estadoRespuesta: false, mensaje: "No se encontró chofer asignado" };
        }

        /// Inserto en envios en la empresa interna
        const didinterno = await insertEnvios(
            dbConnection,
            companyId,
            client.did,
            0,
            { id: "", sender_id: "" },
            0,
            1,
            driver
        );

        /// Inserto en envios exteriores en la empresa interna
        await insertEnviosExteriores(
            dbConnection,
            didinterno,
            shipmentIdFromDataQr,
            0,
            client.nombre || "",
            externalCompany.did,
        );

        // Asigno a la empresa externa
        await assign(dataQr.empresa, userId, profile, dataQr, driver);

        if (autoAssign) {
            const dqr = {
                interno: dataQr.interno,
                did: didinterno,
                cliente: clientIdFromDataQr,
                empresa: companyId,
            };

            // Asigno a la empresa interna
            await assign(companyId, userId, profile, dqr, userId);
        }

        await updateLastShipmentState(dbConnection, didinterno);
        await sendToShipmentStateMicroService(companyId, userId, didinterno);

        await updateLastShipmentState(externalDbConnection, shipmentIdFromDataQr);
        await sendToShipmentStateMicroService(dataQr.empresa, driver, shipmentIdFromDataQr);

        const body = await informe(externalDbConnection, clientIdFromDataQr, userId, didinterno);

        externalDbConnection.end();

        return { estadoRespuesta: true, mensaje: "Paquete colectado con exito", body: body };
    } catch (error) {
        logRed("Error en handleExternalNoFlex:", error);
        throw error;
    }
}
