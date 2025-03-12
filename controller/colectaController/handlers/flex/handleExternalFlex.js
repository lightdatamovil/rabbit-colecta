import { executeQuery, getProdDbConfig, getCompanyByCode } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import mysql from 'mysql';
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js"

/// Esta funcion busca las logisticas vinculadas
/// Reviso si el envío ya fue colectado cancelado o entregado en la logística externa
/// Si el envio existe, tomo el did
/// Si no existe, lo inserto y tomo el did
/// Tomo los datos de los clientes de la logística externa para luego insertar los envios
/// Inserto el envio en la tabla envios y envios exteriores de la logística interna
/// Actualizo el estado del envío y lo envío al microservicio de estados en la logística interna
/// Actualizo el estado del envío y lo envío al microservicio de estados en la logística externa
export async function handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign,) {
    const senderid = dataQr.sender_id;
    const shipmentId = dataQr.id;
    const codLocal = company.codigo;

    // Se llama logisticas y se toman de la tabla de clientes porque al vincularlas se crea un
    // cliente con el código de vinculación
    const queryLogisticasExternas = `
            SELECT did, nombre_fantasia, codigoVinculacionLogE 
            FROM clientes 
            WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
        `;
    const logisticasExternas = await executeQuery(dbConnection, queryLogisticasExternas);

    /// Por cada logística externa
    for (const logistica of logisticasExternas) {
        const externalLogisticId = logistica.did;
        const nombreFantasia = logistica.nombre_fantasia;
        const syncCode = logistica.codigoVinculacionLogE;

        const externalCompany = await getCompanyByCode(syncCode);
        const externalCompanyId = externalCompany.did;

        /// Me conecto a la base de datos de la logística externa
        const dbConfigExt = getProdDbConfig(externalCompany);
        const externalDbConnection = mysql.createConnection(dbConfigExt);
        externalDbConnection.connect();

        /// Busco el envío
        const sqlEnvios = `
                        SELECT did,didCliente
                        FROM envios 
                        WHERE ml_shipment_id = ? AND ml_vendedor_id = ? 
                        LIMIT 1
                    `;
        let rowsEnvios = await executeQuery(externalDbConnection, sqlEnvios, [shipmentId, senderid]);
        console.log(rowsEnvios, "row");

        let externalShipmentId;
        let clienteExt;

        /// Si existe el envío, tomo el did
        if (rowsEnvios.length > 0) {
            externalShipmentId = rowsEnvios[0].did;
            clienteExt = rowsEnvios[0].didCliente;

            /// Si no existe, lo inserto y tomo el did
        } else {
            /// Tomo los datos del cliente de la logística externa
            const sqlCuentas = `
                SELECT did, didCliente 
                FROM clientes_cuentas 
                WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
            `;
            const rowsCuentas = await executeQuery(externalDbConnection, sqlCuentas, [senderid]);

            if (rowsCuentas.length == 0) {
                externalDbConnection.end();

                return { estadoRespuesta: false, mensaje: "No se encontró cuenta asociada" };
            }

            const didcliente_ext = rowsCuentas[0].didCliente;
            const didcuenta_ext = rowsCuentas[0].did;

            const result = await insertEnvios(externalDbConnection, externalCompanyId, didcliente_ext, didcuenta_ext, dataQr, 1, 0);

            rowsEnvios = await executeQuery(externalDbConnection, sqlEnvios, [result, senderid]);

            externalShipmentId = rowsEnvios[0].did;

        }

        /// Chequeo si el envío ya fue colectado cancelado o entregado
        const check = await checkearEstadoEnvio(externalDbConnection, externalShipmentId);
        if (check) {
            externalDbConnection.end();

            return check;
        };

        /// Busco si el chofer está asignado
        const driver = await checkIfExistLogisticAsDriverInExternalCompany(externalDbConnection, codLocal);
        console.log(driver, "aaa");
        console.log(syncCode, "codigo");


        if (!driver) {
            externalDbConnection.end();

            return { estadoRespuesta: false, mensaje: "No se encontró chofer asignado" };
        }

        /// Inserto en envios y en envios exteriores de la logistica interna
        const internalShipmentId = await insertEnvios(dbConnection, company.did, externalLogisticId, 0, dataQr, 1, 1,);
        await insertEnviosExteriores(dbConnection, externalShipmentId, internalShipmentId, 1, nombreFantasia, externalCompanyId);

        /// Actualizo el estado del envío y lo envío al microservicio de estados en la logística interna
        await updateLastShipmentState(dbConnection, internalShipmentId);
        await sendToShipmentStateMicroService(company.did, userId, internalShipmentId);

        /// Actualizo el estado del envío y lo envío al microservicio de estados en la logística externa
        await updateLastShipmentState(externalDbConnection, externalShipmentId);
        await sendToShipmentStateMicroService(externalCompanyId, clienteExt, externalShipmentId);

        if (autoAssign) {
            const dqr = {
                did: internalShipmentId,
                empresa: company.did,
                local: 1,
                cliente: externalLogisticId,
            };
            /// Asigno el envío a la logística interna y a la logística externa
            await assign(company.did, userId, profile, dqr, userId);
            await assign(externalCompany.did, userId, profile, dataQr, driver);
        }

        externalDbConnection.end();

        const body = await informe(dbConnection, clienteExt, userId, internalShipmentId);
        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX", body: body };

    }
}