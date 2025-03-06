import { executeQuery } from "../../../../db.js";
import { asignar } from "../../functions/asignar.js";
import { insertarPaquete } from "../../functions/insertarPaquete.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";

export async function handleInternalFlex(dbConnection, companyId, userId, profile, dataQr, autoAssign) {
    const senderId = dataQr.sender_id;
    const mlShipmentId = dataQr.id;

    const sql = `
        SELECT did, estado_envio, didCliente, didCuenta
        FROM envios 
        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
        LIMIT 1
    `;
    const result = await executeQuery(dbConnection, sql, [mlShipmentId, senderId]);

    if (result.length === 0) {
        return { estadoRespuesta: false, mensaje: "No se encontró el paquete - FLEX" };
    }

    const row = result[0];

    const shipmentId = row.did;
    const estado_envio = row.estado_envio;
    const didcliente = row.didCliente;
    const didCuenta = row.didCuenta;

    if (shipmentId) {
        const sqlColectado = `
            SELECT id, estado 
            FROM envios_historial 
            WHERE didEnvio = ? LIMIT 1
        `;
        const rowsColectado = await executeQuery(dbConnection, sqlColectado, [shipmentId]);

        if (rowsColectado.length > 0 && rowsColectado[0].estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        }

        const didpaquete_interno = await insertarPaquete(dbConnection, companyId, didcliente, 0, dataQr, 1, 0,);

        const queryUpdateEnvios = `
                UPDATE envios 
                SET ml_qr_seguridad = ?
                WHERE superado = 0 AND elim = 0 AND did = ?
                LIMIT 1
            `;

        await executeQuery(dbConnection, queryUpdateEnvios, [JSON.stringify(dataQr), didpaquete_interno]);

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