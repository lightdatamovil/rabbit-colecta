import { executeQuery, getClientsByCompany, getCompanyById, getProdDbConfig } from "../../../../db.js";
import { asignar } from "../../functions/asignar.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import mysql from "mysql";
import { insertarPaquete } from "../../functions/insertarPaquete.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { informePro } from "../../functions/informePro.js";

export async function handleExternalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign) {
    try {
        const shipmentIdFromDataQr = dataQr.did;

        const externalCompany = await getCompanyById(dataQr.empresa);

        const dbConfigExt = getProdDbConfig(externalCompany);
        const externalDbConnection = mysql.createConnection(dbConfigExt);
        externalDbConnection.connect();

        const check = await checkearEstadoEnvio(externalDbConnection, shipmentIdFromDataQr);
        if (check) return check;

        const querySelectEnviosExteriores = 'SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?';
        const paqueteExterno = await executeQuery(dbConnection, querySelectEnviosExteriores, [shipmentIdFromDataQr, companyId]);

        if (paqueteExterno.length > 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya fue colectado" };
        }

        const companyClientList = await getClientsByCompany(externalDbConnection, externalCompany);

        const client = companyClientList[dataQr.cliente];

        const didinterno = await insertarPaquete(
            dbConnection,
            externalCompany.did,
            client.did,
            0,
            { id: "", sender_id: "" },
            0,
            1,
        );

        await insertEnviosExteriores(
            dbConnection,
            didinterno,
            shipmentIdFromDataQr,
            0,
            client.nombre || "",
            companyId,
        );

        await updateLastShipmentState(dbConnection, didinterno);
        await updateLastShipmentState(externalDbConnection, shipmentIdFromDataQr);
        await sendToShipmentStateMicroService(companyId, userId, didinterno);
        await sendToShipmentStateMicroService(dataQr.empresa, chofer[0].usuario, shipmentIdFromDataQr);

        const querySelectSistemUsuariosAccesos = 'SELECT usuario FROM sistema_usuarios_accesos WHERE codvinculacion = ?';

        const company = await getCompanyById(companyId);

        const chofer = await executeQuery(externalDbConnection, querySelectSistemUsuariosAccesos, [company.codigo]);

        externalDbConnection.end();

        if (chofer.length > 0) {

            await asignar(dataQr.empresa, userId, profile, dataQr, chofer[0].usuario);

            if (autoAssign) {
                const dqr = {
                    interno: dataQr.interno,
                    did: didinterno,
                    cliente: dataQr.cliente,
                    empresa: companyId
                };

                await asignar(companyId, userId, profile, dqr, userId);
            }
        }

        return { estadoRespuesta: true, mensaje: "Paquete colectado con exito" };
    } catch (error) {
        console.error("Error en handleExternalNoFlex:", error);
        throw error;
    }
}
async function checkearEstadoEnvio(dbConnection, shipmentId) {
    const querySelectEstadoEnvio = 'SELECT estado_envio FROM envios WHERE did = ? LIMIT 1';

    const estado = await executeQuery(dbConnection, querySelectEstadoEnvio, [shipmentId]);

    if (estado.length > 0) {
        if (estado[0].estado_envio == 5 || estado[0].estado_envio == 9 || estado[0].estado_envio == 8) {
            return { estadoRespuesta: false, mensaje: "El paquete ya fue entregado o cancelado" };
        }
        if (estado[0].estado_envio == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado" };
        }
    }
}