import { executeQuery } from "../../../../db.js";
import { asignar } from "../../functions/asignar.js";
import { insertarPaquete } from "../../functions/insertarPaquete.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";

export async function handleInternalFlex(dbConnection, companyId, userId, profile, dataQr, autoAssign, account) {
    const senderId = dataQr.sender_id;
    const mlShipmentId = dataQr.id;
    let shipmentId;
    let estado_envio;
    let didcliente;
    let didCuenta;
    let resultBuscarEnvio;
    const sql = `
        SELECT did, estado_envio, didCliente, didCuenta
        FROM envios 
        WHERE ml_shipment_id = ? AND ml_vendedor_id = ? 
        LIMIT 1
    `;

    resultBuscarEnvio = await executeQuery(dbConnection, sql, [mlShipmentId, senderId]);

    if (resultBuscarEnvio.length === 0) {
        shipmentId = await insertarPaquete(dbConnection, companyId, account.didCliente, account.didCuenta, dataQr, 1, 0);
        resultBuscarEnvio = await executeQuery(dbConnection, sql, [mlShipmentId, senderId]);
    }
    const row = resultBuscarEnvio[0];

    shipmentId = row.did;
    estado_envio = row.estado_envio;
    didcliente = row.didCliente;
    didCuenta = row.didCuenta;


    if (shipmentId) {
        const sqlColectado = `
            SELECT id, estado 
            FROM envios_historial 
            WHERE didEnvio = ? and elim=0 and superado=0
            LIMIT 1
        `;

        const rowsColectado = await executeQuery(dbConnection, sqlColectado, [shipmentId]);

        if (rowsColectado.length > 0 && rowsColectado[0].estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        }

        // const didpaquete_interno = await insertarPaquete(dbConnection, companyId, didcliente, 0, dataQr, 1, 0,);

        const queryUpdateEnvios = `
                UPDATE envios 
                SET ml_qr_seguridad = ?
                WHERE superado = 0 AND elim = 0 AND did = ?
                LIMIT 1
            `;

        await executeQuery(dbConnection, queryUpdateEnvios, [JSON.stringify(dataQr), shipmentId]);

        await updateLastShipmentState(dbConnection, shipmentId);

        if (autoAssign) {
            await asignar(companyId, userId, profile, dataQr, userId);
        }

        return { estadoRespuesta: true, mensaje: "Paquete insertado y colectado - FLEX" };
    } else {
        if (estado_envio === 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        }

        const localShipmentId = await insertarPaquete(dbConnection, companyId, didcliente, didCuenta, dataQr, 1, 0);

        if (autoAssign) {
            await asignar(companyId, userId, profile, dataQr, userId);
        }

        await sendToShipmentStateMicroService(companyId, userId, localShipmentId, 0, null, null);
        await updateLastShipmentState(dbConnection, localShipmentId);

        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
    }
}