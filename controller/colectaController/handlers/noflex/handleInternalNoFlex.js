import { executeQuery } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";

/// Esta funcion checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer asignado al envio
/// Si el envio no esta asignado y se quiere autoasignar, lo asigna
/// Actualiza el estado del envio en el micro servicio
/// Actualiza el estado del envio en la base de datos
export async function handleInternalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign) {
    try {
        const shipmentId = dataQr.did;

        /// Chequeo si el envio ya fue colectado, entregado o cancelado
        await checkearEstadoEnvio(dbConnection, shipmentId);

        /// Busco el estado del envio y el chofer asignado
        const querySelectEnvios = `SELECT choferAsignado FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;
        const resultChoferAsignado = await executeQuery(dbConnection, querySelectEnvios, [shipmentId]);

        /// Si no encuentro el envio mando error
        if (resultChoferAsignado.length === 0) {
            return { estadoRespuesta: false, mensaje: "Paquete no encontrado" };
        }

        const isAlreadyAssigned = resultChoferAsignado[0].choferAsignado == userId;

        /// Si el envio no esta asignado y se quiere autoasignar, lo asigno
        if (!isAlreadyAssigned && autoAssign) {
            await assign(companyId, userId, profile, dataQr, userId);
        }

        /// Actualizamos el estado del envio en el micro servicio
        await sendToShipmentStateMicroService(companyId, userId, shipmentId, 0, null, null);

        /// Actualizamos el estado del envio en la base de datos
        await updateLastShipmentState(dbConnection, shipmentId);

        const body = informe(dbConnection, userId);
        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente", body: body };
    } catch (error) {
        console.error("Error en handleInternoNoFlex:", error);
        throw error;
    }
}