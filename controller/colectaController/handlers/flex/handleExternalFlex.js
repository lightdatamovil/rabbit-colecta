import { executeQuery, getProdDbConfig, getCompanyByCode } from "../../../../db.js";
import { asignar } from "../../functions/asignar.js";
import mysql from 'mysql';
import { insertarPaquete } from "../../functions/insertarPaquete.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";

export async function handleExternalFlex(dbConnection, companyId, userId, profile, dataQr, autoAssign) {

    const senderid = dataQr.sender_id;
    const idshipment = dataQr.id;

    let didcliente = -1;
    let didpaquete = -1;
    let estado_envio = -1;
    let paquetecargado = false;

    if (didpaquete !== -1) {
        const sqlColectado = `
            SELECT id, estado 
            FROM envios_historial 
            WHERE didEnvio = ? and elim=0 LIMIT 1
        `;

        const rowsColectado = await executeQuery(dbConnection, sqlColectado, [didpaquete]);

        if (rowsColectado.length > 0 && rowsColectado[0].estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        }
    }

    if (didcliente === -1) {
        const sqlExternas = `
            SELECT did, nombre_fantasia, codigoVinculacionLogE 
            FROM clientes 
            WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
        `;

        const rowsExternas = await executeQuery(dbConnection, sqlExternas);

        for (const clienteexterno of rowsExternas) {
            const codigovinculacion = clienteexterno.codigoVinculacionLogE;

            const externalCompany = await getCompanyByCode(codigovinculacion);

            const dbConfigExt = getProdDbConfig(externalCompany);
            const dbConnectionExt = mysql.createConnection(dbConfigExt);
            dbConnectionExt.connect();

            const didclienteInterno_ext = clienteexterno.did;

            const idempresaExterna = externalCompany.did;
            const nombre_fantasia = clienteexterno.nombre_fantasia;

            const sqlCuentas = `
                    SELECT did, didCliente 
                    FROM clientes_cuentas 
                    WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
                `;

            const rowsCuentas = await executeQuery(dbConnectionExt, sqlCuentas, [senderid]);

            if (rowsCuentas.length > 0) {
                const didcliente_ext = rowsCuentas[0].didCliente;
                const didcuenta_ext = rowsCuentas[0].did;

                const sqlEnvios = `
                        SELECT did, estado_envio, didCliente, didCuenta 
                        FROM envios 
                        WHERE ml_shipment_id = ? AND ml_vendedor_id = ? 
                        LIMIT 1
                    `;

                let rowsEnvios = await executeQuery(dbConnectionExt, sqlEnvios, [idshipment, senderid]);

                let externalShipmentId = -1;
                if (rowsEnvios.length > 0) {
                    externalShipmentId = rowsEnvios[0].did;
                } else {
                    externalShipmentId = await insertarPaquete(dbConnectionExt, idempresaExterna, didcliente_ext, didcuenta_ext, dataQr, 1, 0);

                    rowsEnvios = await executeQuery(dbConnectionExt, sqlEnvios, [idshipment, senderid]);
                    rowsEnvios[0].estado_envio = -1;
                }

                if (rowsEnvios[0].estado_envio === 0) {
                    return { estadoRespuesta: false, mensaje: "Paquete ya colectado" };
                }

                if (externalShipmentId !== -1) {
                    const didpaquete_interno = await insertarPaquete(dbConnection, companyId, didclienteInterno_ext, 0, dataQr, 1, 1,);
                    await insertEnviosExteriores(dbConnection, externalShipmentId, didpaquete_interno, 1, nombre_fantasia, idempresaExterna);

                    const sqlChofer = `
                            SELECT usuario 
                            FROM sistema_usuarios_accesos 
                            WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                        `;

                    const rowsChofer = await executeQuery(dbConnectionExt, sqlChofer, ["cogote"]);

                    const didchofer = rowsChofer.length > 0 ? rowsChofer[0].usuario : -1;

                    if (didchofer > -1) {
                        await updateLastShipmentState(dbConnection, didpaquete_interno);
                        await updateLastShipmentState(dbConnectionExt, externalShipmentId);

                        if (autoAssign) {
                            const dqr = {
                                did: didpaquete_interno,
                                empresa: companyId,
                                local: 1,
                                cliente: didclienteInterno_ext,
                            };
                            await asignar(companyId, userId, profile, dqr, userId);
                            await asignar(externalCompany.did, userId, profile, dataQr, didchofer);
                        }

                        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
                    }
                }
            }
        }
    } else if (!paquetecargado) {
        if (estado_envio === 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        } else {
            if (autoAssign) {
                await asignar(companyId, userId, profile, dataQr, userId, "jaja");
            }

            await sendToShipmentStateMicroService(dbConnection, didpaquete);

            return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };

        }
    } else {
        const didpaquete_interno = await insertarPaquete(dbConnection, companyId, didcliente, 0, dataQr, 1, 0,);

        const queryUpdateEnvios = `
                UPDATE envios 
                SET ml_qr_seguridad = ?
                WHERE superado = 0 AND elim = 0 AND did = ?
                LIMIT 1
            `;

        await executeQuery(dbConnection, queryUpdateEnvios, [dataQr, didpaquete_interno]);


        await sendToShipmentStateMicroService(dbConnection, didpaquete);
        if (autoAssign) {
            await asignar(companyId, userId, profile, dataQr, userId, "kaka");
        }

        return { estadoRespuesta: true, mensaje: "Paquete insertado y colectado - FLEX" };
    }
}