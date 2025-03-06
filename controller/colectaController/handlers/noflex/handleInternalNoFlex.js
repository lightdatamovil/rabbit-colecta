import { executeQuery } from "../../../../db.js";
import { asignar } from "../../functions/asignar.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";

export async function handleInternalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign) {
    try {
        const didenvioPaquete = dataQr.did;

        const querySelectEnvios = `SELECT estado_envio, choferAsignado FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;

        if (estadoActual === 5 || estadoActual === 9 || estadoActual === 8 || estadoActual === 0) {
            return { estadoRespuesta: false, mensaje: "yA FUE ENTREGADO O CANCELADO O ESTA COKECTADI" };
        }

        const shipmentState = await executeQuery(dbConnection, querySelectEnvios, [didenvioPaquete]);

        const yaEstaAsignado = shipmentState[0].choferAsignado == userId;

        if (shipmentState.length === 0) {
            return { estadoRespuesta: false, mensaje: "Paquete no encontrado - NOFLEX" };
        }

        const querySelectEnviosHistorial = `SELECT estado FROM envios_historial WHERE didEnvio = ? AND estado = 0`;

        const estado = await executeQuery(dbConnection, querySelectEnviosHistorial, [didenvioPaquete]);

        if (estado.length > 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - NOFLEX" };
        }

        if (autoAssign && !yaEstaAsignado) {
            await asignar(companyId, userId, profile, dataQr, userId);
        }

        await sendToShipmentStateMicroService(companyId, userId, didenvioPaquete, 0, null, null);

        await updateLastShipmentState(dbConnection, didenvioPaquete);

        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - NOFLEX" };

    } catch (error) {
        console.error("Error en handleInternoNoFlex:", error);
        throw error;
    }
}